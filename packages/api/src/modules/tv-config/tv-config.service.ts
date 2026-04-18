import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';

interface ParsedChannel {
  name: string;
  streamUrl: string;
  logoUrl: string | null;
  group: string | null;
}

function parseM3U(content: string): ParsedChannel[] {
  const lines = content.split('\n').map((l) => l.trim());
  const out: ParsedChannel[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('#EXTINF')) {
      const name = line.split(',').slice(1).join(',').trim() || 'Chaîne';
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      let urlLine = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) {
          urlLine = lines[j];
          i = j;
          break;
        }
      }
      if (urlLine) {
        out.push({
          name,
          streamUrl: urlLine,
          logoUrl: logoMatch ? logoMatch[1] : null,
          group: groupMatch ? groupMatch[1] : null,
        });
      }
    }
    i++;
  }
  return out;
}

@Injectable()
export class TvConfigService {
  private readonly logger = new Logger(TvConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  // ── Device-facing reads ──────────────────────────────────────────────────

  /** Get the full TV config for a screen (called by device via JWT) */
  async getConfigForScreen(screenId: string) {
    const config = await this.prisma.tvConfig.findUnique({
      where: { screenId },
    });

    // Return defaults if no config exists yet
    if (!config) {
      return {
        screenId,
        enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
        defaultTab: 'TNT',
        partnerLogoUrl: null,
        welcomeMessage: null,
        tickerText: null,
      };
    }

    return {
      screenId: config.screenId,
      enabledModules: config.enabledModules,
      defaultTab: config.defaultTab,
      partnerLogoUrl: config.partnerLogoUrl,
      welcomeMessage: config.welcomeMessage,
      tickerText: config.tickerText,
    };
  }

  /**
   * Get TNT channels for a given screen.
   * Aggregates partner-provided `TvStreamSource` entries:
   *   - isGlobal=true  → fetched and parsed (M3U8 playlist → multiple channels)
   *   - isGlobal=false → single channel with provided channelName
   * Falls back to the legacy `tv_channels` table when no partner sources exist.
   */
  async getChannels(screenId?: string | null) {
    if (screenId) {
      const screen = await this.prisma.screen.findUnique({
        where: { id: screenId },
        select: { partnerOrgId: true },
      });
      if (screen?.partnerOrgId) {
        const sources = await this.prisma.tvStreamSource.findMany({
          where: { partnerOrgId: screen.partnerOrgId },
          orderBy: [{ isGlobal: 'desc' }, { createdAt: 'asc' }],
        });
        if (sources.length > 0) {
          return this.aggregateFromSources(sources);
        }
      }
    }

    // Fallback: legacy global channels table
    return this.prisma.tvChannel.findMany({
      where: { isActive: true },
      orderBy: { number: 'asc' },
    });
  }

  private async aggregateFromSources(
    sources: Array<{ id: string; url: string; isGlobal: boolean; channelName: string | null }>,
  ) {
    const channels: Array<{
      id: string;
      name: string;
      number: number;
      logoUrl: string | null;
      streamUrl: string;
      category: string;
      isActive: boolean;
    }> = [];
    let number = 1;

    for (const src of sources) {
      if (!src.isGlobal) {
        channels.push({
          id: src.id,
          name: src.channelName ?? 'Chaîne',
          number: number++,
          logoUrl: null,
          streamUrl: src.url,
          category: 'general',
          isActive: true,
        });
        continue;
      }

      try {
        const res = await fetch(src.url);
        if (!res.ok) {
          this.logger.warn(`Playlist fetch failed (${res.status}): ${src.url}`);
          continue;
        }
        const text = await res.text();
        if (!text.trimStart().startsWith('#EXTM3U')) {
          this.logger.warn(`Playlist not a valid M3U8: ${src.url}`);
          continue;
        }
        const parsed = parseM3U(text);
        for (const ch of parsed) {
          channels.push({
            id: `${src.id}:${number}`,
            name: ch.name,
            number: number++,
            logoUrl: ch.logoUrl,
            streamUrl: ch.streamUrl,
            category: ch.group?.toLowerCase() ?? 'general',
            isActive: true,
          });
        }
      } catch (err) {
        this.logger.warn(`Playlist fetch error (${src.url}): ${(err as Error).message}`);
      }
    }

    return channels;
  }

  /** Get all active streaming services */
  async getStreamingServices() {
    return this.prisma.streamingService.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Get activities for a specific org */
  async getActivities(orgId: string) {
    return this.prisma.activityPlace.findMany({
      where: { orgId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Partner CRUD ────────────────────────────────────────────────────────

  /** Upsert TV config for a screen (partner endpoint) */
  async upsertConfig(
    screenId: string,
    orgId: string,
    data: {
      enabledModules?: any;
      defaultTab?: 'TNT' | 'STREAMING' | 'ACTIVITIES' | 'SETTINGS';
      partnerLogoUrl?: string | null;
      welcomeMessage?: string | null;
      tickerText?: string | null;
    },
  ) {
    // Verify screen belongs to this org
    const screen = await this.prisma.screen.findFirst({
      where: { id: screenId, partnerOrgId: orgId },
    });
    if (!screen) throw new NotFoundException('Screen not found or not owned by this organization');

    const config = await this.prisma.tvConfig.upsert({
      where: { screenId },
      create: {
        screenId,
        orgId,
        enabledModules: data.enabledModules ?? ['TNT', 'STREAMING', 'ACTIVITIES'],
        defaultTab: data.defaultTab ?? 'TNT',
        partnerLogoUrl: data.partnerLogoUrl,
        welcomeMessage: data.welcomeMessage,
        tickerText: data.tickerText,
      },
      update: {
        ...(data.enabledModules !== undefined && { enabledModules: data.enabledModules }),
        ...(data.defaultTab !== undefined && { defaultTab: data.defaultTab }),
        ...(data.partnerLogoUrl !== undefined && { partnerLogoUrl: data.partnerLogoUrl }),
        ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage }),
        ...(data.tickerText !== undefined && { tickerText: data.tickerText }),
      },
    });

    this.logger.log(`TvConfig upserted for screen ${screenId}`);

    await this.deviceGateway.pushToScreen(screenId, 'tvConfig:update', {
      screenId,
      reason: 'branding_updated',
    });

    return config;
  }

  // ── Activity CRUD (partner) ──────────────────────────────────────────────

  async createActivity(
    orgId: string,
    data: {
      name: string;
      description?: string;
      category?: string;
      imageUrl?: string;
      address?: string;
      phone?: string;
      website?: string;
      sortOrder?: number;
    },
  ) {
    return this.prisma.activityPlace.create({
      data: {
        orgId,
        name: data.name,
        description: data.description,
        category: (data.category as any) ?? 'OTHER',
        imageUrl: data.imageUrl,
        address: data.address,
        phone: data.phone,
        website: data.website,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateActivity(
    id: string,
    orgId: string,
    data: Partial<{
      name: string;
      description: string | null;
      category: string;
      imageUrl: string | null;
      address: string | null;
      phone: string | null;
      website: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const activity = await this.prisma.activityPlace.findFirst({
      where: { id, orgId },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    return this.prisma.activityPlace.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category as any }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.website !== undefined && { website: data.website }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteActivity(id: string, orgId: string) {
    const activity = await this.prisma.activityPlace.findFirst({
      where: { id, orgId },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    await this.prisma.activityPlace.delete({ where: { id } });
    return { deleted: true };
  }

  async listActivities(orgId: string) {
    return this.prisma.activityPlace.findMany({
      where: { orgId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
