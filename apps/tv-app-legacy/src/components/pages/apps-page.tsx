'use client';

import { useEffect, useRef, useState } from 'react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';

interface InstalledApp {
  packageName: string;
  label: string;
  icon: string; // base64 PNG
}

const HIDDEN_PACKAGES = new Set([
  'com.neofilm.tv',
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
      return apps.filter(app => !HIDDEN_PACKAGES.has(app.packageName));
    }
  } catch (e) {
    console.error('[AppsPage] Failed to get installed apps:', e);
  }
  return [];
}

function launchApp(packageName: string) {
  try {
    if (window.NeoFilmAndroid?.launchApp) {
      window.NeoFilmAndroid.launchApp(packageName);
    }
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

  if (!isAndroid) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground" style={{ fontSize: '1.2em' }}>
            Cette fonctionnalite est disponible uniquement sur Android TV
          </p>
        </div>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p style={{ fontSize: '2em' }}>📦</p>
          <p className="mt-2 text-muted-foreground" style={{ fontSize: '1em' }}>
            Aucune application installee
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ padding: 'var(--tv-safe-x, 1.5rem)' }}
    >
      <p
        className="mb-[1em] text-muted-foreground"
        style={{ fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.1em' }}
      >
        Applications installees ({apps.length})
      </p>

      <div
        ref={containerRef}
        className="grid gap-[0.75em]"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
      >
        {apps.map((app) => (
          <button
            key={app.packageName}
            data-tv-focusable
            className="tv-app-card flex flex-col items-center gap-[0.5em] rounded-xl bg-card/80 p-[1em] transition-all"
            onClick={() => launchApp(app.packageName)}
          >
            {app.icon ? (
              <img
                src={`data:image/png;base64,${app.icon}`}
                alt={app.label}
                className="h-[4em] w-[4em] rounded-xl object-contain"
              />
            ) : (
              <div className="flex h-[4em] w-[4em] items-center justify-center rounded-xl bg-muted">
                <span style={{ fontSize: '2em' }}>📱</span>
              </div>
            )}
            <span
              className="w-full truncate text-center text-foreground"
              style={{ fontSize: '0.8em' }}
            >
              {app.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
