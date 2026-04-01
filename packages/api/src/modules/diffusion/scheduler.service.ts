import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingService, ScreenMeta, RecentPlayHistory } from './matching.service';
import { OverrideManagerService } from './override-manager.service';
import { CampaignIndexerService } from './campaign-indexer.service';
import type { ScheduleBundle, ScheduleEntry, CreativeManifest, RankedCreative } from '@neofilm/shared';

/**
 * SchedulerService
 *
 * Generates deterministic schedule bundles for each screen, covering the next
 * N hours. A schedule bundle is a sorted list of ad entries that the device
 * plays in rotation on each trigger event.
 *
 * Determinism guarantee: Given the same (screenId, roundedTimestamp, campaignIndex,
 * overrides), two independent instances produce identical output.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  /** In-memory schedule cache: screenId → ScheduleBundle */
  private readonly scheduleCache = new Map<string, ScheduleBundle>();

  /** Schedule version counter per screen */
  private readonly versionCounters = new Map<string, number>();

  private readonly lookaheadHours: number;
  private readonly maxAdsPerHour: number;
  private readonly maxConcurrentAds: number;
  private readonly houseAdRotationMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly matchingService: MatchingService,
    private readonly overrideManager: OverrideManagerService,
    private readonly campaignIndexer: CampaignIndexerService,
  ) {
    this.lookaheadHours = this.configService.get<number>(
      'DIFFUSION_SCHEDULE_LOOKAHEAD_HOURS',
      6,
    );
    this.maxAdsPerHour = this.configService.get<number>(
      'DIFFUSION_MAX_ADS_PER_SCREEN_PER_HOUR',
      20,
    );
    this.maxConcurrentAds = this.configService.get<number>(
      'DIFFUSION_MAX_CONCURRENT_ADS',
      10,
    );
    this.houseAdRotationMs = this.configService.get<number>(
      'DIFFUSION_HOUSE_ADS_ROTATION_MS',
      15000,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /** Generate a full schedule for a screen. */
  async generateSchedule(screenId: string): Promise<ScheduleBundle> {
    const screen = await this.resolveScreenMeta(screenId);
    const now = this.roundToMinute(new Date());
    const validUntil = new Date(
      now.getTime() + this.lookaheadHours * 3600000,
    );

    const overrides = this.overrideManager.getOverridesForScreen(screenId);
    const houseAds = await this.loadHouseAds(screen.partnerOrgId);

    // Generate rotation entries for the lookahead window
    // Simulate calling getNextAd at 30-second intervals
    const intervalMs = 30000; // 30 seconds per slot
    const totalSlots = Math.floor(
      (this.lookaheadHours * 3600000) / intervalMs,
    );
    const entries: ScheduleEntry[] = [];
    const creativeManifest: Record<string, CreativeManifest> = {};

    // Build a simulated history (starts empty, builds up)
    const simHistory: RecentPlayHistory = {
      lastPlayedCampaignIds: [],
      lastPlayedCreativeIds: [],
      campaignPlaysToday: new Map(),
      campaignCountsThisHour: new Map(),
      advertiserCountsThisHour: new Map(),
      totalAdsThisHour: 0,
    };

    let currentHourBucket = Math.floor(now.getTime() / 3600000);

    for (let i = 0; i < totalSlots && i < 720; i++) {
      const slotTime = new Date(now.getTime() + i * intervalMs);
      const slotHourBucket = Math.floor(slotTime.getTime() / 3600000);

      // Reset hourly counters if we crossed an hour boundary
      if (slotHourBucket !== currentHourBucket) {
        simHistory.campaignCountsThisHour.clear();
        simHistory.advertiserCountsThisHour.clear();
        simHistory.totalAdsThisHour = 0;
        currentHourBucket = slotHourBucket;
      }

      const ranked = this.matchingService.getNextAd(
        screen,
        'SCHEDULED', // Default trigger for pre-generated schedule
        slotTime,
        simHistory,
        overrides,
        houseAds,
      );

      if (ranked.length === 0) continue;

      // Take the top-ranked creative for this slot
      const top = ranked[0];
      const creative = await this.resolveCreativeManifest(top.creativeId);

      if (creative) {
        entries.push({
          slotIndex: entries.length,
          campaignId: top.campaignId,
          creativeId: top.creativeId,
          durationMs: creative.durationMs || this.houseAdRotationMs,
          priority: top.score,
          tier: top.tier as ScheduleEntry['tier'],
          validFrom: slotTime.toISOString(),
          validUntil: new Date(
            slotTime.getTime() + intervalMs,
          ).toISOString(),
          triggerTypes: [
            'POWER_ON',
            'OPEN_APP',
            'CHANGE_APP',
            'CATALOG_OPEN',
            'SCHEDULED',
          ],
        });

        // Add to manifest if not already present
        if (!creativeManifest[top.creativeId]) {
          creativeManifest[top.creativeId] = creative;
        }

        // Update simulated history
        simHistory.lastPlayedCampaignIds.unshift(top.campaignId);
        if (simHistory.lastPlayedCampaignIds.length > 10) {
          simHistory.lastPlayedCampaignIds.pop();
        }
        simHistory.lastPlayedCreativeIds.unshift(top.creativeId);
        if (simHistory.lastPlayedCreativeIds.length > 10) {
          simHistory.lastPlayedCreativeIds.pop();
        }
        simHistory.campaignPlaysToday.set(
          top.campaignId,
          (simHistory.campaignPlaysToday.get(top.campaignId) ?? 0) + 1,
        );
        simHistory.campaignCountsThisHour.set(
          top.campaignId,
          (simHistory.campaignCountsThisHour.get(top.campaignId) ?? 0) + 1,
        );
        simHistory.totalAdsThisHour++;
      }
    }

    // Build bundle
    const version = this.incrementVersion(screenId);
    const bundle: ScheduleBundle = {
      version,
      generatedAt: now.toISOString(),
      screenId,
      validFrom: now.toISOString(),
      validUntil: validUntil.toISOString(),
      entries,
      houseAds: houseAds.map((h) => ({
        creativeId: h.creativeId,
        fileUrl: h.fileUrl,
        fileHash: h.fileHash,
        durationMs: h.durationMs || this.houseAdRotationMs,
        width: 0,
        height: 0,
        mimeType: 'video/mp4',
        fileSizeBytes: 0,
      })),
      creativeManifest,
    };

    // Cache it
    this.scheduleCache.set(screenId, bundle);

    this.logger.log(
      `Schedule generated for screen ${screenId}: ${entries.length} entries, version ${version}`,
    );

    return bundle;
  }

  /** Get cached schedule for a screen (or generate if missing). */
  async getSchedule(
    screenId: string,
    sinceVersion?: number,
  ): Promise<ScheduleBundle | null> {
    const cached = this.scheduleCache.get(screenId);

    // If client already has this version, no update needed
    if (cached && sinceVersion !== undefined && cached.version <= sinceVersion) {
      return null; // 304 Not Modified
    }

    // If cached and still valid, return it
    if (cached && new Date(cached.validUntil) > new Date()) {
      return cached;
    }

    // Generate fresh
    return this.generateSchedule(screenId);
  }

  /** Get current schedule version for a screen. */
  getScheduleVersion(screenId: string): number {
    return this.versionCounters.get(screenId) ?? 0;
  }

  /** Invalidate schedule for a screen (forces regeneration on next pull). */
  invalidateSchedule(screenId: string): void {
    this.scheduleCache.delete(screenId);
    this.logger.debug(`Schedule invalidated for screen ${screenId}`);
  }

  /** Invalidate schedules for all screens (e.g., after full index rebuild). */
  invalidateAll(): void {
    this.scheduleCache.clear();
    this.logger.log('All schedules invalidated');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Load screen metadata from DB. */
  private async resolveScreenMeta(screenId: string): Promise<ScreenMeta> {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        environment: true,
        partnerOrgId: true,
        timezone: true,
        orientation: true,
        status: true,
      },
    });

    if (!screen || screen.status === 'DECOMMISSIONED') {
      throw new NotFoundException(`Screen ${screenId} not found or decommissioned`);
    }

    let geoHash: string | null = null;
    if (screen.latitude != null && screen.longitude != null) {
      geoHash = this.campaignIndexer.encodeGeoHash(
        screen.latitude,
        screen.longitude,
        4,
      );
    }

    return {
      screenId: screen.id,
      geoHash,
      latitude: screen.latitude,
      longitude: screen.longitude,
      environment: screen.environment,
      partnerOrgId: screen.partnerOrgId,
      timezone: screen.timezone,
      orientation: screen.orientation,
      maxAdsPerHour: this.maxAdsPerHour,
      maxConcurrentAds: this.maxConcurrentAds,
    };
  }

  /** Resolve creative details for the manifest. */
  private async resolveCreativeManifest(
    creativeId: string,
  ): Promise<CreativeManifest | null> {
    const creative = await this.prisma.creative.findUnique({
      where: { id: creativeId },
      select: {
        id: true,
        fileUrl: true,
        fileHash: true,
        durationMs: true,
        width: true,
        height: true,
        mimeType: true,
        fileSizeBytes: true,
      },
    });

    if (!creative) return null;

    const cdnBase = this.configService.get<string>('CDN_BASE_URL', '');

    return {
      creativeId: creative.id,
      fileUrl: creative.fileUrl.startsWith('http')
        ? creative.fileUrl
        : `${cdnBase}${creative.fileUrl}`,
      fileHash: creative.fileHash ?? '',
      durationMs: creative.durationMs ?? 15000,
      width: creative.width ?? 1920,
      height: creative.height ?? 1080,
      mimeType: creative.mimeType ?? 'video/mp4',
      fileSizeBytes: creative.fileSizeBytes ?? 0,
    };
  }

  /** Load house ads for a partner (or platform defaults). */
  private async loadHouseAds(_partnerOrgId: string): Promise<RankedCreative[]> {
    // TODO: load from Redis house_ads:{partnerOrgId} or house_ads:platform_default
    return [
      {
        campaignId: 'house_default',
        creativeId: 'house_creative_default',
        score: 0,
        tier: 'HOUSE',
        fileUrl: '/creatives/house/default.mp4',
        fileHash: 'house_default_hash',
        durationMs: 15000,
      },
    ];
  }

  /** Round a Date to the nearest minute for determinism. */
  private roundToMinute(date: Date): Date {
    const d = new Date(date);
    d.setSeconds(0, 0);
    return d;
  }

  /** Increment and return the version counter for a screen. */
  private incrementVersion(screenId: string): number {
    const current = this.versionCounters.get(screenId) ?? 0;
    const next = current + 1;
    this.versionCounters.set(screenId, next);
    return next;
  }
}
