'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { useAdInterval } from '@/hooks/use-ad-interval';

import type { StreamingService } from '@/lib/device-api';

/**
 * Inline brand glyphs — embedded as SVG so they render reliably in the WebView
 * regardless of network availability or asset caching. Each glyph fills its
 * container and uses object-fit: contain semantics via viewBox.
 */
function BrandGlyph({ name }: { name: string }) {
  const base = {
    width: '4.25rem',
    height: '4.25rem',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '0.875rem',
    background: 'rgba(0, 0, 0, 0.45)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  } as const;
  if (name === 'Netflix') {
    return (
      <div style={{ ...base, background: '#000' }}>
        <svg viewBox="0 0 60 80" width="60%" height="60%">
          <defs>
            <linearGradient id="nfx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#E50914" />
              <stop offset="1" stopColor="#7a0610" />
            </linearGradient>
          </defs>
          <path d="M10 5 L10 75 L22 75 L22 38 L38 75 L50 75 L50 5 L38 5 L38 42 L22 5 Z" fill="url(#nfx)" />
        </svg>
      </div>
    );
  }
  if (name === 'Prime Video') {
    return (
      <div style={{ ...base, background: '#0a1428' }}>
        <svg viewBox="0 0 120 60" width="80%" height="80%">
          <text x="60" y="36" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="22" fill="#fff">
            prime
          </text>
          <path d="M16 46 Q60 60 104 46" stroke="#00A8E1" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (name === 'Disney+') {
    return (
      <div style={{ ...base, background: '#0b1838' }}>
        <svg viewBox="0 0 120 50" width="85%" height="85%">
          <text x="55" y="36" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="26" fill="#fff">
            Disney
          </text>
          <text x="100" y="22" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="22" fill="#fff">+</text>
        </svg>
      </div>
    );
  }
  if (name === 'YouTube') {
    return (
      <div style={{ ...base, background: '#fff' }}>
        <svg viewBox="0 0 100 70" width="75%" height="75%">
          <rect x="2" y="6" width="96" height="58" rx="14" fill="#FF0000" />
          <polygon points="40,22 40,48 64,35" fill="#fff" />
        </svg>
      </div>
    );
  }
  // Fallback initial
  return (
    <div style={{ ...base, background: '#1a1a1a' }}>
      <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.5rem' }}>{name.charAt(0)}</span>
    </div>
  );
}

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

  // Featured services that always appear, even if the matching native app
  // isn't installed on the Fire Stick yet. Opens in the WebView split-screen
  // browser via the NeoFilmAndroid bridge — same UX as a native app launch.
  const FEATURED_SERVICES: InstalledStreamingApp[] = [
    { packageName: 'com.netflix.ninja',          name: 'Netflix',     color: '#E50914', icon: '', webUrl: 'https://www.netflix.com/browse' },
    { packageName: 'com.amazon.amazonvideo.livingroom', name: 'Prime Video', color: '#00A8E1', icon: '', webUrl: 'https://www.primevideo.com' },
    { packageName: 'com.disney.disneyplus',      name: 'Disney+',     color: '#113CCF', icon: '', webUrl: 'https://www.disneyplus.com' },
    { packageName: 'com.google.android.youtube.tv', name: 'YouTube', color: '#FF0000', icon: '', webUrl: 'https://m.youtube.com' },
  ];

  // Merge installed apps + featured ones (avoiding duplicates by name).
  const displayApps = (() => {
    const seenNames = new Set(installedApps.map((a) => a.name));
    const featured = FEATURED_SERVICES.filter((s) => !seenNames.has(s.name));
    return [...installedApps, ...featured];
  })();

  const handleAppClick = useCallback((app: InstalledStreamingApp) => {
    if (app.webUrl && window.NeoFilmAndroid?.openWebPage) {
      window.NeoFilmAndroid.openWebPage(app.webUrl);
    } else {
      launchApp(app.packageName);
    }
  }, []);

  // The new UI surfaces featured + installed apps directly; partner-configured
  // services (passed in via props) are no longer rendered.
  void services;

  return (
    <div className="neo-subscreen-main" style={{ height: '100%' }}>
      <div className="neo-sub-head">
        <div>
          <div className="neo-crumb">Accueil › Streaming</div>
          <h1>Applications de streaming</h1>
        </div>
        <div className="neo-count">{displayApps.length} apps disponibles</div>
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

      <div
        ref={containerRef}
        data-tv-nav-group="streaming-apps"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '1.125rem',
          padding: '0.25rem',
          overflow: 'auto',
        }}
      >
        {displayApps.map((app) => (
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
                    width: '4.25rem',
                    height: '4.25rem',
                    borderRadius: '0.875rem',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <BrandGlyph name={app.name} />
              )}
              <span className="neo-app-name">{app.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
