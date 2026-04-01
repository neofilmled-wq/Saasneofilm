'use client';

import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

interface AdminSocketState {
  connected: boolean;
  dashboardSummary: any | null;
  screenStatuses: any[];
}

export function useAdminSocket() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AdminSocketState>({
    connected: false,
    dashboardSummary: null,
    screenStatuses: [],
  });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${WS_URL}/admin`, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState((prev) => ({ ...prev, connected: true }));
    });

    socket.on('disconnect', () => {
      setState((prev) => ({ ...prev, connected: false }));
    });

    // Dashboard summary updates
    socket.on('admin:dashboard:update', (summary: any) => {
      setState((prev) => ({ ...prev, dashboardSummary: summary }));
      queryClient.setQueryData(['dashboard', 'summary'], { data: summary });
      queryClient.setQueryData(['admin', 'dashboard', 'summary'], { data: summary });
    });

    // Screen statuses
    socket.on('admin:screens:status', (statuses: any[]) => {
      setState((prev) => ({ ...prev, screenStatuses: statuses }));
    });

    // Entity change events - invalidate relevant queries
    socket.on('admin:users:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    });

    socket.on('admin:partners:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'PARTNER'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'partners'] });
    });

    socket.on('admin:advertisers:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', 'ADVERTISER'] });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'advertisers'] });
    });

    socket.on('admin:screens:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'screens'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'screens'] });
    });

    socket.on('admin:moderation:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
    });

    socket.on('admin:activity:new', () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'activity'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);

  return state;
}
