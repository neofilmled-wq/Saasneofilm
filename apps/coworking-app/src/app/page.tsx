'use client';

import { useCallback, useEffect, useState } from 'react';
import { PairingScreen, type PairedInfo } from '@/components/pairing-screen';
import { AdPlayer } from '@/components/ad-player';
import { AppGrid } from '@/components/app-grid';
import { deviceApi, DeviceAuthError } from '@/lib/device-api';
import { getDeviceToken, setDeviceToken, clearDeviceToken } from '@/lib/device-token';

type State =
  | { phase: 'checking' }
  | { phase: 'unpaired' }
  | {
      phase: 'paired';
      screenName: string | null;
      // Both are needed to attribute ad plays in /diffusion/log.
      screenId: string | null;
      deviceId: string | null;
    };

export default function Home() {
  const [state, setState] = useState<State>({ phase: 'checking' });

  // On boot: if we already hold a device token, validate it via /tv/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getDeviceToken();
      if (!token) {
        if (!cancelled) setState({ phase: 'unpaired' });
        return;
      }
      try {
        const me = await deviceApi.me();
        if (cancelled) return;
        if (me.paired) {
          setState({
            phase: 'paired',
            screenName: me.screenName,
            screenId: me.screenId,
            deviceId: me.deviceId,
          });
        } else {
          clearDeviceToken();
          setState({ phase: 'unpaired' });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DeviceAuthError) clearDeviceToken();
        setState({ phase: 'unpaired' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePaired = useCallback((info: PairedInfo) => {
    setDeviceToken(info.accessToken);
    setState({
      phase: 'paired',
      screenName: info.screenName ?? null,
      screenId: info.screenId ?? null,
      deviceId: info.deviceId,
    });
  }, []);

  if (state.phase === 'checking') {
    return (
      <main style={shell}>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1.1rem' }}>Chargement…</p>
      </main>
    );
  }

  if (state.phase === 'unpaired') {
    return <PairingScreen onPaired={handlePaired} />;
  }

  // Paired → ad loop, with Back toggling the launcher-style app grid.
  return <PairedView screenId={state.screenId} deviceId={state.deviceId} />;
}

/**
 * Post-pairing shell: shows the ad loop by default. Pressing Back on the box
 * (forwarded by the native wrapper as a `neo-back` event) toggles the app grid,
 * whose first tile brings the ads back.
 */
function PairedView({
  screenId,
  deviceId,
}: {
  screenId: string | null;
  deviceId: string | null;
}) {
  const [view, setView] = useState<'ads' | 'apps'>('ads');

  useEffect(() => {
    const onBack = () => setView((v) => (v === 'ads' ? 'apps' : 'ads'));
    window.addEventListener('neo-back', onBack);
    return () => window.removeEventListener('neo-back', onBack);
  }, []);

  if (view === 'apps') {
    return <AppGrid onShowAds={() => setView('ads')} />;
  }
  return <AdPlayer onBack={() => setView('apps')} screenId={screenId} deviceId={deviceId} />;
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.25rem',
  padding: '2rem',
  textAlign: 'center',
  background:
    'radial-gradient(1200px 600px at 50% -10%, rgba(230,57,70,0.12), transparent 60%), #0a0810',
  color: '#fff',
};
