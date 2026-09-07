'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Settings } from 'lucide-react';

interface InstalledApp {
  packageName: string;
  label: string;
  icon: string;
}

/** Launchers / our own app — never shown in the grid. */
const HIDDEN_PACKAGES = new Set([
  'com.neofilm.coworking',
  'com.google.android.tvlauncher',
  'com.google.android.leanbacklauncher',
  'droidlogic.launcher',
  'com.amazon.tv.launcher',
  'com.amazon.firehomestarter',
  // Settings — surfaced via the dedicated "Paramètres" tile instead.
  'com.android.tv.settings',
  'com.android.settings',
  'com.amazon.tv.settings.v2',
  'com.amazon.tv.settings',
]);

function openSettings() {
  try {
    window.NeoFilmAndroid?.openSystemSettings?.();
  } catch (e) {
    console.error('[AppGrid] openSystemSettings failed', e);
  }
}

function readInstalledApps(): InstalledApp[] {
  try {
    const raw = window.NeoFilmAndroid?.getInstalledApps?.();
    if (!raw) return [];
    const apps: InstalledApp[] = JSON.parse(raw);
    return apps.filter((a) => a && a.packageName && !HIDDEN_PACKAGES.has(a.packageName));
  } catch (e) {
    console.error('[AppGrid] getInstalledApps failed', e);
    return [];
  }
}

function launchApp(pkg: string) {
  try {
    window.NeoFilmAndroid?.launchApp?.(pkg);
  } catch (e) {
    console.error('[AppGrid] launchApp failed', e);
  }
}

/**
 * Launcher-style grid shown when the user presses Back on the ad loop.
 * First tile is always "Afficher les pubs" (returns to the ad loop); the rest
 * are the installed apps, launched via the native bridge.
 */
export function AppGrid({ onShowAds }: { onShowAds: () => void }) {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const android = !!window.NeoFilmAndroid?.getInstalledApps;
    setIsAndroid(android);
    if (android) setApps(readInstalledApps());
  }, []);

  return (
    <main style={shell}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>
          <span style={{ color: '#E63946' }}>NeoFilm</span> · Applications
        </h1>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
          {isAndroid ? `${apps.length} installée${apps.length > 1 ? 's' : ''}` : 'aperçu'}
        </span>
      </header>

      <div style={grid}>
        {/* First tile — back to the ads */}
        <button onClick={onShowAds} style={{ ...tile, ...adTile }} autoFocus>
          <Megaphone size={44} color="#fff" />
          <span style={tileLabel}>Afficher les pubs</span>
        </button>

        {/* System settings (WiFi, réseau, etc.) — works on any Android TV box. */}
        <button onClick={openSettings} style={tile}>
          <Settings size={44} color="#fff" />
          <span style={tileLabel}>Paramètres</span>
        </button>

        {apps.map((app) => (
          <button key={app.packageName} onClick={() => launchApp(app.packageName)} style={tile}>
            {app.icon ? (
              <img
                src={`data:image/png;base64,${app.icon}`}
                alt=""
                style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'contain' }}
              />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#11162e', fontSize: 26 }}>
                📱
              </div>
            )}
            <span style={tileLabel}>{app.label}</span>
          </button>
        ))}

        {isAndroid && apps.length === 0 && (
          <p style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.4)' }}>Aucune application installée.</p>
        )}
        {!isAndroid && (
          <p style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.4)' }}>
            La liste des applications s&apos;affiche uniquement sur la box (hors navigateur).
          </p>
        )}
      </div>
    </main>
  );
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  padding: 'clamp(1.5rem, 4vw, 3rem)',
  background:
    'radial-gradient(1200px 600px at 50% -10%, rgba(230,57,70,0.12), transparent 60%), #0a0810',
  color: '#fff',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: '1.1rem',
};

const tile: React.CSSProperties = {
  appearance: 'none',
  color: '#fff',
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  minHeight: '9rem',
  borderRadius: '1rem',
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.05)',
  padding: '1rem',
};

const adTile: React.CSSProperties = {
  background: 'linear-gradient(135deg, #E63946 0%, #b71c2c 100%)',
  border: '1px solid rgba(230,57,70,0.6)',
  boxShadow: '0 10px 30px -10px rgba(230,57,70,0.6)',
  fontWeight: 700,
};

const tileLabel: React.CSSProperties = {
  fontSize: '0.9rem',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
