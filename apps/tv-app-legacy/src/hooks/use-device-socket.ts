'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TV_CONFIG } from '@/lib/constants';
import type { ScheduleBundle, TvMacroResponse } from '@/lib/device-api';

interface UseDeviceSocketOptions {
  deviceId: string | null;
  token: string | null;
  onScheduleUpdate?: (schedule: ScheduleBundle) => void;
  onCommand?: (command: string, params: Record<string, unknown>) => void;
  onTvConfigUpdate?: () => void;
  onAdsUpdate?: () => void;
  onActivitiesUpdate?: () => void;
  onCatalogueUpdate?: () => void;
  onMacrosUpdate?: (macros: TvMacroResponse) => void;
}

export function useDeviceSocket({
  deviceId,
  token,
  onScheduleUpdate,
  onCommand,
  onTvConfigUpdate,
  onAdsUpdate,
  onActivitiesUpdate,
  onCatalogueUpdate,
  onMacrosUpdate,
}: UseDeviceSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!deviceId || !token) return;

    const socket = io(`${TV_CONFIG.WS_URL}/devices`, {
      transports: ['websocket', 'polling'],
      query: { deviceId },
      auth: { token },
      reconnection: true,
      reconnectionDelay: TV_CONFIG.RECONNECT_BASE_MS,
      reconnectionDelayMax: TV_CONFIG.RECONNECT_MAX_MS,
    });

    let wasConnectedBefore = false;
    socket.on('connect', () => {
      if (wasConnectedBefore) {
        // Reconnected after a disconnect → server likely restarted (new deploy)
        console.log('[DeviceSocket] Reconnected — reloading page for updates');
        window.location.reload();
        return;
      }
      wasConnectedBefore = true;
      setIsConnected(true);
    });
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('schedule', (schedule: ScheduleBundle) => {
      onScheduleUpdate?.(schedule);
    });

    socket.on('command', (payload: { command: string; params: Record<string, unknown> }) => {
      onCommand?.(payload.command, payload.params);
    });

    socket.on('tvConfig:update', () => {
      onTvConfigUpdate?.();
    });

    socket.on('tv:ads:update', () => {
      onAdsUpdate?.();
    });

    socket.on('tv:activities:update', () => {
      onActivitiesUpdate?.();
    });

    socket.on('tv:catalogue:updated', () => {
      onCatalogueUpdate?.();
    });

    socket.on('tv:macros:update', (payload: { macros?: TvMacroResponse }) => {
      if (payload?.macros) {
        onMacrosUpdate?.(payload.macros);
      }
    });

    // Admin force reload — full page refresh
    socket.on('ads:force_reload', () => {
      console.log('[DeviceSocket] ads:force_reload received — reloading page');
      window.location.reload();
    });

    // Admin force ads refresh — re-fetch ads without full reload
    socket.on('ads:refresh', () => {
      console.log('[DeviceSocket] ads:refresh received');
      onAdsUpdate?.();
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deviceId, token, onScheduleUpdate, onCommand, onTvConfigUpdate, onAdsUpdate, onActivitiesUpdate, onCatalogueUpdate, onMacrosUpdate]);

  const sendHeartbeat = useCallback(
    (data: { isOnline: boolean; appVersion: string; uptime: number; screenId?: string }) => {
      socketRef.current?.emit('heartbeat', { deviceId, ...data });
    },
    [deviceId],
  );

  const sendMetrics = useCallback(
    (data: {
      cpuPercent?: number;
      memoryPercent?: number;
      diskPercent?: number;
      temperature?: number;
      networkType?: string;
      networkSpeed?: number;
    }) => {
      socketRef.current?.emit('metrics', { deviceId, ...data });
    },
    [deviceId],
  );

  const sendError = useCallback(
    (data: { severity: string; code: string; message: string; stackTrace?: string }) => {
      socketRef.current?.emit('error', { deviceId, ...data });
    },
    [deviceId],
  );

  return { isConnected, sendHeartbeat, sendMetrics, sendError };
}
