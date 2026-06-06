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
  { packageName: 'com.netflix.ninja', name: 'Netflix', color: '#E50914' },
  { packageName: 'com.netflix.mediaclient', name: 'Netflix', color: '#E50914' },
  { packageName: 'com.disney.disneyplus', name: 'Disney+', color: '#113CCF' },
  { packageName: 'com.disney.disneyplus.tv', name: 'Disney+', color: '#113CCF' },
  { packageName: 'com.amazon.amazonvideo.livingroom', name: 'Prime Video', color: '#00A8E1' },
  { packageName: 'com.amazon.avod', name: 'Prime Video', color: '#00A8E1' },
  { packageName: 'com.google.android.youtube.tv', name: 'YouTube', color: '#FF0000' },
  { packageName: 'com.google.android.youtube', name: 'YouTube', color: '#FF0000' },
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
  { packageName: 'com.twitch.android.app', name: 'Twitch', color: '#9146FF' },
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

  /** Map service names to web URLs for split-screen browsing.
   *  Kept for partner-configured services (currently hidden in new UI). */
  // @ts-expect-error reserved for partner-configured backend services
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  return (
    <div className="neo-subscreen-main neo-stage" style={{ height: '100%' }}>
      <div className="neo-sub-head">
        <div>
          <div className="neo-crumb">Accueil › Streaming</div>
          <h1>Applications de streaming</h1>
        </div>
        <div className="neo-count">
          {hasInstalledApps
            ? `${installedApps.length} apps installées`
            : 'Connecté à vos comptes'}
        </div>
      </div>

      {isShowingAd && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)',
          }}
        >
          <p
            style={{
              color: 'var(--neo-t-3)',
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Publicité
          </p>
        </div>
      )}

      {!hasInstalledApps && !hasConfiguredServices ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: 'var(--neo-t-3)', fontSize: '1.1em' }}>
            Aucun service de streaming disponible
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          data-tv-nav-group="streaming-apps"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 18,
            padding: 4,
            overflow: 'auto',
          }}
        >
          {installedApps.map((app) => (
            <button
              key={app.packageName}
              data-tv-focusable
              onClick={() => handleAppClick(app)}
              className="neo-app-card"
              style={{
                appearance: 'none',
                cursor: 'pointer',
                color: 'inherit',
                fontFamily: 'inherit',
                gap: 10,
                flexDirection: 'column',
                background: `linear-gradient(135deg, ${app.color}, ${app.color}33)`,
              }}
            >
              {app.icon ? (
                <img
                  src={`data:image/png;base64,${app.icon}`}
                  alt={app.name}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#000',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 22,
                  }}
                >
                  {app.name.charAt(0)}
                </div>
              )}
              <span className="neo-app-name">{app.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
