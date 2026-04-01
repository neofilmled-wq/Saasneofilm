'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { useAdInterval } from '@/hooks/use-ad-interval';
import { deviceApi, DeviceAuthError, type IptvChannel, type TvChannel } from '@/lib/device-api';

interface TntPageProps {
  /** DB channels (may have streamUrl or not) */
  channels: TvChannel[];
  /** Callback when auth fails */
  onAuthError?: () => void;
  /** Called when user opens an HLS channel — parent renders the full-screen player */
  onChannelOpen?: (channel: DisplayChannel) => void;
  /** Called when user opens a web TV channel (time2replay) — parent renders full-screen iframe */
  onWebChannelOpen?: (channel: { name: string; webUrl: string }) => void;
}

const GROUP_LABELS: Record<string, string> = {
  france: 'France',
  news: 'Information',
  sport: 'Sport',
  kids: 'Jeunesse',
  music: 'Musique',
  culture: 'Culture & Découverte',
  entertainment: 'Divertissement',
  general: 'Chaînes générales',
  other: 'Autres',
};

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';


/** Unified channel type for display */
interface DisplayChannel {
  id: string;
  name: string;
  logoUrl: string | null;
  streamUrl: string | null;
  group: string;
  isLive: boolean;
}

/** Official HLS M3U8 streams (played natively via hls.js — best quality) */
const HLS_STREAMS: Record<string, string> = {
  'arte': 'https://artesimulcast.akamaized.net/hls/live/2031003/artelive_fr/master.m3u8',
  'france 24': 'https://stream.france24.com/live/hls/f24_fr.m3u8',
  'france24': 'https://stream.france24.com/live/hls/f24_fr.m3u8',
  'cgtn français': 'https://news.cgtn.com/resource/live/french/cgtn-f.m3u8',
  'cgtn francais': 'https://news.cgtn.com/resource/live/french/cgtn-f.m3u8',
  'tv5monde info': 'https://ott.tv5monde.com/Content/HLS/Live/channel(info)/index.m3u8',
  'tv5 monde info': 'https://ott.tv5monde.com/Content/HLS/Live/channel(info)/index.m3u8',
  'tv5monde fbs': 'https://ott.tv5monde.com/Content/HLS/Live/channel(fbs)/index.m3u8',
  'tv5 monde fbs': 'https://ott.tv5monde.com/Content/HLS/Live/channel(fbs)/index.m3u8',
  'tv5monde europe': 'https://ott.tv5monde.com/Content/HLS/Live/channel(europe)/index.m3u8',
  'tv5 monde europe': 'https://ott.tv5monde.com/Content/HLS/Live/channel(europe)/index.m3u8',
  'tv5 monde': 'https://ott.tv5monde.com/Content/HLS/Live/channel(fbs)/index.m3u8',
  'tv5monde': 'https://ott.tv5monde.com/Content/HLS/Live/channel(fbs)/index.m3u8',
  'bfmtv': 'https://ncdn-live-bfm.pfd.sfr.net/shls/LIVE$BFM_TV/index.m3u8',
  'bfm tv': 'https://ncdn-live-bfm.pfd.sfr.net/shls/LIVE$BFM_TV/index.m3u8',
  'bfm': 'https://ncdn-live-bfm.pfd.sfr.net/shls/LIVE$BFM_TV/index.m3u8',
};

/** Fallback: official channel web URLs (opened in Android WebView fullscreen) */
const TIME2REPLAY_CHANNELS: Record<string, string> = {
  'tf1':            'https://www.tf1.fr/tmc/direct',
  'france 2':       'https://www.france.tv/france-2/direct',
  'france 3':       'https://www.france.tv/france-3/direct',
  'france 4':       'https://www.france.tv/france-4/direct',
  'france 5':       'https://www.france.tv/france-5/direct',
  'france info':    'https://www.france.tv/franceinfo/direct',
  'franceinfo':     'https://www.france.tv/franceinfo/direct',
  'franceinfo:':    'https://www.france.tv/franceinfo/direct',
  'france 24':      'https://www.france24.com/fr/direct',
  'arte':           'https://www.arte.tv/fr/direct/',
  'c8':             'https://www.c8.fr/direct',
  'tmc':            'https://www.tf1.fr/tmc/direct',
  'tfx':            'https://www.tf1.fr/tfx/direct',
  'tf1 series films':'https://www.tf1.fr/tfsf/direct',
  'lci':            'https://www.lci.fr/direct/',
  'bfmtv':          'https://www.bfmtv.com/en-direct/',
  'bfm tv':         'https://www.bfmtv.com/en-direct/',
  'bfm':            'https://www.bfmtv.com/en-direct/',
  'bfm business':   'https://bfmbusiness.bfmtv.com/en-direct/',
  'cnews':          'https://www.cnews.fr/direct',
  'cstar':          'https://www.c8.fr/cstar/direct',
  'gulli':          'https://www.gulli.fr/direct',
  'rmc story':      'https://rmcstory.bfmtv.com/en-direct/',
  'rmcstory':       'https://rmcstory.bfmtv.com/en-direct/',
  'rmc découverte': 'https://rmcdecouverte.bfmtv.com/en-direct/',
  'rmc decouverte': 'https://rmcdecouverte.bfmtv.com/en-direct/',
  'lcp':            'https://www.lcp.fr/direct',
  'public sénat':   'https://www.publicsenat.fr/direct',
  'public senat':   'https://www.publicsenat.fr/direct',
  'tv5 monde':      'https://www.tv5monde.com/tv/direct',
  'tv5monde':       'https://www.tv5monde.com/tv/direct',
  'euronews':       'https://fr.euronews.com/live',
  'l\'equipe':      'https://www.lequipe.fr/tv/direct',
  'lequipe':        'https://www.lequipe.fr/tv/direct',
  'l\'équipe':      'https://www.lequipe.fr/tv/direct',
  'l\'equipe tv':   'https://www.lequipe.fr/tv/direct',
  'm6':             'https://www.6play.fr/m6/direct',
  'w9':             'https://www.6play.fr/w9/direct',
};

/** Get HLS stream URL for a channel (exact match only — no substring to avoid false positives like "france 2" → "france 24") */
function getHlsStreamUrl(channelName: string): string | null {
  const key = channelName.toLowerCase().trim();
  return HLS_STREAMS[key] ?? null;
}

/** Get web TV URL for a channel name (exact match, then word-boundary match) */
function getWebTvUrl(channelName: string): string | null {
  const key = channelName.toLowerCase().trim();
  if (TIME2REPLAY_CHANNELS[key]) return TIME2REPLAY_CHANNELS[key];
  // Word-boundary fallback: key must start with or equal a known entry
  for (const [k, url] of Object.entries(TIME2REPLAY_CHANNELS)) {
    if (key === k || key.startsWith(k + ' ') || key.startsWith(k + ':')) return url;
  }
  return null;
}

/**
 * TNT / IPTV page.
 *
 * Data strategy:
 * 1. Shows DB channels immediately (from useTvConfig, passed as props)
 * 2. Fetches IPTV channels from /tv/iptv/channels (M3U backend, cached 6h)
 * 3. Merges: DB channels override IPTV for matching names
 * 4. Clicking a channel with streamUrl → opens IptvPlayer
 *
 * States: loading / loaded / error — UI is NEVER dead.
 */
export function TntPage({ channels: dbChannels, onAuthError, onChannelOpen, onWebChannelOpen }: TntPageProps) {
  const [iptvChannels, setIptvChannels] = useState<IptvChannel[]>([]);
  const [iptvState, setIptvState] = useState<LoadingState>('idle');
  const [iptvError, setIptvError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useDpadNavigation({ containerRef, autoFocus: true, initialIndex: 0 });

  // Periodic ad injection every 2h while player is active
  const { startInterval, stopInterval } = useAdInterval();

  const fetchIptv = useCallback(async () => {
    setIptvState('loading');
    setIptvError(null);
    try {
      const result = await deviceApi.getIptvChannels();
      setIptvChannels(result);
      setIptvState('loaded');
    } catch (err) {
      if (err instanceof DeviceAuthError) {
        onAuthError?.();
        return;
      }
      console.warn('[TNT] IPTV fetch failed:', err);
      setIptvError((err as Error).message || 'Impossible de charger les chaînes IPTV');
      setIptvState('error');
    }
  }, [onAuthError]);

  useEffect(() => {
    fetchIptv();
  }, [fetchIptv]);

  // Merge DB channels + IPTV channels
  const displayChannels: DisplayChannel[] = mergeChannels(dbChannels, iptvChannels);

  // Group channels
  const grouped = displayChannels.reduce<Record<string, DisplayChannel[]>>((acc, ch) => {
    const g = ch.group.toLowerCase() || 'other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(ch);
    return acc;
  }, {});

  const groupOrder = [
    'france',
    'general',
    ...Object.keys(grouped)
      .filter((k) => k !== 'france' && k !== 'general' && k !== 'other')
      .sort(),
    'other',
  ].filter((k) => grouped[k]?.length);

  // Stop ad interval when unmounted
  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  // === GRID MODE ===
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* IPTV status bar */}
      {iptvState === 'loading' && (
        <div className="flex items-center gap-[0.5em] px-[1em] py-[0.4em]" style={{ fontSize: '0.75em', background: 'rgba(14, 165, 233, 0.08)', borderBottom: '1px solid rgba(14, 165, 233, 0.15)' }}>
          <div className="h-[0.8em] w-[0.8em] animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <span className="text-primary/80">Chargement des chaînes IPTV...</span>
        </div>
      )}

      {iptvState === 'error' && (
        <div className="flex items-center justify-between bg-red-500/10 px-[1em] py-[0.4em]" style={{ fontSize: '0.75em' }}>
          <span className="text-red-400">{iptvError || 'Erreur IPTV'}</span>
          <button
            onClick={fetchIptv}
            data-tv-focusable className="rounded bg-red-500/20 px-[0.75em] py-[0.2em] text-red-300 transition-colors hover:bg-red-500/30"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Channel grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ padding: 'var(--tv-safe-x, 1.5rem)' }}>
        {displayChannels.length === 0 && iptvState !== 'loading' ? (
          <div className="flex h-full flex-col items-center justify-center gap-[1em]">
            <p className="text-muted-foreground" style={{ fontSize: '1.25em' }}>
              Aucune chaîne disponible
            </p>
            <button
              onClick={fetchIptv}
              className="rounded-lg bg-primary px-[1.5em] py-[0.5em] text-white transition-colors hover:bg-primary/80"
              style={{ fontSize: '0.9em' }}
            >
              Recharger
            </button>
          </div>
        ) : (
          groupOrder.map((groupKey) => {
            const groupChannels = grouped[groupKey];
            if (!groupChannels?.length) return null;

            return (
              <div key={groupKey} className="mb-[1.5em]">
                <h2
                  className="mb-[0.5em] font-semibold text-muted-foreground"
                  style={{ fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                >
                  {GROUP_LABELS[groupKey] || groupKey}
                </h2>
                <div
                  className="grid gap-[0.75em]"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
                >
                  {groupChannels.map((ch) => {
                    const webUrl = getWebTvUrl(ch.name);
                    const canWatch = !!ch.streamUrl || !!webUrl;
                    return (
                    <button
                      key={ch.id}
                      onClick={() => {
                        if (ch.streamUrl) {
                          startInterval();
                          onChannelOpen?.(ch);
                        } else if (webUrl) {
                          onWebChannelOpen?.({ name: ch.name, webUrl });
                        }
                      }}
                      disabled={!canWatch}
                      data-tv-focusable className="tv-card tv-card--channel flex flex-col items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ padding: '0.75em', aspectRatio: '4/3' }}
                    >
                      {ch.logoUrl ? (
                        <img
                          src={ch.logoUrl}
                          alt={ch.name}
                          className="mb-[0.25em] h-[2.5em] w-auto object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div
                          className="mb-[0.25em] flex items-center justify-center rounded-lg font-bold text-primary"
                          style={{ width: '2.5em', height: '2.5em', fontSize: '1em', background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.25)' }}
                        >
                          {ch.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span
                        className="max-w-full truncate text-center font-medium text-foreground"
                        style={{ fontSize: '0.75em' }}
                      >
                        {ch.name}
                      </span>
                      {ch.streamUrl ? (
                        <span className="flex items-center gap-[0.2em] text-green-400" style={{ fontSize: '0.6em' }}>
                          <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-green-400" />
                          En direct
                        </span>
                      ) : webUrl ? (
                        <span className="flex items-center gap-[0.2em] text-blue-400" style={{ fontSize: '0.6em' }}>
                          <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-blue-400" />
                          Web
                        </span>
                      ) : (
                        <span className="text-muted-foreground" style={{ fontSize: '0.6em' }}>
                          Indisponible
                        </span>
                      )}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Merge DB channels (with number/order) and IPTV channels (from M3U).
 * DB channels take priority for matching names.
 */
function mergeChannels(db: TvChannel[], iptv: IptvChannel[]): DisplayChannel[] {
  const result: DisplayChannel[] = [];
  const seen = new Set<string>();

  // DB channels first (they have explicit ordering via number)
  for (const ch of db) {
    const key = ch.name.toLowerCase();
    seen.add(key);
    // Use official HLS stream if available, otherwise keep DB streamUrl
    const hlsUrl = getHlsStreamUrl(ch.name);
    const streamUrl = hlsUrl || ch.streamUrl;
    result.push({
      id: ch.id,
      name: ch.name,
      logoUrl: ch.logoUrl,
      streamUrl,
      group: ch.category || 'general',
      isLive: !!streamUrl,
    });
  }

  // IPTV channels (only add ones not already in DB)
  for (const ch of iptv) {
    const key = ch.name.toLowerCase();
    if (seen.has(key)) {
      // If DB channel exists but has no streamUrl, upgrade it with IPTV url
      const existing = result.find((r) => r.name.toLowerCase() === key);
      if (existing && !existing.streamUrl && ch.streamUrl) {
        existing.streamUrl = ch.streamUrl;
        existing.isLive = true;
        if (!existing.logoUrl && ch.logoUrl) existing.logoUrl = ch.logoUrl;
      }
      continue;
    }
    seen.add(key);
    const hlsUrl = getHlsStreamUrl(ch.name);
    const streamUrl = hlsUrl || ch.streamUrl;
    result.push({
      id: ch.id,
      name: ch.name,
      logoUrl: ch.logoUrl,
      streamUrl,
      group: ch.group || 'other',
      isLive: !!streamUrl || ch.isLive,
    });
  }

  return result;
}
