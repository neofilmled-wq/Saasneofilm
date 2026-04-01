'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/providers/auth-provider';
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
  'realtime:screen:created': () => [queryKeys.screens.all],
  'realtime:screen:updated': (e) => [
    queryKeys.screens.all,
    queryKeys.screens.detail(e.entityId),
  ],
  'realtime:screen:deleted': () => [queryKeys.screens.all],

  'realtime:screenstatus:created': () => [queryKeys.screens.all, queryKeys.screens.allLiveStatuses()],
  'realtime:screenstatus:updated': () => [queryKeys.screens.all, queryKeys.screens.allLiveStatuses()],

  'realtime:booking:created': () => [queryKeys.commissions.all],
  'realtime:booking:updated': () => [queryKeys.commissions.all],
};

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const seenIds = useRef(new Set<string>());
  const seenOrder = useRef<string[]>([]);

  const orgId = user?.orgId;

  useEffect(() => {
    if (!orgId) return;

    const socket = io(`${WS_URL}/realtime`, {
      auth: { role: 'partner', orgId },
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
  }, [queryClient, orgId]);
}
