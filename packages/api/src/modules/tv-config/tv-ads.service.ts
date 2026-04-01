/* ── TvAdsService — rewritten with trigger configs, cooldowns, tier weighting ── */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface TvAdItem {
  campaignId: string;
  creativeId: string;
  fileUrl: string;
  fileHash: string;
  durationMs: number;
  mimeType: string;
  width: number;
  height: number;
  tier: 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';
  canSkipAfterMs: number;
  advertiserName: string;
}

export interface TvAdsResponse {
  ads: TvAdItem[];
  fallbackHouseAds: TvAdItem[];
}

/**
 * Trigger contexts sent by the TV app.
 * Matches DiffusionTrigger enum + virtual composite triggers from TV.
 */
export type TvTriggerContext =
  | 'POWER_ON'       // TV boots → show 1 ad (HOME_SPLIT)
  | 'OPEN_APP'       // User switches tab → show 1 ad
  | 'CHANGE_APP'     // App-change interstitial → show 1 ad
  | 'CATALOG_OPEN'   // Catalogue tab opened → unskippable ad
  | 'SCHEDULED'      // Cron-based rotation (TV_REAPPEAR every 2h)
  | 'MANUAL'         // Admin-triggered push
  | 'STREAMING_OPEN' // Streaming tab opened → 1 ad before content
  | string;          // future-proof

interface TriggerConfig {
  maxAds: number;
  skipDelayOverrideMs: number | null; // null = use macro value
  prioritizePremium: boolean;
}

const TRIGGER_CONFIGS: Record<string, TriggerConfig> = {
  POWER_ON:       { maxAds: 1, skipDelayOverrideMs: null, prioritizePremium: true },
  OPEN_APP:       { maxAds: 1, skipDelayOverrideMs: null, prioritizePremium: false },
  CHANGE_APP:     { maxAds: 1, skipDelayOverrideMs: null, prioritizePremium: false },
  CATALOG_OPEN:   { maxAds: 1, skipDelayOverrideMs: 0,    prioritizePremium: true },
  SCHEDULED:      { maxAds: 10, skipDelayOverrideMs: null, prioritizePremium: false },
  MANUAL:         { maxAds: 1, skipDelayOverrideMs: null, prioritizePremium: false },
  STREAMING_OPEN: { maxAds: 1, skipDelayOverrideMs: 5000, prioritizePremium: true },
};

/**
 * TvAdsService
 *
 * Resolves which ads to show on a specific screen based on:
 * - Active campaigns targeting this screen (date-valid, APPROVED creatives)
 * - AdPlacement cooldowns + hourly frequency caps (queried separately)
 * - AdRuleSet global tier weighting (premium 60% / standard 40%)
 * - Anti-consecutive-advertiser rule
 * - Anti-repetition (last 5 creatives)
 * - Trigger-specific maxAds and skipDelay
 */
@Injectable()
export class TvAdsService {
  private readonly logger = new Logger(TvAdsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAdsForScreen(
    screenId: string,
    triggerContext: string,
    maxAds: number = 1,
  ): Promise<TvAdsResponse> {
    const now = new Date();
    const triggerCfg = TRIGGER_CONFIGS[triggerContext] ?? { maxAds, skipDelayOverrideMs: null, prioritizePremium: false };
    const resolvedMaxAds = triggerCfg.maxAds;

    // Macros for skip-delay and duration filters
    const macros = await this.prisma.tvMacro.findUnique({ where: { screenId } });
    const skipDelay = triggerCfg.skipDelayOverrideMs !== null
      ? triggerCfg.skipDelayOverrideMs
      : (macros?.skipDelayMs ?? 7000);

    // Global rule set (defaults if absent)
    const globalRuleSet = await this.prisma.adRuleSet.findFirst({ where: { isGlobal: true } });
    const premiumRatio = globalRuleSet?.premiumRatio ?? 60;
    const noConsecutiveSameAdv = globalRuleSet?.noConsecutiveSameAdv ?? true;
    const globalMaxPerHour = globalRuleSet?.maxPlaysPerScreenPerHour ?? 6;

    // Active campaigns targeting this screen within valid date range
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        targeting: {
          includedScreens: { some: { id: screenId } },
        },
      },
      include: {
        creatives: { where: { status: 'READY', moderationStatus: 'APPROVED', type: 'VIDEO' } },
        advertiserOrg: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (campaigns.length === 0) {
      this.logger.debug(`No active campaigns for screen ${screenId}`);
      return { ads: [], fallbackHouseAds: [] };
    }

    // Fetch AdPlacements for this screen in bulk (separate query — no Prisma relation on Campaign)
    const campaignIds = campaigns.map((c) => c.id);
    const placements = await this.prisma.adPlacement.findMany({
      where: { screenId, campaignId: { in: campaignIds } },
    });
    const placementByCampaign = new Map(placements.map((p) => [p.campaignId, p]));

    // Anti-repetition: last 5 shown creatives + last advertiser campaign
    const recentLogs = await this.prisma.diffusionLog.findMany({
      where: { screenId },
      orderBy: { startTime: 'desc' },
      take: 5,
      select: { creativeId: true, campaignId: true },
    });
    const recentCreativeIds = new Set(recentLogs.map((l) => l.creativeId));
    const lastCampaignId = recentLogs[0]?.campaignId ?? null;

    // Build tier pools
    const premiumPool: TvAdItem[] = [];
    const standardPool: TvAdItem[] = [];

    for (const campaign of campaigns) {
      const placement = placementByCampaign.get(campaign.id);

      // Cooldown check
      if (placement?.cooldownUntil && new Date(placement.cooldownUntil) > now) {
        continue;
      }

      // Hourly frequency cap
      const maxPerHour = placement?.maxPlaysPerHour ?? globalMaxPerHour;
      if (placement && (placement.playsThisHour ?? 0) >= maxPerHour) {
        continue;
      }

      // Anti-consecutive-advertiser (same campaign = same advertiser block)
      // Skip for SCHEDULED trigger — the native overlay handles its own shuffle
      if (triggerContext !== 'SCHEDULED' && noConsecutiveSameAdv && campaign.id === lastCampaignId && campaigns.filter(c => c.creatives.length > 0).length > 1) {
        continue;
      }

      const tier = (placement?.tier as TvAdItem['tier']) ?? 'STANDARD';

      for (const creative of campaign.creatives) {
        // Duration macro filter
        if (macros) {
          const durationSec = (creative.durationMs ?? 15000) / 1000;
          if (durationSec <= 15 && !macros.spotDuration15s) continue;
          if (durationSec > 15 && durationSec <= 30 && !macros.spotDuration30s) continue;
        }

        const adItem: TvAdItem = {
          campaignId: campaign.id,
          creativeId: creative.id,
          fileUrl: creative.fileUrl,
          fileHash: creative.fileHash ?? '',
          durationMs: creative.durationMs ?? 15000,
          mimeType: creative.mimeType ?? 'video/mp4',
          width: creative.width ?? 1920,
          height: creative.height ?? 1080,
          tier,
          canSkipAfterMs: skipDelay,
          advertiserName: campaign.advertiserOrg.name,
        };

        if (tier === 'PREMIUM' || tier === 'FORCED') {
          premiumPool.push(adItem);
        } else {
          standardPool.push(adItem);
        }
      }
    }

    if (premiumPool.length === 0 && standardPool.length === 0) {
      return { ads: [], fallbackHouseAds: [] };
    }

    // Anti-repetition sort: non-recently-shown first within each pool
    const sortByRecency = (pool: TvAdItem[]) =>
      pool.sort((a, b) => {
        const aR = recentCreativeIds.has(a.creativeId) ? 1 : 0;
        const bR = recentCreativeIds.has(b.creativeId) ? 1 : 0;
        return aR - bR;
      });
    sortByRecency(premiumPool);
    sortByRecency(standardPool);

    // Weighted selection: fill resolvedMaxAds using premiumRatio
    const premiumSlots = Math.round((resolvedMaxAds * premiumRatio) / 100);
    const standardSlots = resolvedMaxAds - premiumSlots;

    const premiumShortfall = Math.max(0, premiumSlots - premiumPool.length);
    const standardShortfall = Math.max(0, standardSlots - standardPool.length);

    const ads = [
      ...premiumPool.slice(0, premiumSlots),
      ...standardPool.slice(0, standardSlots),
      ...standardPool.slice(standardSlots, standardSlots + premiumShortfall),
      ...premiumPool.slice(premiumSlots, premiumSlots + standardShortfall),
    ].slice(0, resolvedMaxAds);

    this.logger.debug(
      `Resolved ${ads.length} ads for screen ${screenId} (trigger=${triggerContext}, premium=${premiumPool.length}, standard=${standardPool.length})`,
    );

    return { ads, fallbackHouseAds: [] };
  }
}
