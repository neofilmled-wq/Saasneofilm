import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminOverrides } from './matching.service';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface Override {
  id: string;
  action: 'FORCE' | 'BLOCK' | 'PAUSE';
  campaignId: string;
  creativeId?: string;
  screenIds: string[];
  scope: 'SPECIFIC' | 'ALL' | 'PARTNER' | 'GEO';
  partnerOrgId?: string;
  geoHash?: string;
  expiresAt: Date | null;
  reason: string;
  issuedBy: string;
  createdAt: Date;
}

/**
 * OverrideManagerService
 *
 * Manages admin overrides: force, block, pause campaigns on screens.
 * Overrides stored in-memory with TTL support.
 * Production upgrade: swap to Redis HASH with TTL per key.
 */
@Injectable()
export class OverrideManagerService {
  private readonly logger = new Logger(OverrideManagerService.name);

  /** Active overrides: overrideId -> Override */
  private readonly overrides = new Map<string, Override>();

  /** Index: screenId -> set of override IDs that apply to it */
  private readonly screenIndex = new Map<string, Set<string>>();

  /** Global overrides (scope=ALL) */
  private readonly globalOverrideIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Create override
  // ──────────────────────────────────────────────────────────────────────────

  async createOverride(params: {
    action: 'FORCE' | 'BLOCK' | 'PAUSE';
    campaignId: string;
    creativeId?: string;
    screenIds?: string[];
    scope: 'SPECIFIC' | 'ALL' | 'PARTNER' | 'GEO';
    partnerOrgId?: string;
    geoHash?: string;
    expiresAt?: Date;
    reason: string;
    issuedBy: string;
    ipAddress?: string;
  }): Promise<{ overrideId: string; affectedScreens: number }> {
    const id = `ov_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Resolve affected screens based on scope
    let affectedScreenIds: string[];
    switch (params.scope) {
      case 'SPECIFIC':
        affectedScreenIds = params.screenIds ?? [];
        break;
      case 'ALL': {
        const rows = await this.prisma.screen.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });
        affectedScreenIds = rows.map((s) => s.id);
        break;
      }
      case 'PARTNER': {
        if (!params.partnerOrgId) {
          affectedScreenIds = [];
          break;
        }
        const rows = await this.prisma.screen.findMany({
          where: { partnerOrgId: params.partnerOrgId, status: 'ACTIVE' },
          select: { id: true },
        });
        affectedScreenIds = rows.map((s) => s.id);
        break;
      }
      case 'GEO':
      default:
        affectedScreenIds = [];
        break;
    }

    const override: Override = {
      id,
      action: params.action,
      campaignId: params.campaignId,
      creativeId: params.creativeId,
      screenIds: affectedScreenIds,
      scope: params.scope,
      partnerOrgId: params.partnerOrgId,
      geoHash: params.geoHash,
      expiresAt: params.expiresAt ?? null,
      reason: params.reason,
      issuedBy: params.issuedBy,
      createdAt: new Date(),
    };

    this.overrides.set(id, override);

    // Index
    if (params.scope === 'ALL') {
      this.globalOverrideIds.add(id);
    } else {
      for (const sid of affectedScreenIds) {
        const set = this.screenIndex.get(sid) ?? new Set();
        set.add(id);
        this.screenIndex.set(sid, set);
      }
    }

    // Auto-expire
    if (override.expiresAt) {
      const ttlMs = override.expiresAt.getTime() - Date.now();
      if (ttlMs > 0) {
        setTimeout(() => this.removeOverride(id), ttlMs);
      }
    }

    await this.auditService.log({
      action: `OVERRIDE_${params.action}`,
      entity: 'Campaign',
      entityId: params.campaignId,
      userId: params.issuedBy,
      ipAddress: params.ipAddress,
      newData: {
        overrideId: id,
        scope: params.scope,
        affectedScreens: affectedScreenIds.length,
        reason: params.reason,
      },
    });

    this.logger.log(
      `Override ${id}: ${params.action} campaign ${params.campaignId} on ${affectedScreenIds.length} screens`,
    );

    return { overrideId: id, affectedScreens: affectedScreenIds.length };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Remove override
  // ──────────────────────────────────────────────────────────────────────────

  removeOverride(overrideId: string): boolean {
    const override = this.overrides.get(overrideId);
    if (!override) return false;

    this.overrides.delete(overrideId);
    this.globalOverrideIds.delete(overrideId);

    for (const sid of override.screenIds) {
      const set = this.screenIndex.get(sid);
      if (set) {
        set.delete(overrideId);
        if (set.size === 0) this.screenIndex.delete(sid);
      }
    }
    this.logger.debug(`Override ${overrideId} removed`);
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Query overrides
  // ──────────────────────────────────────────────────────────────────────────

  getOverridesForScreen(screenId: string): AdminOverrides {
    const result: AdminOverrides = {
      forcedCampaignIds: [],
      blockedCampaignIds: [],
      blockedScreenIds: [],
      pausedCampaignIds: [],
    };

    const now = new Date();
    const ids = new Set<string>();
    for (const gid of this.globalOverrideIds) ids.add(gid);
    const localSet = this.screenIndex.get(screenId);
    if (localSet) for (const lid of localSet) ids.add(lid);

    for (const id of ids) {
      const ov = this.overrides.get(id);
      if (!ov) continue;
      if (ov.expiresAt && ov.expiresAt < now) {
        this.removeOverride(id);
        continue;
      }
      switch (ov.action) {
        case 'FORCE':
          result.forcedCampaignIds.push(ov.campaignId);
          break;
        case 'BLOCK':
          result.blockedCampaignIds.push(ov.campaignId);
          break;
        case 'PAUSE':
          result.pausedCampaignIds.push(ov.campaignId);
          break;
      }
    }
    return result;
  }

  /** Block a screen entirely. */
  async blockScreen(params: {
    screenId: string;
    reason: string;
    blockedBy: string;
    blockAds: boolean;
    blockHouseAds: boolean;
    ipAddress?: string;
  }): Promise<{ blocked: boolean; affectedCampaigns: number }> {
    const count = await this.prisma.scheduleSlot.count({
      where: {
        schedule: { screenId: params.screenId, isActive: true },
        campaign: { status: 'ACTIVE' },
      },
    });

    await this.createOverride({
      action: 'BLOCK',
      campaignId: `screen_block:${params.screenId}`,
      screenIds: [params.screenId],
      scope: 'SPECIFIC',
      reason: params.reason,
      issuedBy: params.blockedBy,
      ipAddress: params.ipAddress,
    });

    return { blocked: true, affectedCampaigns: count };
  }

  /** List all active overrides. */
  listActiveOverrides(): Override[] {
    const now = new Date();
    const result: Override[] = [];
    for (const ov of this.overrides.values()) {
      if (ov.expiresAt && ov.expiresAt < now) {
        this.removeOverride(ov.id);
        continue;
      }
      result.push(ov);
    }
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  clearAll(): void {
    this.overrides.clear();
    this.screenIndex.clear();
    this.globalOverrideIds.clear();
    this.logger.log('All overrides cleared');
  }
}
