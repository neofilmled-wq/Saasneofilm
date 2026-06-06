'use client';

import { LoadingSpinner } from '@/components/common/loading-spinner';
import { useDevice } from '@/providers/device-provider';

interface SyncingScreenProps {
  message?: string;
}

/**
 * Sync screen reused across pairing, schedule fetch, reboot, etc. Renders the
 * shared LoadingSpinner (which already shows the branded NEOFILM logo) so
 * users see ONE consistent splash across every "loading" phase.
 */
export function SyncingScreen({ message = 'Synchronisation du programme...' }: SyncingScreenProps) {
  const { screenId } = useDevice();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        background:
          'radial-gradient(ellipse 80% 60% at 30% 20%, #1a1f4a 0%, #050714 55%), #050714',
      }}
    >
      <LoadingSpinner message={message} />

      {screenId && (
        <p
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            color: 'rgba(255, 255, 255, 0.35)',
            fontSize: '0.75rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Écran : {screenId}
        </p>
      )}
    </div>
  );
}
