'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeDisplay } from '@/components/common/qr-code';
import { CountdownTimer } from '@/components/common/countdown-timer';
import { StatusIndicator } from '@/components/common/status-indicator';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { useDevice } from '@/providers/device-provider';
import { getOrCreateDeviceFingerprint } from '@/lib/device-identity';
import { deviceApi } from '@/lib/device-api';
import { TV_CONFIG } from '@/lib/constants';

type Phase = 'registering' | 'showing_pin' | 'error';

const PAIRING_CACHE_KEY = 'neofilm_pairing_cache';

interface PairingCache {
  pin: string;
  deviceId: string;
  qrPayload: string;
  expiresAt: number;
}

function clearPairingCache() {
  localStorage.removeItem(PAIRING_CACHE_KEY);
}

export function PairingScreen() {
  const { isConnected, onPaired } = useDevice();
  const [phase, setPhase] = useState<Phase>('registering');
  const [pin, setPin] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registeringRef = useRef(false);

  const applyData = useCallback((d: PairingCache) => {
    setDeviceId(d.deviceId);
    setPin(d.pin);
    setQrPayload(d.qrPayload);
    setExpiresAt(d.expiresAt);
    setPhase('showing_pin');
  }, []);

  const doRegister = useCallback(async () => {
    if (registeringRef.current) return;
    registeringRef.current = true;
    try {
      // Always call /tv/register — backend reuses valid PINs per device,
      // and we avoid stale cache after backend restarts.
      clearPairingCache();

      const fingerprint = getOrCreateDeviceFingerprint();
      const androidId = window.NeoFilmAndroid?.getAndroidId?.() || undefined;
      const res = await deviceApi.register(fingerprint, undefined, androidId);

      // Backend says device is already paired — try to get a fresh token via /tv/status
      if (res.alreadyPaired) {
        try {
          const status = await deviceApi.checkStatus(res.deviceId);
          if (status.status === 'PAIRED' && status.accessToken) {
            onPaired(status.accessToken, {
              id: status.deviceId,
              screenId: status.screenId,
              screenName: status.screenName,
            }, status.expiresIn);
            return;
          }
        } catch {
          // Fall through to show PIN if status check fails
        }
      }

      const data: PairingCache = {
        deviceId: res.deviceId,
        pin: res.pin,
        qrPayload: res.qrPayload,
        expiresAt: new Date(res.expiresAt).getTime(),
      };
      applyData(data);
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    } finally {
      registeringRef.current = false;
    }
  }, [applyData, onPaired]);

  // Step 1: Register on mount (or load from cache)
  useEffect(() => {
    doRegister();
  }, [doRegister]);

  // Step 2: Poll for pairing status while showing PIN
  useEffect(() => {
    if (phase !== 'showing_pin' || !deviceId) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await deviceApi.checkStatus(deviceId);
        if (status.status === 'PAIRED' && status.accessToken) {
          if (pollRef.current) clearInterval(pollRef.current);
          clearPairingCache();
          // Inject credentials into provider — triggers UNPAIRED→PAIRED→SYNCING→ACTIVE
          onPaired(status.accessToken, {
            id: status.deviceId,
            screenId: status.screenId,
            screenName: status.screenName,
          }, status.expiresIn);
        }
      } catch {
        // Polling failure is non-fatal
      }
    }, TV_CONFIG.PAIRING_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, deviceId, onPaired]);

  const handleExpired = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    clearPairingCache();
    registeringRef.current = false;
    setPhase('registering');
    doRegister();
  }, [doRegister]);

  const handleRetry = useCallback(() => {
    setError(null);
    clearPairingCache();
    registeringRef.current = false;
    setPhase('registering');
    doRegister();
  }, [doRegister]);

  // ── Registering phase ─────────────────────────
  if (phase === 'registering') {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8">
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-primary">NEO</span>FILM
        </h1>
        <LoadingSpinner message="Enregistrement de l'appareil..." />
        <Footer isConnected={isConnected} />
      </div>
    );
  }

  // ── Error phase ───────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-8">
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="text-primary">NEO</span>FILM
        </h1>
        <p className="text-xl text-red-400">{error}</p>
        <button
          onClick={handleRetry}
          className="rounded-lg bg-primary px-6 py-3 text-lg font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Reessayer
        </button>
        <Footer isConnected={isConnected} />
      </div>
    );
  }

  // ── Showing PIN phase ─────────────────────────
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8">
      <h1 className="text-5xl font-bold tracking-tight">
        <span className="text-primary">NEO</span>FILM
      </h1>

      <div className="flex items-start gap-16">
        {/* QR Code */}
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white/5 p-6 backdrop-blur">
            <QRCodeDisplay data={qrPayload} size={280} />
          </div>
        </div>

        {/* Instructions + PIN */}
        <div className="flex flex-col gap-6 pt-4">
          <div className="space-y-3">
            <p className="text-xl text-muted-foreground">
              1. Ouvrez le portail admin NeoFilm
            </p>
            <p className="text-xl text-muted-foreground">
              2. Allez dans <span className="text-foreground font-medium">Appareils</span> → <span className="text-foreground font-medium">Appairer</span>
            </p>
            <p className="text-xl text-muted-foreground">
              3. Scannez le QR code ou entrez le code PIN :
            </p>
          </div>

          {/* PIN Code */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm uppercase tracking-widest text-muted-foreground">
              Ou entrez ce code PIN
            </p>
            <div className="flex gap-3">
              {pin.split('').map((digit, i) => (
                <span
                  key={i}
                  className="flex h-20 w-16 items-center justify-center rounded-xl bg-white/10 text-5xl font-bold tabular-nums"
                >
                  {digit}
                </span>
              ))}
            </div>
          </div>

          {/* Countdown */}
          {expiresAt > 0 && (
            <p className="text-center text-lg text-muted-foreground">
              Code expire dans{' '}
              <CountdownTimer expiresAt={expiresAt} onExpired={handleExpired} />
            </p>
          )}
        </div>
      </div>

      <Footer isConnected={isConnected} />
    </div>
  );
}

function Footer({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
      <StatusIndicator
        connected={isConnected}
        label={isConnected ? 'Connecte au serveur' : 'Deconnecte'}
      />
      <span className="text-sm text-muted-foreground">v0.1.0</span>
    </div>
  );
}
