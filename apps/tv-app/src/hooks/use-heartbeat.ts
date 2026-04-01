'use client';

import { useEffect, useRef } from 'react';
import { TV_CONFIG } from '@/lib/constants';
import { deviceApi, DeviceAuthError } from '@/lib/device-api';

interface UseHeartbeatOptions {
  deviceId: string | null;
  screenId?: string | null;
  token: string | null;
  onAuthError?: () => void;
  sendSocketHeartbeat?: (data: {
    isOnline: boolean;
    appVersion: string;
    uptime: number;
    screenId?: string;
  }) => void;
}

export function useHeartbeat({ deviceId, screenId, token, onAuthError, sendSocketHeartbeat }: UseHeartbeatOptions) {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!deviceId || !token) return;

    const sendBeat = async () => {
      const uptime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      try {
        await deviceApi.heartbeat();
        sendSocketHeartbeat?.({ isOnline: true, appVersion: '0.1.0', uptime, ...(screenId ? { screenId } : {}) });
      } catch (err) {
        if (err instanceof DeviceAuthError) {
          onAuthError?.();
        }
        // Other heartbeat failures are non-fatal
      }
    };

    sendBeat();
    const interval = setInterval(sendBeat, TV_CONFIG.HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [deviceId, token, onAuthError, sendSocketHeartbeat]);
}
