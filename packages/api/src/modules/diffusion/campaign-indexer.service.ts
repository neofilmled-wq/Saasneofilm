import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface CampaignIndexEntry {
  campaignId: string;
  advertiserId: string;
  advertiserName: string;
  status: string;
  priority: number;
  startDate: string;
  endDate: string;
  budgetCents: number;
  spentCents: number;
  readyCreativeIds: string[];
  environments: string[];
  includedScreenIds: string[];
  excludedScreenIds: string[];
  geoRadiusKm: number | null;
  geoLatitude: number | null;
  geoLongitude: number | null;
  cities: string[];
  scheduleWindows: ScheduleWindow[] | null;
  frequencyCapPerScreenPerHour: number;
}

interface ScheduleWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/**
 * CampaignIndexerService
 *
 * Builds and maintains an in-memory index of active campaigns per geographic
 * segment (geoHash precision 4 ≈ 39km² cells). In production, this index
 * lives in Redis sorted sets. Here we implement the in-process cache version
 * that is equivalent in behavior and can be swapped to Redis transparently.
 *
 * Trigger: Called on campaign changes, periodic reconciliation (every 6 hours),
 * and on manual rebuild via admin endpoint.
 */
@Injectable()
export class CampaignIndexerService {
  private readonly logger = new Logger(CampaignIndexerService.name);

  /** In-memory campaign index: geoHash4 → CampaignIndexEntry[] */
  private readonly campaignIndex = new Map<string, CampaignIndexEntry[]>();

  /** campaignId → CampaignIndexEntry for direct lookup */
  private readonly campaignById = new Map<string, CampaignIndexEntry>();

  /** All active entries (global, no geo filter) */
  private globalEntries: CampaignIndexEntry[] = [];

  private readonly geoHashPrecision: number;
  private readonly defaultFrequencyCap: number;

  private lastFullRebuild: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.geoHashPrecision = this.configService.get<number>(
      'DIFFUSION_GEOHASH_PRECISION',
      4,
    );
    this.defaultFrequencyCap = this.configService.get<number>(
      'DIFFUSION_FREQUENCY_CAP_DEFAULT',
      10,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /** Full index rebuild from database. Called on startup and periodically. */
  async rebuildFullIndex(): Promise<{ campaignsIndexed: number }> {
    this.logger.log('Starting full campaign index rebuild...');
    const startMs = Date.now();

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      include: {
        advertiserOrg: { select: { id: true, name: true } },
        targeting: {
          include: {
            includedScreens: { select: { id: true } },
            excludedScreens: { select: { id: true } },
          },
        },
        creatives: {
          where: { status: 'READY' },
          select: { id: true },
        },
      },
    });

    // Clear current index
    this.campaignIndex.clear();
    this.campaignById.clear();

    const entries: CampaignIndexEntry[] = [];

    for (const c of campaigns) {
      if (c.creatives.length === 0) continue; // skip campaigns with no ready creatives

      const entry: CampaignIndexEntry = {
        campaignId: c.id,
        advertiserId: c.advertiserOrgId,
        advertiserName: c.advertiserOrg.name,
        status: c.status,
        priority: this.derivePriority(c),
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        budgetCents: c.budgetCents,
        spentCents: c.spentCents,
        readyCreativeIds: c.creatives.map((cr) => cr.id),
        environments: c.targeting?.environments ?? [],
        includedScreenIds:
          c.targeting?.includedScreens.map((s) => s.id) ?? [],
        excludedScreenIds:
          c.targeting?.excludedScreens.map((s) => s.id) ?? [],
        geoRadiusKm: c.targeting?.geoRadiusKm ?? null,
        geoLatitude: c.targeting?.geoLatitude ?? null,
        geoLongitude: c.targeting?.geoLongitude ?? null,
        cities: c.targeting?.cities ?? [],
        scheduleWindows: this.parseScheduleWindows(c.targeting?.scheduleWindows),
        frequencyCapPerScreenPerHour: this.defaultFrequencyCap,
      };

      entries.push(entry);
      this.campaignById.set(c.id, entry);

      // Index by geoHash cells. If no geo targeting, add to all cells (global).
      if (entry.geoLatitude != null && entry.geoLongitude != null) {
        const geoHash = this.encodeGeoHash(
          entry.geoLatitude,
          entry.geoLongitude,
          this.geoHashPrecision,
        );
        this.addToGeoIndex(geoHash, entry);
      }
    }

    // Sort each geoHash bucket by priority descending
    for (const [key, bucket] of this.campaignIndex.entries()) {
      bucket.sort((a, b) => b.priority - a.priority);
      this.campaignIndex.set(key, bucket);
    }

    // Store global entries sorted
    this.globalEntries = entries.sort((a, b) => b.priority - a.priority);
    this.lastFullRebuild = new Date();

    const elapsed = Date.now() - startMs;
    this.logger.log(
      `Campaign index rebuilt: ${entries.length} campaigns indexed across ${this.campaignIndex.size} geoHash cells in ${elapsed}ms`,
    );

    return { campaignsIndexed: entries.length };
  }

  /** Incremental update for a single campaign. */
  async indexCampaign(campaignId: string): Promise<void> {
    // Remove old entry
    this.removeCampaignFromIndex(campaignId);

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        advertiserOrg: { select: { id: true, name: true } },
        targeting: {
          include: {
            includedScreens: { select: { id: true } },
            excludedScreens: { select: { id: true } },
          },
        },
        creatives: {
          where: { status: 'READY' },
          select: { id: true },
        },
      },
    });

    if (
      !campaign ||
      campaign.status !== 'ACTIVE' ||
      campaign.endDate < new Date() ||
      campaign.creatives.length === 0
    ) {
      this.logger.debug(`Campaign ${campaignId} not eligible for index`);
      return;
    }

    const entry: CampaignIndexEntry = {
      campaignId: campaign.id,
      advertiserId: campaign.advertiserOrgId,
      advertiserName: campaign.advertiserOrg.name,
      status: campaign.status,
      priority: this.derivePriority(campaign),
      startDate: campaign.startDate.toISOString(),
      endDate: campaign.endDate.toISOString(),
      budgetCents: campaign.budgetCents,
      spentCents: campaign.spentCents,
      readyCreativeIds: campaign.creatives.map((cr) => cr.id),
      environments: campaign.targeting?.environments ?? [],
      includedScreenIds:
        campaign.targeting?.includedScreens.map((s) => s.id) ?? [],
      excludedScreenIds:
        campaign.targeting?.excludedScreens.map((s) => s.id) ?? [],
      geoRadiusKm: campaign.targeting?.geoRadiusKm ?? null,
      geoLatitude: campaign.targeting?.geoLatitude ?? null,
      geoLongitude: campaign.targeting?.geoLongitude ?? null,
      cities: campaign.targeting?.cities ?? [],
      scheduleWindows: this.parseScheduleWindows(
        campaign.targeting?.scheduleWindows,
      ),
      frequencyCapPerScreenPerHour: this.defaultFrequencyCap,
    };

    this.campaignById.set(campaign.id, entry);

    if (entry.geoLatitude != null && entry.geoLongitude != null) {
      const geoHash = this.encodeGeoHash(
        entry.geoLatitude,
        entry.geoLongitude,
        this.geoHashPrecision,
      );
      this.addToGeoIndex(geoHash, entry);
    }

    // Re-sort global
    this.globalEntries = Array.from(this.campaignById.values()).sort(
      (a, b) => b.priority - a.priority,
    );

    this.logger.debug(`Campaign ${campaignId} indexed`);
  }

  /** Remove a campaign from the index (e.g., paused, completed). */
  removeCampaignFromIndex(campaignId: string): void {
    this.campaignById.delete(campaignId);

    for (const [key, bucket] of this.campaignIndex.entries()) {
      const filtered = bucket.filter((e) => e.campaignId !== campaignId);
      if (filtered.length === 0) {
        this.campaignIndex.delete(key);
      } else {
        this.campaignIndex.set(key, filtered);
      }
    }

    this.globalEntries = this.globalEntries.filter(
      (e) => e.campaignId !== campaignId,
    );
  }

  /**
   * Get candidate campaigns for a screen. Returns campaigns in the screen's
   * geoHash cell, plus globally-targeted campaigns (no geo filter).
   */
  getCandidatesForScreen(
    screenGeoHash: string | null,
  ): CampaignIndexEntry[] {
    if (!screenGeoHash) {
      // No geo for screen — return all global entries
      return [...this.globalEntries];
    }

    const truncated = screenGeoHash.substring(0, this.geoHashPrecision);
    const geoResults = this.campaignIndex.get(truncated) ?? [];

    // Also include campaigns with no geo targeting (global campaigns)
    const globalOnly = this.globalEntries.filter(
      (e) =>
        e.geoLatitude == null &&
        e.geoLongitude == null &&
        e.geoRadiusKm == null,
    );

    // Merge and deduplicate
    const seen = new Set<string>();
    const merged: CampaignIndexEntry[] = [];
    for (const e of [...geoResults, ...globalOnly]) {
      if (!seen.has(e.campaignId)) {
        seen.add(e.campaignId);
        merged.push(e);
      }
    }

    return merged.sort((a, b) => b.priority - a.priority);
  }

  /** Direct lookup by campaign ID. */
  getCampaignEntry(campaignId: string): CampaignIndexEntry | undefined {
    return this.campaignById.get(campaignId);
  }

  /** Get index stats for monitoring. */
  getStats(): {
    totalCampaigns: number;
    geoHashCells: number;
    lastFullRebuild: string | null;
  } {
    return {
      totalCampaigns: this.campaignById.size,
      geoHashCells: this.campaignIndex.size,
      lastFullRebuild: this.lastFullRebuild?.toISOString() ?? null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private addToGeoIndex(geoHash: string, entry: CampaignIndexEntry): void {
    const bucket = this.campaignIndex.get(geoHash) ?? [];
    bucket.push(entry);
    this.campaignIndex.set(geoHash, bucket);
  }

  /**
   * Derive a numeric priority (0-100) from campaign data.
   * Premium campaigns (high budget, bookings) get higher priority.
   */
  private derivePriority(campaign: {
    budgetCents: number;
    type: string;
  }): number {
    let priority = 50; // default standard

    // High-budget campaigns get premium treatment
    if (campaign.budgetCents >= 500000) priority = 85; // 5000€+
    else if (campaign.budgetCents >= 100000) priority = 70; // 1000€+
    else if (campaign.budgetCents >= 10000) priority = 50; // 100€+
    else priority = 30; // low budget

    // Catalog listings are lower priority than ad spots
    if (campaign.type === 'CATALOG_LISTING') {
      priority = Math.max(10, priority - 20);
    }

    return priority;
  }

  private parseScheduleWindows(raw: unknown): ScheduleWindow[] | null {
    if (!raw || !Array.isArray(raw)) return null;
    return raw as ScheduleWindow[];
  }

  /**
   * Simplified geoHash encoder. Encodes (lat, lng) to a geoHash string.
   * For production, use a proper geohash library (e.g., ngeohash).
   */
  encodeGeoHash(lat: number, lng: number, precision: number): string {
    const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let minLat = -90,
      maxLat = 90;
    let minLng = -180,
      maxLng = 180;
    let hash = '';
    let bit = 0;
    let ch = 0;
    let isLng = true;

    while (hash.length < precision) {
      if (isLng) {
        const mid = (minLng + maxLng) / 2;
        if (lng >= mid) {
          ch |= 1 << (4 - bit);
          minLng = mid;
        } else {
          maxLng = mid;
        }
      } else {
        const mid = (minLat + maxLat) / 2;
        if (lat >= mid) {
          ch |= 1 << (4 - bit);
          minLat = mid;
        } else {
          maxLat = mid;
        }
      }
      isLng = !isLng;
      bit++;
      if (bit === 5) {
        hash += BASE32[ch];
        bit = 0;
        ch = 0;
      }
    }
    return hash;
  }
}
