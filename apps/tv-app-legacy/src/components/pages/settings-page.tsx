'use client';

import { useDevice } from '@/providers/device-provider';
import { StatusIndicator } from '@/components/common/status-indicator';

/**
 * Settings / device info page.
 * Shows connection status, device ID, screen info, version.
 */
export function SettingsPage() {
  const { deviceId, screenId, isConnected, state } = useDevice();

  const screenName =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_screen_name') : null;
  const serial =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_device_serial') : null;

  const infoRows = [
    { label: 'Etat', value: state },
    { label: 'Appareil', value: deviceId || '-' },
    { label: 'Numero de serie', value: serial || '-' },
    { label: 'Ecran', value: screenName || screenId || '-' },
    { label: 'Version', value: 'v1.0.0' },
  ];

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ padding: 'var(--tv-safe-x, 1.5rem)' }}
    >
      <h2
        className="mb-[1em] font-semibold text-muted-foreground"
        style={{ fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '0.1em' }}
      >
        Parametres de l'appareil
      </h2>

      {/* Connection status */}
      <div
        className="mb-[1.5em] flex items-center gap-[0.75em] rounded-xl"
        style={{ padding: '1em', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(12px)' }}
      >
        <StatusIndicator connected={isConnected} />
        <span style={{ fontSize: '1em' }}>
          {isConnected ? 'Connecte au serveur' : 'Hors ligne'}
        </span>
      </div>

      {/* Info rows */}
      <div className="rounded-xl" style={{ padding: '0.5em 0', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(12px)' }}>
        {infoRows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between ${
              i < infoRows.length - 1 ? 'border-b border-border' : ''
            }`}
            style={{ padding: '0.75em 1em' }}
          >
            <span className="text-muted-foreground" style={{ fontSize: '0.85em' }}>
              {row.label}
            </span>
            <span
              className="max-w-[60%] truncate font-mono text-foreground"
              style={{ fontSize: '0.85em' }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* System settings access — gated by PIN on the native side */}
      <button
        data-tv-focusable
        onClick={() => {
          try {
            (window as any).NeoFilmAndroid?.openSystemSettings?.();
          } catch (e) {
            console.error('[Settings] openSystemSettings failed:', e);
          }
        }}
        className="tv-card mt-[1.5em] flex w-full items-center gap-[0.75em] text-left"
        style={{ padding: '1em' }}
      >
        <span style={{ fontSize: '1.5em' }}>⚙️</span>
        <div className="flex flex-1 flex-col">
          <span className="font-semibold text-foreground" style={{ fontSize: '1em' }}>
            Paramètres système Fire TV
          </span>
          <span className="text-muted-foreground" style={{ fontSize: '0.8em' }}>
            Wi-Fi, son, affichage… (code requis)
          </span>
        </div>
        <span className="text-muted-foreground" style={{ fontSize: '1.2em' }}>›</span>
      </button>

      {/* Reset pairing — disabled on TV, only available from partner dashboard */}
    </div>
  );
}
