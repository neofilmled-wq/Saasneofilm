'use client';

import { useCallback, useEffect, useState } from 'react';
import { PairingScreen, type PairedInfo } from '@/components/pairing-screen';
import { AdPlayer } from '@/components/ad-player';
import { deviceApi, DeviceAuthError } from '@/lib/device-api';
import { getDeviceToken, setDeviceToken, clearDeviceToken } from '@/lib/device-token';

type State =
  | { phase: 'checking' }
  | { phase: 'unpaired' }
  | { phase: 'paired'; screenName: string | null; screenId: string | null };

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
          setState({ phase: 'paired', screenName: me.screenName, screenId: me.screenId });
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
    setState({ phase: 'paired', screenName: info.screenName ?? null, screenId: info.screenId ?? null });
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

  // Paired → full-screen ad loop (targeted campaigns + house/Dupplex fallback).
  return <AdPlayer />;
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
