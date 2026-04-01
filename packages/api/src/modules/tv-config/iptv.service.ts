import { Injectable, Logger } from '@nestjs/common';

export interface IptvChannel {
  id: string;
  name: string;
  logoUrl: string | null;
  group: string;
  streamUrl: string;
  country: string;
  isLive: boolean;
}

interface CacheEntry {
  channels: IptvChannel[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_M3U_URL =
  'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_france.m3u8';

@Injectable()
export class IptvService {
  private readonly logger = new Logger(IptvService.name);
  private cache: CacheEntry | null = null;

  /**
   * Get IPTV channels from the configured M3U playlist.
   * Cached in memory for 6 hours.
   */
  async getChannels(options?: {
    q?: string;
    group?: string;
    limit?: number;
  }): Promise<IptvChannel[]> {
    let channels = await this.fetchWithCache();

    if (options?.group) {
      const g = options.group.toLowerCase();
      channels = channels.filter(
        (ch) => ch.group.toLowerCase().includes(g) || ch.country.toLowerCase().includes(g),
      );
    }

    if (options?.q) {
      const q = options.q.toLowerCase();
      channels = channels.filter(
        (ch) => ch.name.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q),
      );
    }

    if (options?.limit && options.limit > 0) {
      channels = channels.slice(0, options.limit);
    }

    return channels;
  }

  /**
   * Force refresh the cache (for admin use).
   */
  async refreshCache(): Promise<{ count: number }> {
    this.cache = null;
    const channels = await this.fetchWithCache();
    return { count: channels.length };
  }

  private async fetchWithCache(): Promise<IptvChannel[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.channels;
    }

    try {
      const channels = await this.fetchAndParse();
      this.cache = { channels, fetchedAt: Date.now() };
      this.logger.log(`IPTV playlist cached: ${channels.length} channels`);
      return channels;
    } catch (err) {
      this.logger.error(`Failed to fetch IPTV playlist: ${(err as Error).message}`);
      // Return stale cache if available
      if (this.cache) {
        this.logger.warn('Returning stale IPTV cache');
        return this.cache.channels;
      }
      return [];
    }
  }

  private async fetchAndParse(): Promise<IptvChannel[]> {
    const url = process.env.IPTV_M3U_URL || DEFAULT_M3U_URL;
    this.logger.log(`Fetching IPTV playlist from: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      const text = await res.text();
      return this.parseM3U(text);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse M3U/M3U8 playlist format.
   *
   * Format:
   * #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
   * https://stream.url/path.m3u8
   */
  private parseM3U(content: string): IptvChannel[] {
    const lines = content.split('\n').map((l) => l.trim());
    const channels: IptvChannel[] = [];
    let idx = 0;

    while (idx < lines.length) {
      const line = lines[idx];

      if (line.startsWith('#EXTINF:')) {
        // Parse metadata line
        const meta = this.parseExtInf(line);
        // Next non-empty, non-comment line should be the URL
        idx++;
        while (idx < lines.length && (lines[idx] === '' || lines[idx].startsWith('#'))) {
          idx++;
        }

        if (idx < lines.length) {
          const streamUrl = lines[idx].trim();
          if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
            // Only include HLS streams (.m3u8) — skip DASH (.mpd) and others
            if (streamUrl.includes('.m3u8') || streamUrl.includes('/live/') || streamUrl.includes('/hls/')) {
              channels.push({
                id: this.slugify(meta.name || `channel-${channels.length}`),
                name: meta.name || 'Unknown',
                logoUrl: meta.logo || null,
                group: meta.group || 'Other',
                streamUrl,
                country: 'FR',
                isLive: true,
              });
            }
          }
        }
      }

      idx++;
    }

    // Deduplicate by name (keep first occurrence)
    const seen = new Set<string>();
    return channels.filter((ch) => {
      const key = ch.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private parseExtInf(line: string): { name: string; logo: string; group: string } {
    let name = '';
    let logo = '';
    let group = '';

    // Extract tvg-name or fallback to display name after comma
    const tvgName = this.extractAttr(line, 'tvg-name');
    const commaIdx = line.lastIndexOf(',');
    const displayName = commaIdx >= 0 ? line.substring(commaIdx + 1).trim() : '';
    name = tvgName || displayName;

    logo = this.extractAttr(line, 'tvg-logo');
    group = this.extractAttr(line, 'group-title');

    return { name, logo, group };
  }

  private extractAttr(line: string, attr: string): string {
    const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
    const match = line.match(regex);
    return match?.[1] || '';
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
