'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { useAdInterval } from '@/hooks/use-ad-interval';

import type { StreamingService } from '@/lib/device-api';

interface StreamingPageProps {
  services: StreamingService[];
}

/** Known streaming app package names with brand info */
const KNOWN_STREAMING_APPS: {
  packageName: string;
  name: string;
  color: string;
  /** If set, opens this URL in a split-screen browser WebView instead of launching native app */
  webUrl?: string;
}[] = [
  { packageName: 'com.netflix.ninja', name: 'Netflix', color: '#E50914', webUrl: 'https://www.netflix.com/browse' },
  { packageName: 'com.netflix.mediaclient', name: 'Netflix', color: '#E50914', webUrl: 'https://www.netflix.com/browse' },
  { packageName: 'com.disney.disneyplus', name: 'Disney+', color: '#113CCF' },
  { packageName: 'com.disney.disneyplus.tv', name: 'Disney+', color: '#113CCF' },
  { packageName: 'com.amazon.amazonvideo.livingroom', name: 'Prime Video', color: '#00A8E1' },
  { packageName: 'com.amazon.avod', name: 'Prime Video', color: '#00A8E1' },
  { packageName: 'com.google.android.youtube.tv', name: 'YouTube', color: '#FF0000', webUrl: 'https://m.youtube.com' },
  { packageName: 'com.google.android.youtube', name: 'YouTube', color: '#FF0000', webUrl: 'https://m.youtube.com' },
  { packageName: 'com.google.android.youtube.tvkids', name: 'YouTube Kids', color: '#FF0000' },
  { packageName: 'com.hbo.hbonow', name: 'HBO Max', color: '#5822B4' },
  { packageName: 'com.wbd.stream', name: 'Max', color: '#002BE7' },
  { packageName: 'com.apple.atve.androidtv.appletv', name: 'Apple TV+', color: '#333333' },
  { packageName: 'com.canalplus.canalplustv', name: 'Canal+', color: '#1A1A1A' },
  { packageName: 'com.canal.android.canal', name: 'Canal+', color: '#1A1A1A' },
  { packageName: 'fr.canalplus.mycanal', name: 'myCanal', color: '#1A1A1A' },
  { packageName: 'com.molotov.app', name: 'Molotov', color: '#0062FF' },
  { packageName: 'fr.free.oqee.tv', name: 'OQEE', color: '#E4003A' },
  { packageName: 'com.plexapp.android', name: 'Plex', color: '#E5A00D' },
  { packageName: 'com.spotify.tv.android', name: 'Spotify', color: '#1DB954' },
  { packageName: 'com.crunchyroll.crunchyroid', name: 'Crunchyroll', color: '#F47521' },
  { packageName: 'com.twitch.android.app', name: 'Twitch', color: '#9146FF', webUrl: 'https://m.twitch.tv' },
  { packageName: 'fr.francetv.pluzz', name: 'france.tv', color: '#0F3E8C' },
  { packageName: 'com.orange.ocsgo', name: 'OCS', color: '#FF6600' },
  { packageName: 'com.arte.android.tv', name: 'ARTE', color: '#F26122' },
  { packageName: 'com.paramount.plus', name: 'Paramount+', color: '#0064FF' },
  { packageName: 'com.peacocktv.peacockandroid', name: 'Peacock', color: '#000000' },
  { packageName: 'com.starz.starzplay.android', name: 'STARZ', color: '#000000' },
  { packageName: 'com.vudu.air', name: 'Vudu', color: '#3399FF' },
  { packageName: 'tv.dazn', name: 'DAZN', color: '#F1F514' },
];

interface InstalledStreamingApp {
  packageName: string;
  name: string;
  color: string;
  icon: string;
  webUrl?: string;
}

function getInstalledStreamingApps(): InstalledStreamingApp[] {
  try {
    if (!window.NeoFilmAndroid?.getInstalledApps) return [];
    const allApps: { packageName: string; label: string; icon: string }[] = JSON.parse(
      window.NeoFilmAndroid.getInstalledApps(),
    );
    const installedPkgs = new Set(allApps.map((a) => a.packageName));

    const found: InstalledStreamingApp[] = [];
    const seenNames = new Set<string>();

    for (const known of KNOWN_STREAMING_APPS) {
      if (installedPkgs.has(known.packageName) && !seenNames.has(known.name)) {
        seenNames.add(known.name);
        const appInfo = allApps.find((a) => a.packageName === known.packageName);
        found.push({
          packageName: known.packageName,
          name: known.name,
          color: known.color,
          icon: appInfo?.icon ?? '',
          webUrl: known.webUrl,
        });
      }
    }
    return found;
  } catch (e) {
    console.error('[StreamingPage] Failed to get streaming apps:', e);
    return [];
  }
}

function launchApp(packageName: string) {
  try {
    window.NeoFilmAndroid?.launchApp?.(packageName);
  } catch (e) {
    console.error('[StreamingPage] Failed to launch:', e);
  }
}

/**
 * Streaming services grid — shows installed streaming apps from Android + configured services.
 * Apps with a webUrl (YouTube, Twitch) open in an embedded iframe instead of launching natively.
 */
export function StreamingPage({ services }: StreamingPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusFirst } = useDpadNavigation({ containerRef, autoFocus: true });
  useEffect(() => { const t = setTimeout(focusFirst, 100); return () => clearTimeout(t); }, [focusFirst]);

  const { startInterval, isShowingAd } = useAdInterval();
  useEffect(() => { startInterval(); }, [startInterval]);

  const [installedApps, setInstalledApps] = useState<InstalledStreamingApp[]>([]);
  const isAndroid = typeof window !== 'undefined' && !!window.NeoFilmAndroid;

  useEffect(() => {
    if (isAndroid) {
      setInstalledApps(getInstalledStreamingApps());
    }
  }, [isAndroid]);

  const handleAppClick = useCallback((app: InstalledStreamingApp) => {
    if (app.webUrl && window.NeoFilmAndroid?.openWebPage) {
      // Open in split-screen browser WebView (native Android side)
      window.NeoFilmAndroid.openWebPage(app.webUrl);
    } else {
      launchApp(app.packageName);
    }
  }, []);

  /** Map service names to web URLs for split-screen browsing */
  const handleServiceClick = useCallback((service: StreamingService) => {
    const webUrls: Record<string, string> = {
      'Netflix': 'https://www.netflix.com/browse',
      'Disney+': 'https://www.disneyplus.com',
      'Amazon Prime Video': 'https://www.primevideo.com',
      'Prime Video': 'https://www.primevideo.com',
      'YouTube': 'https://m.youtube.com',
      'HBO Max': 'https://play.max.com',
      'Max': 'https://play.max.com',
      'Apple TV+': 'https://tv.apple.com',
      'Canal+': 'https://www.canalplus.com',
      'myCanal': 'https://www.canalplus.com',
      'myCANAL': 'https://www.canalplus.com',
      'Paramount+': 'https://www.paramountplus.com',
      'Crunchyroll': 'https://www.crunchyroll.com',
      'Twitch': 'https://m.twitch.tv',
      'ARTE': 'https://www.arte.tv/fr/',
      'france.tv': 'https://www.france.tv',
      'Molotov': 'https://www.molotov.tv',
      'Spotify': 'https://open.spotify.com',
      'DAZN': 'https://www.dazn.com',
      'Plex': 'https://app.plex.tv',
    };
    const url = webUrls[service.name];
    if (url && window.NeoFilmAndroid?.openWebPage) {
      window.NeoFilmAndroid.openWebPage(url);
    }
  }, []);

  const hasInstalledApps = installedApps.length > 0;
  const hasConfiguredServices = services.length > 0;

  // ── Grid mode ──
  if (!hasInstalledApps && !hasConfiguredServices) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground" style={{ fontSize: '1.25em' }}>
          Aucun service de streaming disponible
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full" style={{ background: 'transparent' }}>
      {/* Ambient mesh glow — deep blue/cyan tones */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%', width: '50%', height: '60%',
          background: 'radial-gradient(ellipse, rgba(14, 165, 233, 0.1) 0%, transparent 65%)',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', left: '-5%', width: '40%', height: '50%',
          background: 'radial-gradient(ellipse, rgba(6, 182, 212, 0.08) 0%, transparent 65%)',
          filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', top: '30%', left: '40%', width: '30%', height: '40%',
          background: 'radial-gradient(ellipse, rgba(2, 132, 199, 0.05) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />
      </div>
      {/* Periodic ad overlay — shown for 15–30 s every 2 h */}
      {isShowingAd && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
          <p className="mb-[0.5em] text-muted-foreground" style={{ fontSize: '0.75em', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Publicite
          </p>
          <div className="flex h-[60%] w-[80%] max-w-[960px] items-center justify-center rounded-xl bg-card">
            <span className="text-muted-foreground" style={{ fontSize: '1.25em' }}>Espace publicitaire</span>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="relative z-10 h-full overflow-y-auto tv-page-enter"
        style={{ padding: 'var(--tv-safe-x, 1.5rem)' }}
      >
        {/* Installed streaming apps from Android */}
        {hasInstalledApps && (
          <>
            <h2
              className="mb-[0.75em] font-semibold text-muted-foreground"
              style={{ fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              Vos applications de streaming
            </h2>
            <div
              className="grid gap-[1em] mb-[1.5em]"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {installedApps.map((app) => (
                <button
                  key={app.packageName}
                  data-tv-focusable
                  className="tv-card tv-card--service flex flex-col items-center justify-center"
                  style={{
                    backgroundColor: `${app.color}22`,
                    borderColor: app.color,
                    padding: '1.5em 1em',
                    aspectRatio: '16/9',
                  }}
                  onClick={() => handleAppClick(app)}
                >
                  {app.icon ? (
                    <img
                      src={`data:image/png;base64,${app.icon}`}
                      alt={app.name}
                      className="mb-[0.5em] h-[3em] w-[3em] rounded-xl object-contain"
                    />
                  ) : (
                    <div
                      className="mb-[0.5em] flex items-center justify-center rounded-xl font-bold"
                      style={{
                        width: '3em',
                        height: '3em',
                        fontSize: '1.25em',
                        backgroundColor: app.color,
                        color: '#fff',
                      }}
                    >
                      {app.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-center font-semibold text-foreground" style={{ fontSize: '1em' }}>
                    {app.name}
                  </span>
                  {app.webUrl && (
                    <span className="mt-[0.2em] text-muted-foreground" style={{ fontSize: '0.65em' }}>
                      Web
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Backend services hidden — only show installed apps */}
      </div>
    </div>
  );
}
