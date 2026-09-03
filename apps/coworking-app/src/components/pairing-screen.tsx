'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceApi } from '@/lib/device-api';
import { getOrCreateDeviceFingerprint, getAndroidId } from '@/lib/device-identity';
import { CW_CONFIG } from '@/lib/constants';

type Phase = 'registering' | 'showing_pin' | 'error';

export interface PairedInfo {
  accessToken: string;
  deviceId: string;
  screenId?: string;
  screenName?: string | null;
  expiresIn?: number;
}

/**
 * Coworking pairing screen — PIN only (no QR).
 * The box registers, shows a 6-digit code, and polls until the manager types
 * that code in the partner portal to link it to a Coworking screen.
 */
export function PairingScreen({ onPaired }: { onPaired: (info: PairedInfo) => void }) {
  const [phase, setPhase] = useState<Phase>('registering');
  const [pin, setPin] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registeringRef = useRef(false);

  const doRegister = useCallback(async () => {
    if (registeringRef.current) return;
    registeringRef.current = true;
    setPhase('registering');
    try {
      const fingerprint = getOrCreateDeviceFingerprint();
      const androidId = getAndroidId();
      const res = await deviceApi.register(fingerprint, undefined, androidId);

      // Already paired on the backend → grab a fresh token via /tv/status.
      if (res.alreadyPaired) {
        try {
          const status = await deviceApi.checkStatus(res.deviceId);
          if (status.status === 'PAIRED' && status.accessToken) {
            onPaired({
              accessToken: status.accessToken,
              deviceId: status.deviceId,
              screenId: status.screenId,
              screenName: status.screenName,
              expiresIn: status.expiresIn,
            });
            return;
          }
        } catch {
          // fall through and show the PIN
        }
      }

      setDeviceId(res.deviceId);
      setPin(res.pin);
      setPhase('showing_pin');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    } finally {
      registeringRef.current = false;
    }
  }, [onPaired]);

  // Register on mount.
  useEffect(() => {
    doRegister();
  }, [doRegister]);

  // Poll pairing status while the PIN is shown.
  useEffect(() => {
    if (phase !== 'showing_pin' || !deviceId) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await deviceApi.checkStatus(deviceId);
        if (status.status === 'PAIRED' && status.accessToken) {
          if (pollRef.current) clearInterval(pollRef.current);
          onPaired({
            accessToken: status.accessToken,
            deviceId: status.deviceId,
            screenId: status.screenId,
            screenName: status.screenName,
            expiresIn: status.expiresIn,
          });
        }
      } catch {
        // non-fatal — keep polling
      }
    }, CW_CONFIG.PAIRING_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, deviceId, onPaired]);

  return (
    <main style={shell}>
      <h1 style={{ margin: 0, fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', fontWeight: 700 }}>
        <span style={{ color: '#E63946' }}>NeoFilm</span> Coworking
      </h1>

      {phase === 'registering' && (
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem' }}>
          Enregistrement de l&apos;appareil…
        </p>
      )}

      {phase === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <p style={{ color: '#ff6b6b', fontSize: '1.2rem', margin: 0 }}>{error}</p>
          <button onClick={doRegister} style={btn}>
            Réessayer
          </button>
        </div>
      )}

      {phase === 'showing_pin' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', maxWidth: '46rem' }}>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '1.15rem', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>1. Ouvrez votre espace partenaire NeoFilm</p>
            <p style={{ margin: 0 }}>
              2. Écrans → <strong style={{ color: '#fff' }}>Appairer</strong> l&apos;écran de coworking
            </p>
            <p style={{ margin: 0 }}>3. Saisissez ce code :</p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {pin.split('').map((digit, i) => (
              <span key={i} style={pinCell}>
                {digit}
              </span>
            ))}
          </div>

          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.95rem', margin: 0 }}>
            En attente de l&apos;appairage…
          </p>
        </div>
      )}
    </main>
  );
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2.5rem',
  padding: '2rem',
  background:
    'radial-gradient(1200px 600px at 50% -10%, rgba(230,57,70,0.12), transparent 60%), #0a0810',
  color: '#fff',
};

const pinCell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '5.5rem',
  width: '4rem',
  borderRadius: '0.9rem',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  fontSize: '3rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
};

const btn: React.CSSProperties = {
  background: 'linear-gradient(135deg, #E63946 0%, #b71c2c 100%)',
  color: '#fff',
  border: 'none',
  borderRadius: '0.75rem',
  padding: '0.85rem 1.75rem',
  fontSize: '1.05rem',
  fontWeight: 600,
  cursor: 'pointer',
};
