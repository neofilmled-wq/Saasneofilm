import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CampaignIndexerService,
  CampaignIndexEntry,
} from './campaign-indexer.service';
import type { RankedCreative } from '@neofilm/shared';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ScreenMeta {
  screenId: string;
  geoHash: string | null;
  latitude: number | null;
  longitude: number | null;
  environment: string;
  partnerOrgId: string;
  timezone: string;
  orientation: string;
  maxAdsPerHour: number;
  maxConcurrentAds: number;
}

export interface RecentPlayHistory {
  /** Last N campaign IDs played on this screen (most recent first). */
  lastPlayedCampaignIds: string[];
  /** Last N creative IDs played on this screen (most recent first). */
  lastPlayedCreativeIds: string[];
  /** Campaigns → play count today on this screen. */
  campaignPlaysToday: Map<string, number>;
  /** Campaign → count this hour on this screen. */
  campaignCountsThisHour: Map<string, number>;
  /** Advertiser → count this hour on this screen. */
  advertiserCountsThisHour: Map<string, number>;
  /** Total ads shown this hour on this screen. */
  totalAdsThisHour: number;
}

export interface AdminOverrides {
  forcedCampaignIds: string[];
  blockedCampaignIds: string[];
  blockedScreenIds: string[];
  pausedCampaignIds: string[];
}

interface ScoredCandidate extends CampaignIndexEntry {
  score: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Trigger bonus values
// ────────────────────────────────────────────────────────────────────────────

const TRIGGER_BONUS: Record<string, number> = {
  POWER_ON: 100,
  CATALOG_OPEN: 80,
  OPEN_APP: 50,
  CHANGE_APP: 30,
  SCHEDULED: 0,
  MANUAL: 0,
};

/**
 * MatchingService
 *
 * Pure scoring engine. Given a screen, trigger context, and history,
 * returns ranked creatives to play. Deterministic: same inputs → same output.
 *
 * This is the "brain" of the diffusion engine.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly maxConcurrentAds: number;
  private readonly advertiserHourlyCap: number;

  constructor(
    private readonly campaignIndexer: CampaignIndexerService,
    private readonly configService: ConfigService,
  ) {
    this.maxConcurrentAds = this.configService.get<number>(
      'DIFFUSION_MAX_CONCURRENT_ADS',
      10,
    );
    this.advertiserHourlyCap = this.configService.get<number>(
      'DIFFUSION_ADVERTISER_FREQUENCY_CAP',
      6,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main entry point
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * getNextAd — the core ad-selection algorithm.
   *
   * Decision tree:
   *  0. Screen blocked? → house ads
   *  1. Forced override? → return forced creative
   *  2. Screen hourly cap? → house ads
   *  3. Load candidates from index
   *  4. Eligibility filter (status, dates, budget, geo, env, screens, windows, creatives)
   *  5. Frequency cap filter
   *  6. Score remaining candidates
   *  7. Select top-N with deterministic tiebreaker
   *  8. Anti-blackout check (never empty)
   *  9. Return ranked creatives
   */
  getNextAd(
    screen: ScreenMeta,
    triggerContext: string,
    now: Date,
    history: RecentPlayHistory,
    overrides: AdminOverrides,
    houseAds: RankedCreative[],
  ): RankedCreative[] {
    // STEP 0: Screen blocked?
    if (overrides.blockedScreenIds.includes(screen.screenId)) {
      this.logger.debug(`Screen ${screen.screenId} is blocked, returning house ads`);
      return houseAds;
    }

    // STEP 1: Forced override?
    if (overrides.forcedCampaignIds.length > 0) {
      const forced = this.resolveForcedCreatives(overrides.forcedCampaignIds);
      if (forced.length > 0) return forced;
    }

    // STEP 2: Screen hourly cap
    if (history.totalAdsThisHour >= screen.maxAdsPerHour) {
      this.logger.debug(
        `Screen ${screen.screenId} hit hourly cap (${history.totalAdsThisHour}/${screen.maxAdsPerHour})`,
      );
      return houseAds;
    }

    // STEP 3: Load candidates from campaign index
    const candidates = this.campaignIndexer.getCandidatesForScreen(
      screen.geoHash,
    );

    // STEP 4: Eligibility filter
    const eligible = this.filterEligible(candidates, screen, now, overrides);

    // STEP 5: Frequency cap filter
    const capped = this.filterFrequencyCaps(
      eligible,
      screen.screenId,
      history,
    );

    // STEP 6: Score
    const scored = this.scoreAll(capped, screen, triggerContext, now, history);

    // STEP 7: Select top-N with deterministic tiebreaker
    const seed = this.hashCode(
      `${screen.screenId}:${Math.floor(now.getTime() / 60000)}`,
    );
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const tieA = this.hashCode(`${a.campaignId}:${seed}`) % 10000;
      const tieB = this.hashCode(`${b.campaignId}:${seed}`) % 10000;
      return tieB - tieA;
    });

    const maxSlots = Math.min(screen.maxConcurrentAds, this.maxConcurrentAds);
    const selected = scored.slice(0, maxSlots);

    // STEP 8: Anti-blackout
    if (selected.length === 0) {
      return houseAds;
    }

    // Build final ranked creatives
    const result: RankedCreative[] = selected.map((c) => {
      const creativeId = this.selectCreative(
        c.readyCreativeIds,
        screen.screenId,
        seed,
        history,
      );
      const entry = this.campaignIndexer.getCampaignEntry(c.campaignId);
      return {
        campaignId: c.campaignId,
        creativeId,
        score: c.score,
        tier: this.deriveTier(c.priority),
        fileUrl: '', // Resolved by SchedulerService from creative manifest
        fileHash: '',
        durationMs: 0,
      };
    });

    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Eligibility filter
  // ──────────────────────────────────────────────────────────────────────────

  private filterEligible(
    candidates: CampaignIndexEntry[],
    screen: ScreenMeta,
    now: Date,
    overrides: AdminOverrides,
  ): CampaignIndexEntry[] {
    const nowMs = now.getTime();
    const dayOfWeek = now.getDay();
    const timeStr = this.formatTimeHHMM(now);

    return candidates.filter((c) => {
      // 4a. Status check
      if (c.status !== 'ACTIVE') return false;

      // 4b. Admin paused?
      if (overrides.pausedCampaignIds.includes(c.campaignId)) return false;

      // 4c. Admin blocked?
      if (overrides.blockedCampaignIds.includes(c.campaignId)) return false;

      // 4d. Date window
      if (nowMs < new Date(c.startDate).getTime()) return false;
      if (nowMs > new Date(c.endDate).getTime()) return false;

      // 4e. Budget
      if (c.spentCents >= c.budgetCents) return false;

      // 4f. Environment
      if (
        c.environments.length > 0 &&
        !c.environments.includes(screen.environment)
      ) {
        return false;
      }

      // 4g. Excluded screens
      if (c.excludedScreenIds.includes(screen.screenId)) return false;

      // 4h. Included screens (if specified, must be in list)
      if (
        c.includedScreenIds.length > 0 &&
        !c.includedScreenIds.includes(screen.screenId)
      ) {
        return false;
      }

      // 4i. Geo radius
      if (
        c.geoRadiusKm != null &&
        c.geoLatitude != null &&
        c.geoLongitude != null &&
        screen.latitude != null &&
        screen.longitude != null
      ) {
        const dist = this.haversine(
          screen.latitude,
          screen.longitude,
          c.geoLatitude,
          c.geoLongitude,
        );
        if (dist > c.geoRadiusKm) return false;
      }

      // 4j. Schedule windows
      if (c.scheduleWindows && c.scheduleWindows.length > 0) {
        const inWindow = c.scheduleWindows.some(
          (w) =>
            w.dayOfWeek === dayOfWeek &&
            timeStr >= w.startTime &&
            timeStr <= w.endTime,
        );
        if (!inWindow) return false;
      }

      // 4k. Has ready creatives
      if (c.readyCreativeIds.length === 0) return false;

      return true;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Frequency cap filter
  // ──────────────────────────────────────────────────────────────────────────

  private filterFrequencyCaps(
    candidates: CampaignIndexEntry[],
    screenId: string,
    history: RecentPlayHistory,
  ): CampaignIndexEntry[] {
    return candidates.filter((c) => {
      // 5a. Campaign per-screen per-hour cap
      const campaignFreq = history.campaignCountsThisHour.get(c.campaignId) ?? 0;
      if (campaignFreq >= c.frequencyCapPerScreenPerHour) return false;

      // 5b. Advertiser per-screen per-hour cap
      const advFreq =
        history.advertiserCountsThisHour.get(c.advertiserId) ?? 0;
      if (advFreq >= this.advertiserHourlyCap) return false;

      return true;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 6: Scoring
  // ──────────────────────────────────────────────────────────────────────────

  private scoreAll(
    candidates: CampaignIndexEntry[],
    screen: ScreenMeta,
    triggerContext: string,
    now: Date,
    history: RecentPlayHistory,
  ): ScoredCandidate[] {
    return candidates.map((c) => ({
      ...c,
      score: this.computeScore(c, triggerContext, now, history),
    }));
  }

  /**
   * Scoring formula:
   *   score = tierWeight + priorityScore + pacingScore + fairnessScore
   *         + recencyPenalty + triggerBonus
   */
  private computeScore(
    c: CampaignIndexEntry,
    triggerContext: string,
    now: Date,
    history: RecentPlayHistory,
  ): number {
    // Tier weight
    const tierWeight = c.priority >= 80 ? 10000 : c.priority >= 1 ? 1000 : 0;

    // Priority score (0–10000)
    const priorityScore = c.priority * 100;

    // Pacing score: reward underpaced campaigns
    const campaignDurationMs =
      new Date(c.endDate).getTime() - new Date(c.startDate).getTime();
    const elapsedMs = now.getTime() - new Date(c.startDate).getTime();
    const elapsedRatio =
      campaignDurationMs > 0 ? elapsedMs / campaignDurationMs : 1;
    const deliveredRatio = c.budgetCents > 0 ? c.spentCents / c.budgetCents : 1;
    const pacingDelta = elapsedRatio - deliveredRatio;
    const pacingScore = Math.max(-200, Math.min(500, pacingDelta * 500));

    // Fairness score: penalize campaigns played too much today
    const playsToday = history.campaignPlaysToday.get(c.campaignId) ?? 0;
    const fairnessScore = Math.max(0, 200 - playsToday * 20);

    // Recency penalty: penalize just-played campaigns
    const lastIdx = history.lastPlayedCampaignIds.indexOf(c.campaignId);
    const recencyPenalty =
      lastIdx === -1
        ? 0
        : lastIdx === 0
          ? -300
          : lastIdx === 1
            ? -150
            : lastIdx === 2
              ? -50
              : 0;

    // Trigger bonus
    const triggerBonus = TRIGGER_BONUS[triggerContext] ?? 0;

    return (
      tierWeight +
      priorityScore +
      pacingScore +
      fairnessScore +
      recencyPenalty +
      triggerBonus
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Creative selection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Select a creative from a pool, preferring ones not recently played.
   * Uses deterministic seeded selection.
   */
  private selectCreative(
    creativeIds: string[],
    screenId: string,
    seed: number,
    history: RecentPlayHistory,
  ): string {
    // Prefer unplayed
    const unplayed = creativeIds.filter(
      (id) => !history.lastPlayedCreativeIds.includes(id),
    );
    const pool = unplayed.length > 0 ? unplayed : creativeIds;

    // Deterministic selection
    const index =
      Math.abs((seed + this.hashCode(screenId)) % pool.length);
    return pool[index];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Forced override resolution
  // ──────────────────────────────────────────────────────────────────────────

  private resolveForcedCreatives(
    campaignIds: string[],
  ): RankedCreative[] {
    const results: RankedCreative[] = [];
    for (const campaignId of campaignIds) {
      const entry = this.campaignIndexer.getCampaignEntry(campaignId);
      if (!entry || entry.readyCreativeIds.length === 0) continue;
      results.push({
        campaignId,
        creativeId: entry.readyCreativeIds[0],
        score: 100000,
        tier: 'FORCED',
        fileUrl: '',
        fileHash: '',
        durationMs: 0,
      });
    }
    return results;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Utility functions
  // ──────────────────────────────────────────────────────────────────────────

  private deriveTier(priority: number): 'PREMIUM' | 'STANDARD' | 'HOUSE' {
    if (priority >= 80) return 'PREMIUM';
    if (priority >= 1) return 'STANDARD';
    return 'HOUSE';
  }

  /** Haversine distance in km between two lat/lng points. */
  private haversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /** Format time as HH:MM string (24h). */
  private formatTimeHHMM(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  /** Simple deterministic hash code from string → number. */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit int
    }
    return hash;
  }
}
