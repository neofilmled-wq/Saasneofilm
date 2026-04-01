'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceApi, DeviceAuthError } from '@/lib/device-api';
import { TV_CONFIG } from '@/lib/constants';

interface DeviceInfo {
  deviceId: string;
  screenId: string;
  serialNumber: string;
}

export function useDeviceToken() {
  const [token, setToken] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isReady, setIsReady] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('neofilm_device_token');
    const savedDeviceId = localStorage.getItem('neofilm_device_id');
    const savedScreenId = localStorage.getItem('neofilm_screen_id');
    const savedSerial = localStorage.getItem('neofilm_device_serial');

    if (savedToken && savedDeviceId) {
      setToken(savedToken);
      setDeviceInfo({
        deviceId: savedDeviceId,
        screenId: savedScreenId || '',
        serialNumber: savedSerial || '',
      });
      // Schedule a refresh — we don't know exact expiry, so refresh in 1h (safe default)
      scheduleRefresh(3600);
    }
    setIsReady(true);
  }, []);

  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const refreshIn = Math.max(expiresIn * 1000 - TV_CONFIG.TOKEN_REFRESH_BUFFER_MS, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await deviceApi.refreshToken();
        localStorage.setItem('neofilm_device_token', res.accessToken);
        setToken(res.accessToken);
        scheduleRefresh(res.expiresIn);
      } catch (err) {
        if (err instanceof DeviceAuthError) {
          clearDevice();
        }
      }
    }, refreshIn);
  }, []);

  const authenticate = useCallback(
    async (provisioningToken: string, fingerprint?: string) => {
      const res = await deviceApi.authenticate(provisioningToken, fingerprint);
      localStorage.setItem('neofilm_device_token', res.accessToken);
      localStorage.setItem('neofilm_device_id', res.device.id);
      localStorage.setItem('neofilm_screen_id', res.device.screenId || '');
      localStorage.setItem('neofilm_device_serial', res.device.serialNumber);
      setToken(res.accessToken);
      setDeviceInfo({
        deviceId: res.device.id,
        screenId: res.device.screenId || '',
        serialNumber: res.device.serialNumber,
      });
      scheduleRefresh(res.expiresIn);
      return res;
    },
    [scheduleRefresh],
  );

  // Inject already-obtained credentials (from pairing poll) without an API call
  const setCredentials = useCallback(
    (accessToken: string, device: { id: string; screenId?: string; serialNumber?: string }, expiresIn = 86400) => {
      localStorage.setItem('neofilm_device_token', accessToken);
      localStorage.setItem('neofilm_device_id', device.id);
      localStorage.setItem('neofilm_screen_id', device.screenId || '');
      localStorage.setItem('neofilm_device_serial', device.serialNumber || '');
      setToken(accessToken);
      setDeviceInfo({
        deviceId: device.id,
        screenId: device.screenId || '',
        serialNumber: device.serialNumber || '',
      });
      scheduleRefresh(expiresIn);
    },
    [scheduleRefresh],
  );

  const clearDevice = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    localStorage.removeItem('neofilm_device_token');
    localStorage.removeItem('neofilm_device_id');
    localStorage.removeItem('neofilm_screen_id');
    localStorage.removeItem('neofilm_device_serial');
    setToken(null);
    setDeviceInfo(null);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  return { token, deviceInfo, isReady, authenticate, setCredentials, clearDevice };
}
