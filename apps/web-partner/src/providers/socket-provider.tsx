'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import type { ScreenEvent, AlertEvent, PayoutEvent, ConfigAppliedEvent } from '@/lib/socket';
import { getQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  useFallbackPolling: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  useFallbackPolling: true,
});

export function useSocketContext() {
  return useContext(SocketContext);
}

export function SocketProvider({
  partnerOrgId,
  children,
}: {
  partnerOrgId: string | null;
  children: React.ReactNode;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [useFallbackPolling, setUseFallbackPolling] = useState(true);

  const handleScreenEvent = useCallback((event: ScreenEvent) => {
    const queryClient = getQueryClient();
    queryClient.invalidateQueries({ queryKey: queryKeys.screens.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.screens.liveStatus(event.screenId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.screens.allLiveStatuses() });
  }, []);

  const handleAlertEvent = useCallback((_event: AlertEvent) => {
    const queryClient = getQueryClient();
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
  }, []);

  const handlePayoutEvent = useCallback((_event: PayoutEvent) => {
    const queryClient = getQueryClient();
    queryClient.invalidateQueries({ queryKey: queryKeys.payouts.all });
  }, []);

  const handleConfigApplied = useCallback((event: ConfigAppliedEvent) => {
    const queryClient = getQueryClient();
    queryClient.invalidateQueries({ queryKey: queryKeys.screens.uxConfig(event.screenId) });
  }, []);

  useEffect(() => {
    if (!partnerOrgId) return;

    const s = getSocket(partnerOrgId);
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);
      setUseFallbackPolling(false);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
      setTimeout(() => setUseFallbackPolling(true), 30000);
    });

    s.on('screen.online', handleScreenEvent);
    s.on('screen.offline', handleScreenEvent);
    s.on('screen.degraded', handleScreenEvent);
    s.on('screen.error', handleScreenEvent);
    s.on('alert.created', handleAlertEvent);
    s.on('payout.updated', handlePayoutEvent);
    s.on('screen.configApplied', handleConfigApplied);

    // Partner real-time events
    s.on('partner:screensChanged', () => {
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: queryKeys.screens.all });
      if (partnerOrgId) {
        qc.invalidateQueries({ queryKey: queryKeys.screens.statusSummary(partnerOrgId) });
        qc.invalidateQueries({ queryKey: queryKeys.screens.partnerMap(partnerOrgId) });
        qc.invalidateQueries({ queryKey: queryKeys.screens.ranking(partnerOrgId) });
      }
    });
    s.on('partner:screenStatusChanged', (event: { screenId: string }) => {
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: queryKeys.screens.liveStatus(event.screenId) });
      qc.invalidateQueries({ queryKey: queryKeys.screens.allLiveStatuses() });
      if (partnerOrgId) {
        qc.invalidateQueries({ queryKey: queryKeys.screens.statusSummary(partnerOrgId) });
      }
    });
    s.on('device:paired', (event: { screenId: string }) => {
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: queryKeys.screens.detail(event.screenId) });
      qc.invalidateQueries({ queryKey: queryKeys.pairing.all });
    });
    s.on('commissions:rateChanged', () => {
      const qc = getQueryClient();
      if (partnerOrgId) {
        qc.invalidateQueries({ queryKey: queryKeys.commissions.wallet(partnerOrgId) });
        qc.invalidateQueries({ queryKey: queryKeys.commissions.all });
      }
    });
    s.on('commissions:statementUpdated', () => {
      const qc = getQueryClient();
      if (partnerOrgId) {
        qc.invalidateQueries({ queryKey: queryKeys.commissions.all });
      }
    });

    return () => {
      disconnectSocket();
      setSocket(null);
      setIsConnected(false);
    };
  }, [partnerOrgId, handleScreenEvent, handleAlertEvent, handlePayoutEvent, handleConfigApplied]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, useFallbackPolling }}>
      {children}
    </SocketContext.Provider>
  );
}
