'use client';

import { useEffect, useRef, useState } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';

interface InstalledApp {
  packageName: string;
  label: string;
  icon: string;
}

const HIDDEN_PACKAGES = new Set([
  'com.neofilm.tv',
  'com.neofilm.tv.legacy',
  'com.wolf.google.lm',
  'com.google.android.tvlauncher',
  'com.google.android.leanbacklauncher',
  'droidlogic.launcher',
]);

function getInstalledApps(): InstalledApp[] {
  try {
    if (window.NeoFilmAndroid?.getInstalledApps) {
      const json = window.NeoFilmAndroid.getInstalledApps();
      const apps: InstalledApp[] = JSON.parse(json);
      return apps.filter((app) => !HIDDEN_PACKAGES.has(app.packageName));
    }
  } catch (e) {
    console.error('[AppsPage] Failed to get installed apps:', e);
  }
  return [];
}

function launchApp(packageName: string) {
  try {
    window.NeoFilmAndroid?.launchApp?.(packageName);
  } catch (e) {
    console.error('[AppsPage] Failed to launch app:', e);
  }
}

export function AppsPage() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [isAndroid, setIsAndroid] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDpadNavigation({ containerRef, autoFocus: true, columns: 4 });

  useEffect(() => {
    const android = !!window.NeoFilmAndroid?.isAndroidTv?.();
    setIsAndroid(android);
    if (android) {
      setApps(getInstalledApps());
    }
  }, []);

  const empty = !isAndroid || apps.length === 0;
  const emptyMsg = !isAndroid
    ? 'Cette fonctionnalité est disponible uniquement sur Android TV'
    : 'Aucune application installée';

  return (
    <div className="neo-subscreen-main" style={{ height: '100%' }}>
      <div className="neo-sub-head">
        <div>
          <div className="neo-crumb">Accueil › Applications</div>
          <h1>Toutes vos applications</h1>
        </div>
        <div className="neo-count">{empty ? '—' : `${apps.length} installées`}</div>
      </div>

      {empty ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--neo-t-3)',
          }}
        >
          <p style={{ fontSize: '1.05em' }}>{emptyMsg}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          data-tv-nav-group="apps"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 18,
            padding: 4,
            overflow: 'auto',
          }}
        >
          {apps.map((app) => (
            <button
              key={app.packageName}
              data-tv-focusable
              onClick={() => launchApp(app.packageName)}
              className="neo-app-card"
              style={{
                appearance: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                cursor: 'pointer',
                flexDirection: 'column',
                gap: 10,
                background: 'linear-gradient(135deg, #1e1a4a, #0a0e22)',
              }}
            >
              {app.icon ? (
                <img
                  src={`data:image/png;base64,${app.icon}`}
                  alt={app.label}
                  style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'contain' }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#11162e',
                    fontSize: 24,
                  }}
                >
                  📱
                </div>
              )}
              <span
                className="neo-app-name"
                style={{
                  fontSize: 13,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {app.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
