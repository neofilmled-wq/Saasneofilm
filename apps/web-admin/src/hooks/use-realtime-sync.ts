'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { queryKeys } from '@/lib/query-keys';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
const MAX_DEDUP_IDS = 100;

interface RealtimeEvent {
  eventId: string;
  entity: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

const INVALIDATION_MAP: Record<string, (event: RealtimeEvent) => readonly (readonly string[])[]> = {
  'realtime:campaign:created': () => [queryKeys.campaigns.all],
  'realtime:campaign:updated': (e) => [
    queryKeys.campaigns.all,
    queryKeys.campaigns.detail(e.entityId),
  ],
  'realtime:campaign:deleted': () => [queryKeys.campaigns.all],

  'realtime:screen:created': () => [queryKeys.screens.all],
  'realtime:screen:updated': (e) => [
    queryKeys.screens.all,
    queryKeys.screens.detail(e.entityId),
  ],
  'realtime:screen:deleted': () => [queryKeys.screens.all],

  'realtime:booking:created': () => [queryKeys.invoices.all, queryKeys.dashboard.stats],
  'realtime:booking:updated': () => [queryKeys.invoices.all, queryKeys.dashboard.stats],

  'realtime:subscription:created': () => [queryKeys.dashboard.stats],
  'realtime:subscription:updated': () => [queryKeys.dashboard.stats],

  'realtime:screenstatus:created': () => [queryKeys.screens.all],
  'realtime:screenstatus:updated': () => [queryKeys.screens.all, queryKeys.dashboard.stats],

  'realtime:catalogue:created': () => [queryKeys.dashboard.stats],
  'realtime:catalogue:updated': () => [queryKeys.dashboard.stats],
};

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const seenIds = useRef(new Set<string>());
  const seenOrder = useRef<string[]>([]);

  useEffect(() => {
    const socket = io(`${WS_URL}/realtime`, {
      auth: { role: 'admin' },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });
    socketRef.current = socket;

    const handleEvent = (eventName: string) => (data: RealtimeEvent) => {
      if (seenIds.current.has(data.eventId)) return;
      seenIds.current.add(data.eventId);
      seenOrder.current.push(data.eventId);

      while (seenOrder.current.length > MAX_DEDUP_IDS) {
        const oldest = seenOrder.current.shift()!;
        seenIds.current.delete(oldest);
      }

      const resolver = INVALIDATION_MAP[eventName];
      if (resolver) {
        const keys = resolver(data);
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: [...key] });
        }
      }
    };

    for (const eventName of Object.keys(INVALIDATION_MAP)) {
      socket.on(eventName, handleEvent(eventName));
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);
}
