import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';

interface ParsedChannel {
  name: string;
  streamUrl: string;
  logoUrl: string | null;
  group: string | null;
}

/**
 * Official French TNT whitelist (25 chaînes).
 * `names` = lowercase alternatives accepted from an M3U playlist.
 * `displayName` = canonical label shown on TV.
 */
const TNT_WHITELIST: Array<{ number: number; names: string[]; displayName: string; category: string }> = [
  { number: 1,  names: ['tf1'],                                            displayName: 'TF1',              category: 'general' },
  { number: 2,  names: ['france 2', 'france2'],                            displayName: 'France 2',         category: 'general' },
  { number: 3,  names: ['france 3', 'france3'],                            displayName: 'France 3',         category: 'general' },
  { number: 4,  names: ['france 4', 'france4'],                            displayName: 'France 4',         category: 'kids' },
  { number: 5,  names: ['france 5', 'france5'],                            displayName: 'France 5',         category: 'culture' },
  { number: 6,  names: ['m6'],                                             displayName: 'M6',               category: 'general' },
  { number: 7,  names: ['arte'],                                           displayName: 'Arte',             category: 'culture' },
  { number: 8,  names: ['lcp', 'public sénat', 'public senat'],            displayName: 'LCP / Public Sénat', category: 'news' },
  { number: 9,  names: ['w9'],                                             displayName: 'W9',               category: 'entertainment' },
  { number: 10, names: ['tmc'],                                            displayName: 'TMC',              category: 'entertainment' },
  { number: 11, names: ['tfx'],                                            displayName: 'TFX',              category: 'entertainment' },
  { number: 12, names: ['gulli'],                                          displayName: 'Gulli',            category: 'kids' },
  { number: 13, names: ['bfmtv', 'bfm tv'],                                displayName: 'BFMTV',            category: 'news' },
  { number: 14, names: ['cnews'],                                          displayName: 'CNews',            category: 'news' },
  { number: 15, names: ['lci'],                                            displayName: 'LCI',              category: 'news' },
  { number: 16, names: ['franceinfo', 'france info', 'franceinfo:'],       displayName: 'Franceinfo',       category: 'news' },
  { number: 17, names: ['cstar'],                                          displayName: 'CStar',            category: 'music' },
  { number: 18, names: ['t18'],                                            displayName: 'T18',              category: 'general' },
  { number: 19, names: ['novo19', 'novo 19'],                              displayName: 'NOVO19',           category: 'general' },
  { number: 20, names: ['tf1 séries films', 'tf1 series films', 'tfsf'],   displayName: 'TF1 Séries Films', category: 'entertainment' },
  { number: 21, names: ["l'equipe", "l'équipe", 'lequipe', 'equipe'],      displayName: "L'Équipe",         category: 'sport' },
  { number: 22, names: ['6ter'],                                           displayName: '6ter',             category: 'entertainment' },
  { number: 23, names: ['rmc story', 'rmcstory'],                          displayName: 'RMC Story',        category: 'entertainment' },
  { number: 24, names: ['rmc découverte', 'rmc decouverte'],               displayName: 'RMC Découverte',   category: 'entertainment' },
  { number: 25, names: ['chérie 25', 'cherie 25'],                         displayName: 'Chérie 25',        category: 'entertainment' },
];

function normalizeChannelName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ') // strip (1080p), (fr)…
    .replace(/\s*\[[^\]]*\]\s*/g, ' ') // strip [Geo-blocked]
    .replace(/\b(uhd|4k|fhd|hd|sd)\b/g, '') // strip quality suffix
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTntChannel(parsedName: string) {
  const norm = normalizeChannelName(parsedName);
  for (const ch of TNT_WHITELIST) {
    if (ch.names.some((n) => norm === n || norm.startsWith(n + ' ') || norm.startsWith(n + ':'))) {
      return ch;
    }
  }
  return null;
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

// In-memory cache for parsed M3U playlists (per URL). TTL = 10 min.
const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000;
const playlistCache = new Map<string, { fetchedAt: number; channels: ParsedChannel[] }>();

async function fetchAndCacheParsedPlaylist(url: string, logger: Logger): Promise<ParsedChannel[] | null> {
  const cached = playlistCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < PLAYLIST_CACHE_TTL_MS) {
    return cached.channels;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`Playlist fetch failed (${res.status}): ${url}`);
      return null;
    }
    const text = await res.text();
    if (!text.trimStart().startsWith('#EXTM3U')) {
      logger.warn(`Playlist not a valid M3U8: ${url}`);
      return null;
    }
    const channels = parseM3U(text);
    playlistCache.set(url, { fetchedAt: Date.now(), channels });
    return channels;
  } catch (err) {
    logger.warn(`Playlist fetch error (${url}): ${(err as Error).message}`);
    return null;
  }
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
    // Keep one entry per TNT channel number (first match wins)
    const byNumber = new Map<
      number,
      {
        id: string;
        name: string;
        number: number;
        logoUrl: string | null;
        streamUrl: string;
        category: string;
        isActive: boolean;
      }
    >();

    // Single-channel sources first (explicit partner choice)
    for (const src of sources.filter((s) => !s.isGlobal)) {
      const match = matchTntChannel(src.channelName ?? '');
      if (!match) continue;
      if (byNumber.has(match.number)) continue;
      byNumber.set(match.number, {
        id: src.id,
        name: match.displayName,
        number: match.number,
        logoUrl: null,
        streamUrl: src.url,
        category: match.category,
        isActive: true,
      });
    }

    // Then global playlists (filtered by whitelist)
    for (const src of sources.filter((s) => s.isGlobal)) {
      const parsed = await fetchAndCacheParsedPlaylist(src.url, this.logger);
      if (!parsed) continue;
      for (const ch of parsed) {
        const match = matchTntChannel(ch.name);
        if (!match) continue;
        if (byNumber.has(match.number)) continue;
        byNumber.set(match.number, {
          id: `${src.id}:${match.number}`,
          name: match.displayName,
          number: match.number,
          logoUrl: ch.logoUrl,
          streamUrl: ch.streamUrl,
          category: match.category,
          isActive: true,
        });
      }
    }

    return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
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
