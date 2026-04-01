import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type TriggerType =
  | 'POWER_ON'
  | 'CHANGE_APP'
  | 'OPEN_APP'
  | 'CATALOG_OPEN'
  | 'SCHEDULED'
  | 'MANUAL';

export type AdTier = 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';

export interface DecisionRequest {
  screenId: string;
  triggerType: TriggerType;
  timestamp: Date;
}

export interface DecisionPayload {
  screenId: string;
  triggerType: TriggerType;
  timestamp: string;
  ads: RankedAd[];
  fallbackHouseAds: RankedAd[];
  meta: {
    totalCandidates: number;
    eligible: number;
    capped: number;
    cooledDown: number;
    computeTimeMs: number;
  };
}

export interface RankedAd {
  campaignId: string;
  creativeId: string;
  advertiserId: string;
  advertiserName: string;
  fileUrl: string;
  fileHash: string;
  durationMs: number;
  mimeType: string;
  width: number;
  height: number;
  tier: AdTier;
  score: number;
  canSkipAfterMs: number;
}

interface CampaignCandidate {
  campaignId: string;
  advertiserId: string;
  advertiserName: string;
  tier: AdTier;
  priority: number;
  startDate: Date;
  endDate: Date;
  budgetCents: number;
  spentCents: number;
  creative: {
    id: string;
    fileUrl: string;
    fileHash: string | null;
    durationMs: number | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
  };
  // Placement state
  playsToday: number;
  playsThisHour: number;
  lastPlayedAt: Date | null;
  cooldownUntil: Date | null;
  maxPlaysPerHour: number;
  maxPlaysPerDay: number;
}

// ═══════════════════════════════════════════════════════════════
// SCORING CONSTANTS
// ═══════════════════════════════════════════════════════════════

const TIER_WEIGHTS: Record<AdTier, number> = {
  FORCED: 100000,
  PREMIUM: 10000,
  STANDARD: 1000,
  HOUSE: 0,
};

const TRIGGER_BONUSES: Record<TriggerType, number> = {
  POWER_ON: 100,
  CATALOG_OPEN: 80,
  OPEN_APP: 50,
  CHANGE_APP: 30,
  SCHEDULED: 0,
  MANUAL: 0,
};

const MAX_ADS_PER_DECISION = 10;
const COOLDOWN_MS = 300_000; // 5 minutes
const MAX_ADVERTISERS_PER_SCREEN = 40;
const DEFAULT_SKIP_DELAY_MS = 7000;

// ═══════════════════════════════════════════════════════════════
// ADS SCHEDULER — PURE FUNCTION ENGINE
// ═══════════════════════════════════════════════════════════════

@Injectable()
export class AdsSchedulerService {
  private readonly logger = new Logger(AdsSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Core decision function — pure logic.
   * Given a screenId and trigger, returns the optimal ad selection.
   */
  async getDecision(request: DecisionRequest): Promise<DecisionPayload> {
    const start = Date.now();
    const { screenId, triggerType, timestamp } = request;

    // 1. Load all campaign candidates for this screen
    const candidates = await this.loadCandidates(screenId, timestamp);

    // 2. Filter eligible
    const { eligible, capped, cooledDown } = this.filterCandidates(
      candidates,
      timestamp,
    );

    // 3. Enforce max 40 advertisers
    const advertisersLimited = this.enforceAdvertiserCap(eligible);

    // 4. Enforce no consecutive same advertiser
    const noConsecutive = this.enforceNoConsecutive(advertisersLimited);

    // 5. Score all
    const scored = this.scoreAll(noConsecutive, triggerType, timestamp);

    // 6. Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // 7. Split into premium/standard pools and apply ratio
    const { selected, houseAds } = this.applyTierSplit(scored);

    // 8. Build final response
    const ads = selected.slice(0, MAX_ADS_PER_DECISION);
    const computeTimeMs = Date.now() - start;

    return {
      screenId,
      triggerType,
      timestamp: timestamp.toISOString(),
      ads,
      fallbackHouseAds: houseAds,
      meta: {
        totalCandidates: candidates.length,
        eligible: eligible.length,
        capped,
        cooledDown,
        computeTimeMs,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 1: Load candidates
  // ─────────────────────────────────────────────────────────────

  private async loadCandidates(
    screenId: string,
    now: Date,
  ): Promise<CampaignCandidate[]> {
    // Get screen to find targeting
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        environment: true,
        partnerOrgId: true,
      },
    });

    if (!screen) return [];

    // Find campaigns that:
    // - Are ACTIVE
    // - Have date window covering now
    // - Have READY creatives
    // - Target this screen (or have no screen filter)
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        creatives: {
          some: { status: 'READY', isApproved: true },
        },
      },
      include: {
        targeting: {
          include: {
            includedScreens: { select: { id: true } },
            excludedScreens: { select: { id: true } },
          },
        },
        creatives: {
          where: { status: 'READY', isApproved: true },
          select: {
            id: true,
            fileUrl: true,
            fileHash: true,
            durationMs: true,
            mimeType: true,
            width: true,
            height: true,
          },
        },
        advertiserOrg: {
          select: { id: true, name: true },
        },
      },
    });

    // Load existing placements for frequency data
    const placements = await this.prisma.adPlacement.findMany({
      where: { screenId },
      select: {
        campaignId: true,
        playsToday: true,
        playsThisHour: true,
        lastPlayedAt: true,
        cooldownUntil: true,
        maxPlaysPerHour: true,
        maxPlaysPerDay: true,
        tier: true,
        priority: true,
      },
    });

    const placementMap = new Map(
      placements.map((p) => [p.campaignId, p]),
    );

    const results: CampaignCandidate[] = [];

    for (const campaign of campaigns) {
      const targeting = campaign.targeting;

      // Screen exclusion check
      if (targeting?.excludedScreens.some((s) => s.id === screenId)) continue;

      // Screen inclusion check (if specified, must be in list)
      if (
        targeting?.includedScreens.length &&
        !targeting.includedScreens.some((s) => s.id === screenId)
      )
        continue;

      // Environment check
      if (
        targeting?.environments?.length &&
        !targeting.environments.includes(screen.environment)
      )
        continue;

      // Geo check (haversine)
      if (
        targeting?.geoRadiusKm &&
        targeting.geoLatitude != null &&
        targeting.geoLongitude != null &&
        screen.latitude != null &&
        screen.longitude != null
      ) {
        const dist = haversine(
          screen.latitude,
          screen.longitude,
          targeting.geoLatitude,
          targeting.geoLongitude,
        );
        if (dist > targeting.geoRadiusKm) continue;
      }

      // Pick best creative
      const creative = campaign.creatives[0];
      if (!creative) continue;

      const placement = placementMap.get(campaign.id);
      const tier = deriveTier(campaign.budgetCents);

      results.push({
        campaignId: campaign.id,
        advertiserId: campaign.advertiserOrg.id,
        advertiserName: campaign.advertiserOrg.name,
        tier,
        priority: derivePriority(campaign.budgetCents),
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        budgetCents: campaign.budgetCents,
        spentCents: campaign.spentCents,
        creative: {
          id: creative.id,
          fileUrl: creative.fileUrl,
          fileHash: creative.fileHash,
          durationMs: creative.durationMs,
          mimeType: creative.mimeType,
          width: creative.width,
          height: creative.height,
        },
        playsToday: placement?.playsToday ?? 0,
        playsThisHour: placement?.playsThisHour ?? 0,
        lastPlayedAt: placement?.lastPlayedAt ?? null,
        cooldownUntil: placement?.cooldownUntil ?? null,
        maxPlaysPerHour: placement?.maxPlaysPerHour ?? 10,
        maxPlaysPerDay: placement?.maxPlaysPerDay ?? 100,
      });
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 2: Filter candidates
  // ─────────────────────────────────────────────────────────────

  private filterCandidates(
    candidates: CampaignCandidate[],
    now: Date,
  ): {
    eligible: CampaignCandidate[];
    capped: number;
    cooledDown: number;
  } {
    const eligible: CampaignCandidate[] = [];
    let capped = 0;
    let cooledDown = 0;

    for (const c of candidates) {
      // Budget check
      if (c.spentCents >= c.budgetCents) {
        capped++;
        continue;
      }

      // Frequency cap: hourly
      if (c.playsThisHour >= c.maxPlaysPerHour) {
        capped++;
        continue;
      }

      // Frequency cap: daily
      if (c.playsToday >= c.maxPlaysPerDay) {
        capped++;
        continue;
      }

      // Cooldown check
      if (c.cooldownUntil && c.cooldownUntil > now) {
        cooledDown++;
        continue;
      }

      eligible.push(c);
    }

    return { eligible, capped, cooledDown };
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 3: Enforce max 40 advertisers
  // ─────────────────────────────────────────────────────────────

  private enforceAdvertiserCap(
    candidates: CampaignCandidate[],
  ): CampaignCandidate[] {
    const advMap = new Map<string, CampaignCandidate[]>();

    for (const c of candidates) {
      const list = advMap.get(c.advertiserId) ?? [];
      list.push(c);
      advMap.set(c.advertiserId, list);
    }

    if (advMap.size <= MAX_ADVERTISERS_PER_SCREEN) return candidates;

    // Keep top 40 advertisers by max priority
    const ranked = [...advMap.entries()]
      .map(([advId, campaigns]) => ({
        advId,
        campaigns,
        maxPriority: Math.max(...campaigns.map((c) => c.priority)),
      }))
      .sort((a, b) => b.maxPriority - a.maxPriority)
      .slice(0, MAX_ADVERTISERS_PER_SCREEN);

    return ranked.flatMap((r) => r.campaigns);
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 4: No consecutive same advertiser
  // ─────────────────────────────────────────────────────────────

  private enforceNoConsecutive(
    candidates: CampaignCandidate[],
  ): CampaignCandidate[] {
    // This is enforced at selection time, not filtering.
    // We just pass through here — the scoring handles it.
    return candidates;
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 5: Score all candidates
  // ─────────────────────────────────────────────────────────────

  private scoreAll(
    candidates: CampaignCandidate[],
    triggerType: TriggerType,
    now: Date,
  ): (CampaignCandidate & { score: number })[] {
    return candidates.map((c) => ({
      ...c,
      score: this.computeScore(c, triggerType, now),
    }));
  }

  private computeScore(
    c: CampaignCandidate,
    triggerType: TriggerType,
    now: Date,
  ): number {
    // Base tier weight
    const tierWeight = TIER_WEIGHTS[c.tier];

    // Priority score (0–10000)
    const priorityScore = c.priority * 100;

    // Pacing score: reward underpaced campaigns (-500 to +500)
    const pacingScore = this.computePacingScore(c);

    // Freshness: reward recently-unseen campaigns (0–200)
    const freshnessScore = this.computeFreshnessScore(c, now);

    // Repetition penalty: penalize overplayed campaigns
    const repetitionPenalty = this.computeRepetitionPenalty(c);

    // Cap penalty: penalize campaigns close to cap
    const capPenalty = this.computeCapPenalty(c);

    // Trigger bonus
    const triggerBonus = TRIGGER_BONUSES[triggerType] ?? 0;

    return (
      tierWeight +
      priorityScore +
      pacingScore +
      freshnessScore -
      repetitionPenalty -
      capPenalty +
      triggerBonus
    );
  }

  private computePacingScore(c: CampaignCandidate): number {
    if (c.budgetCents === 0) return 0;

    const spentRatio = c.spentCents / c.budgetCents;
    const timeRatio = this.getTimeProgress(c.startDate, c.endDate);

    if (timeRatio === 0) return 250; // Just started → boost

    // Underpaced: spent less than expected → positive boost
    // Overpaced: spent more than expected → negative penalty
    const pacingDelta = timeRatio - spentRatio;
    return Math.round(pacingDelta * 500);
  }

  private getTimeProgress(start: Date, end: Date): number {
    const now = Date.now();
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 1;
    const elapsed = now - start.getTime();
    return Math.max(0, Math.min(1, elapsed / total));
  }

  private computeFreshnessScore(
    c: CampaignCandidate,
    now: Date,
  ): number {
    if (!c.lastPlayedAt) return 200; // Never played → max freshness

    const sinceLastPlayMs = now.getTime() - c.lastPlayedAt.getTime();
    const hoursSincePlay = sinceLastPlayMs / 3_600_000;

    if (hoursSincePlay > 6) return 200;
    if (hoursSincePlay > 2) return 150;
    if (hoursSincePlay > 1) return 100;
    if (hoursSincePlay > 0.5) return 50;
    return 0;
  }

  private computeRepetitionPenalty(c: CampaignCandidate): number {
    // More plays today → higher penalty
    if (c.playsToday > 50) return 300;
    if (c.playsToday > 20) return 150;
    if (c.playsToday > 10) return 50;
    return 0;
  }

  private computeCapPenalty(c: CampaignCandidate): number {
    // Close to hourly cap → penalty
    const hourlyRatio = c.playsThisHour / c.maxPlaysPerHour;
    if (hourlyRatio > 0.8) return 200;
    if (hourlyRatio > 0.6) return 100;
    return 0;
  }

  // ─────────────────────────────────────────────────────────────
  // STEP 6: Tier split (Premium/Standard ratio)
  // ─────────────────────────────────────────────────────────────

  private applyTierSplit(
    scored: (CampaignCandidate & { score: number })[],
  ): {
    selected: RankedAd[];
    houseAds: RankedAd[];
  } {
    const forced = scored.filter((c) => c.tier === 'FORCED');
    const premium = scored.filter((c) => c.tier === 'PREMIUM');
    const standard = scored.filter((c) => c.tier === 'STANDARD');
    const house = scored.filter((c) => c.tier === 'HOUSE');

    // Forced always goes first
    const selected: RankedAd[] = forced.map((c) => this.toRankedAd(c));

    // Apply 60/40 split for remaining slots
    const remainingSlots = MAX_ADS_PER_DECISION - selected.length;
    const premiumSlots = Math.ceil(remainingSlots * 0.6);
    const standardSlots = remainingSlots - premiumSlots;

    // Fill premium slots, overflow to standard
    const premiumFill = premium.slice(0, premiumSlots);
    const standardFill = standard.slice(0, standardSlots);

    // If premium underflows, give slots to standard
    const premiumOverflow = premiumSlots - premiumFill.length;
    const extraStandard = standard.slice(
      standardSlots,
      standardSlots + premiumOverflow,
    );

    // If standard underflows, give slots to premium
    const standardOverflow = standardSlots - standardFill.length - extraStandard.length;
    const extraPremium = premium.slice(
      premiumSlots,
      premiumSlots + Math.max(0, standardOverflow),
    );

    // Round-robin interleave premium and standard to avoid consecutive same tier
    const premiumAll = [...premiumFill, ...extraPremium];
    const standardAll = [...standardFill, ...extraStandard];

    const interleaved = this.roundRobinInterleave(premiumAll, standardAll);

    // Enforce no consecutive same advertiser
    const deduped = this.dedupeConsecutiveAdvertiser(interleaved);

    selected.push(...deduped.map((c) => this.toRankedAd(c)));

    const houseAds = house.slice(0, 5).map((c) => this.toRankedAd(c));

    return { selected, houseAds };
  }

  private roundRobinInterleave<T>(a: T[], b: T[]): T[] {
    const result: T[] = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < a.length) result.push(a[i]);
      if (i < b.length) result.push(b[i]);
    }
    return result;
  }

  private dedupeConsecutiveAdvertiser(
    ads: (CampaignCandidate & { score: number })[],
  ): (CampaignCandidate & { score: number })[] {
    if (ads.length <= 1) return ads;

    const result: (CampaignCandidate & { score: number })[] = [ads[0]];
    const deferred: (CampaignCandidate & { score: number })[] = [];

    for (let i = 1; i < ads.length; i++) {
      const prev = result[result.length - 1];
      if (ads[i].advertiserId === prev.advertiserId) {
        deferred.push(ads[i]);
      } else {
        result.push(ads[i]);
      }
    }

    // Re-insert deferred items where possible
    for (const d of deferred) {
      let inserted = false;
      for (let i = 1; i < result.length; i++) {
        const before = result[i - 1];
        const after = result[i];
        if (
          before.advertiserId !== d.advertiserId &&
          after.advertiserId !== d.advertiserId
        ) {
          result.splice(i, 0, d);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        // Append at end if no conflict (or drop if still consecutive)
        const last = result[result.length - 1];
        if (!last || last.advertiserId !== d.advertiserId) {
          result.push(d);
        }
        // else: drop this ad to maintain no-consecutive rule
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  private toRankedAd(
    c: CampaignCandidate & { score: number },
  ): RankedAd {
    return {
      campaignId: c.campaignId,
      creativeId: c.creative.id,
      advertiserId: c.advertiserId,
      advertiserName: c.advertiserName,
      fileUrl: c.creative.fileUrl,
      fileHash: c.creative.fileHash ?? '',
      durationMs: c.creative.durationMs ?? 15000,
      mimeType: c.creative.mimeType ?? 'video/mp4',
      width: c.creative.width ?? 1920,
      height: c.creative.height ?? 1080,
      tier: c.tier,
      score: c.score,
      canSkipAfterMs: DEFAULT_SKIP_DELAY_MS,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CACHE MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Get decision with cache. Cache hit → return cached.
   * Cache miss/expired → compute, store, return.
   */
  async getDecisionCached(
    request: DecisionRequest,
  ): Promise<DecisionPayload> {
    const { screenId } = request;

    // Try cache
    const cached = await this.prisma.adDecisionCache.findUnique({
      where: { screenId },
    });

    if (
      cached &&
      !cached.invalidatedAt &&
      cached.expiresAt > request.timestamp
    ) {
      // Cache hit
      return {
        screenId,
        triggerType: request.triggerType,
        timestamp: request.timestamp.toISOString(),
        ads: cached.decision as unknown as RankedAd[],
        fallbackHouseAds: [],
        meta: {
          totalCandidates: 0,
          eligible: 0,
          capped: 0,
          cooledDown: 0,
          computeTimeMs: 0,
        },
      };
    }

    // Cache miss → compute
    const decision = await this.getDecision(request);

    // Store in cache (5 min TTL)
    const expiresAt = new Date(request.timestamp.getTime() + 300_000);

    await this.prisma.adDecisionCache.upsert({
      where: { screenId },
      create: {
        screenId,
        decision: decision.ads as any,
        computedAt: request.timestamp,
        expiresAt,
        triggerType: request.triggerType,
        version: 1,
      },
      update: {
        decision: decision.ads as any,
        computedAt: request.timestamp,
        expiresAt,
        triggerType: request.triggerType,
        version: { increment: 1 },
        invalidatedAt: null,
        invalidReason: null,
      },
    });

    return decision;
  }

  /**
   * Invalidate cache for specific screens (batch).
   * Uses jitter based on hash(screenId) to spread recomputation.
   */
  async invalidateCacheBatch(
    screenIds: string[],
    reason: string,
  ): Promise<number> {
    const result = await this.prisma.adDecisionCache.updateMany({
      where: { screenId: { in: screenIds } },
      data: {
        invalidatedAt: new Date(),
        invalidReason: reason,
      },
    });

    this.logger.log(
      `Cache invalidated: ${result.count} screens — reason: ${reason}`,
    );

    return result.count;
  }

  /**
   * Invalidate all caches (e.g. after full index rebuild).
   */
  async invalidateAll(reason: string): Promise<number> {
    const result = await this.prisma.adDecisionCache.updateMany({
      data: {
        invalidatedAt: new Date(),
        invalidReason: reason,
      },
    });

    this.logger.log(
      `Full cache invalidation: ${result.count} entries — reason: ${reason}`,
    );

    return result.count;
  }

  // ─────────────────────────────────────────────────────────────
  // PLACEMENT MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Record that an ad was played. Updates placement counters.
   */
  async recordPlay(
    screenId: string,
    campaignId: string,
    advertiserId: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.adPlacement.upsert({
      where: {
        campaignId_screenId: { campaignId, screenId },
      },
      create: {
        campaignId,
        screenId,
        advertiserId,
        status: 'SERVED',
        playsToday: 1,
        playsThisHour: 1,
        lastPlayedAt: now,
        cooldownUntil: new Date(now.getTime() + COOLDOWN_MS),
      },
      update: {
        playsToday: { increment: 1 },
        playsThisHour: { increment: 1 },
        lastPlayedAt: now,
        cooldownUntil: new Date(now.getTime() + COOLDOWN_MS),
        status: 'SERVED',
      },
    });
  }

  /**
   * Reset hourly counters for all placements.
   * Called by cron every hour.
   */
  async resetHourlyCounters(): Promise<number> {
    const result = await this.prisma.adPlacement.updateMany({
      where: { playsThisHour: { gt: 0 } },
      data: { playsThisHour: 0, status: 'ELIGIBLE' },
    });
    return result.count;
  }

  /**
   * Reset daily counters for all placements.
   * Called by cron at midnight.
   */
  async resetDailyCounters(): Promise<number> {
    const result = await this.prisma.adPlacement.updateMany({
      where: { playsToday: { gt: 0 } },
      data: { playsToday: 0 },
    });
    return result.count;
  }

  // ─────────────────────────────────────────────────────────────
  // ADMIN: Force recompute
  // ─────────────────────────────────────────────────────────────

  /**
   * Admin endpoint to force recompute decisions for specific screens.
   */
  async forceRecompute(
    screenIds?: string[],
  ): Promise<{ invalidated: number; recomputed: number }> {
    const reason = 'admin_force_recompute';

    let invalidated: number;
    if (screenIds?.length) {
      invalidated = await this.invalidateCacheBatch(screenIds, reason);
    } else {
      invalidated = await this.invalidateAll(reason);
    }

    // Recompute immediately for specified screens
    let recomputed = 0;
    if (screenIds?.length) {
      const now = new Date();
      for (const screenId of screenIds) {
        try {
          await this.getDecision({
            screenId,
            triggerType: 'MANUAL',
            timestamp: now,
          });
          recomputed++;
        } catch (err) {
          this.logger.warn(
            `Failed to recompute screen ${screenId}: ${(err as Error).message}`,
          );
        }
      }
    }

    return { invalidated, recomputed };
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS (pure, no side effects)
// ═══════════════════════════════════════════════════════════════

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function deriveTier(budgetCents: number): AdTier {
  if (budgetCents >= 500000) return 'PREMIUM'; // ≥ 5000€
  if (budgetCents >= 10000) return 'STANDARD'; // ≥ 100€
  return 'HOUSE';
}

function derivePriority(budgetCents: number): number {
  if (budgetCents >= 500000) return 85;
  if (budgetCents >= 100000) return 70;
  if (budgetCents >= 10000) return 50;
  return 30;
}
