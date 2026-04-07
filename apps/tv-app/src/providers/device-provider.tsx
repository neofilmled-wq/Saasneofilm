'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { DeviceState } from '@/lib/state-machine';
import { DeviceAuthError, deviceApi } from '@/lib/device-api';
import { clearScheduleCache } from '@/lib/schedule-cache';
import { useDeviceState } from '@/hooks/use-device-state';
import { useDeviceToken } from '@/hooks/use-device-token';
import { useDeviceSocket } from '@/hooks/use-device-socket';
import { useHeartbeat } from '@/hooks/use-heartbeat';
import { useSchedule } from '@/hooks/use-schedule';
import type { ScheduleBundle } from '@/lib/device-api';

interface DeviceContextValue {
  state: DeviceState;
  errorMessage: string | null;
  deviceId: string | null;
  screenId: string | null;
  token: string | null;
  schedule: ScheduleBundle | null;
  isScheduleLoading: boolean;
  isConnected: boolean;
  isReady: boolean;
  authenticate: (provisioningToken: string) => Promise<void>;
  onPaired: (accessToken: string, device: { id: string; screenId?: string; screenName?: string }, expiresIn?: number) => void;
  clearDevice: () => void;
  fetchSchedule: () => Promise<ScheduleBundle | null>;
  /** Register WS event callbacks for TV config/ads/macros/catalogue updates */
  registerTvCallbacks: (callbacks: {
    onTvConfigUpdate?: () => void;
    onAdsUpdate?: () => void;
    onActivitiesUpdate?: () => void;
    onCatalogueUpdate?: () => void;
    onMacrosUpdate?: (macros: any) => void;
  }) => void;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const { state, errorMessage, transition, reset } = useDeviceState();
  const { token, deviceInfo, isReady, authenticate: authToken, setCredentials, clearDevice: clearToken } =
    useDeviceToken();

  // Guard to prevent multiple concurrent auth error handling
  const authErrorHandledRef = useRef(false);

  // When any API call returns 401, clear token state and go back to UNPAIRED
  // Do NOT reload the page — that causes infinite loops
  const handleAuthError = useCallback(() => {
    if (authErrorHandledRef.current) return; // Already handling
    authErrorHandledRef.current = true;
    console.log('[DeviceProvider] Auth error — clearing token, resetting to UNPAIRED');
    clearToken();
    clearScheduleCache();
    reset();
    // Allow handling again after a short delay (prevents rapid re-fires)
    setTimeout(() => { authErrorHandledRef.current = false; }, 2000);
  }, [clearToken, reset]);

  const { schedule, isLoading: isScheduleLoading, fetchSchedule, handleScheduleUpdate, invalidateAndRefetch } =
    useSchedule(deviceInfo?.deviceId ?? null, token, handleAuthError);

  const handleCommand = useCallback(
    (command: string) => {
      if (command === 'UNPAIR') {
        clearToken();
        clearScheduleCache();
        reset();
      } else if (command === 'PULL_SCHEDULE') {
        fetchSchedule();
      } else if (command === 'REBOOT' || command === 'FORCE_RELOAD') {
        window.location.reload();
      } else if (command === 'REFRESH_ADS') {
        // Re-fetch ads without full reload
        invalidateAndRefetch();
        adsUpdateCallbackRef.current?.();
      }
    },
    [clearToken, reset, fetchSchedule, invalidateAndRefetch],
  );

  // Callbacks for new TV WS events — these will be set by consumers via context
  const tvConfigUpdateCallbackRef = useRef<(() => void) | null>(null);
  const adsUpdateCallbackRef = useRef<(() => void) | null>(null);
  const activitiesUpdateCallbackRef = useRef<(() => void) | null>(null);
  const catalogueUpdateCallbackRef = useRef<(() => void) | null>(null);
  const macrosUpdateCallbackRef = useRef<((macros: any) => void) | null>(null);

  const handleTvConfigUpdate = useCallback(() => {
    tvConfigUpdateCallbackRef.current?.();
  }, []);
  const handleAdsUpdate = useCallback(() => {
    // Invalidate schedule cache + refetch so stale ads are removed
    invalidateAndRefetch();
    adsUpdateCallbackRef.current?.();
  }, [invalidateAndRefetch]);
  const handleActivitiesUpdate = useCallback(() => {
    activitiesUpdateCallbackRef.current?.();
  }, []);
  const handleCatalogueUpdate = useCallback(() => {
    catalogueUpdateCallbackRef.current?.();
  }, []);
  const handleMacrosUpdate = useCallback((macros: any) => {
    macrosUpdateCallbackRef.current?.(macros);
  }, []);

  const { isConnected, sendHeartbeat } = useDeviceSocket({
    deviceId: deviceInfo?.deviceId ?? null,
    token,
    onScheduleUpdate: handleScheduleUpdate,
    onCommand: handleCommand,
    onTvConfigUpdate: handleTvConfigUpdate,
    onAdsUpdate: handleAdsUpdate,
    onActivitiesUpdate: handleActivitiesUpdate,
    onCatalogueUpdate: handleCatalogueUpdate,
    onMacrosUpdate: handleMacrosUpdate,
  });

  useHeartbeat({
    deviceId: deviceInfo?.deviceId ?? null,
    screenId: deviceInfo?.screenId ?? null,
    token,
    onAuthError: handleAuthError,
    sendSocketHeartbeat: sendHeartbeat,
  });

  // On boot: validate stored token with /tv/me before transitioning
  const bootValidatedRef = useRef(false);
  useEffect(() => {
    if (!isReady || bootValidatedRef.current) return;
    if (!token || !deviceInfo) return;
    if (state !== DeviceState.UNPAIRED) return;

    bootValidatedRef.current = true;

    deviceApi
      .me()
      .then((info) => {
        if (info.paired) {
          console.log('[DeviceProvider] Boot validation OK — device is paired');
          transition(DeviceState.PAIRED);
        } else {
          console.log('[DeviceProvider] Boot validation: device not paired in DB — clearing token');
          clearToken();
          reset();
        }
      })
      .catch((err) => {
        if (err instanceof DeviceAuthError) {
          console.log('[DeviceProvider] Boot validation: token rejected (401) — clearing');
          clearToken();
          reset();
        } else {
          // Network error — trust the token optimistically
          console.log('[DeviceProvider] Boot validation: network error, trusting stored token');
          transition(DeviceState.PAIRED);
        }
        bootValidatedRef.current = false;
      });
  }, [isReady, token, deviceInfo, state, transition, clearToken, reset]);

  // Auto-transition PAIRED → SYNCING → ACTIVE
  useEffect(() => {
    if (state === DeviceState.PAIRED) {
      transition(DeviceState.SYNCING);
    }
  }, [state, transition]);

  useEffect(() => {
    if (state === DeviceState.SYNCING && schedule) {
      transition(DeviceState.ACTIVE);
    }
    // If no schedule after 5s, go ACTIVE anyway (will show house ads / idle screen)
    if (state === DeviceState.SYNCING) {
      const timer = setTimeout(() => {
        transition(DeviceState.ACTIVE);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state, schedule, transition]);

  // Detect offline
  useEffect(() => {
    if (state === DeviceState.ACTIVE && !isConnected) {
      const timer = setTimeout(() => {
        if (!isConnected) transition(DeviceState.OFFLINE);
      }, 60_000); // Wait 1 min before showing offline
      return () => clearTimeout(timer);
    }
    if (state === DeviceState.OFFLINE && isConnected) {
      transition(DeviceState.ACTIVE);
    }
  }, [state, isConnected, transition]);

  const authenticate = useCallback(
    async (provisioningToken: string) => {
      try {
        await authToken(provisioningToken);
        transition(DeviceState.PAIRED);
      } catch (err) {
        if (err instanceof DeviceAuthError) {
          transition(DeviceState.ERROR, 'Authentification echouee');
        } else {
          transition(DeviceState.ERROR, (err as Error).message);
        }
      }
    },
    [authToken, transition],
  );

  // Called by PairingScreen when pairing is confirmed — injects token without page reload
  const onPaired = useCallback(
    (accessToken: string, device: { id: string; screenId?: string; screenName?: string }, expiresIn?: number) => {
      // Prevent boot validation from also firing (race condition)
      bootValidatedRef.current = true;
      console.log('[DeviceProvider] onPaired — injecting credentials, transitioning to PAIRED');
      setCredentials(accessToken, { id: device.id, screenId: device.screenId }, expiresIn);
      if (device.screenName) localStorage.setItem('neofilm_screen_name', device.screenName);
      transition(DeviceState.PAIRED);
    },
    [setCredentials, transition],
  );

  // On boot: try reconnect by androidId if no stored token
  const reconnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (!isReady || reconnectAttemptedRef.current) return;
    if (token) return;
    if (state !== DeviceState.UNPAIRED) return;

    reconnectAttemptedRef.current = true;
    const androidId = typeof window !== 'undefined' ? window.NeoFilmAndroid?.getAndroidId?.() : null;
    if (!androidId) return;

    console.log('[DeviceProvider] Attempting reconnect by androidId:', androidId);
    deviceApi.reconnect(androidId).then((res) => {
      if (res.accessToken) {
        console.log('[DeviceProvider] Reconnected by androidId — device:', res.device?.id);
        onPaired(res.accessToken, {
          id: res.device?.id || '',
          screenId: res.device?.screenId || undefined,
          screenName: res.device?.screenName || undefined,
        }, res.expiresIn);
      }
    }).catch(() => {
      console.log('[DeviceProvider] Reconnect by androidId failed — showing pairing screen');
    });
  }, [isReady, token, state, onPaired]);

  const clearDevice = useCallback(() => {
    // Reset the DB device record to PROVISIONING before clearing local state,
    // so the next POST /tv/register generates a fresh PIN instead of returning alreadyPaired:true.
    const storedDeviceId =
      typeof window !== 'undefined' ? localStorage.getItem('neofilm_device_id') : null;
    if (storedDeviceId) {
      deviceApi.reset(storedDeviceId).catch(() => {
        // Fire-and-forget — proceed with local clear even if request fails
      });
    }
    clearToken();
    clearScheduleCache();
    reset();
  }, [clearToken, reset]);

  const registerTvCallbacks = useCallback(
    (callbacks: {
      onTvConfigUpdate?: () => void;
      onAdsUpdate?: () => void;
      onActivitiesUpdate?: () => void;
      onCatalogueUpdate?: () => void;
      onMacrosUpdate?: (macros: any) => void;
    }) => {
      tvConfigUpdateCallbackRef.current = callbacks.onTvConfigUpdate ?? null;
      adsUpdateCallbackRef.current = callbacks.onAdsUpdate ?? null;
      activitiesUpdateCallbackRef.current = callbacks.onActivitiesUpdate ?? null;
      catalogueUpdateCallbackRef.current = callbacks.onCatalogueUpdate ?? null;
      macrosUpdateCallbackRef.current = callbacks.onMacrosUpdate ?? null;
    },
    [],
  );

  return (
    <DeviceContext.Provider
      value={{
        state,
        errorMessage,
        deviceId: deviceInfo?.deviceId ?? null,
        screenId: deviceInfo?.screenId ?? null,
        token,
        schedule,
        isScheduleLoading,
        isConnected,
        isReady,
        authenticate,
        onPaired,
        clearDevice,
        fetchSchedule,
        registerTvCallbacks,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider');
  return ctx;
}
