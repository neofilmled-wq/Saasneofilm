'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/providers/auth-provider';
import { queryKeys } from '@/lib/api/query-keys';

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

  'realtime:subscription:created': () => [queryKeys.billing.subscription],
  'realtime:subscription:updated': () => [queryKeys.billing.subscription],

  'realtime:wallet:created': () => [queryKeys.ai.credits],
  'realtime:wallet:updated': () => [queryKeys.ai.credits],

  'realtime:catalogue:created': () => [queryKeys.catalog.all],
  'realtime:catalogue:updated': (e) => [
    queryKeys.catalog.all,
    queryKeys.catalog.detail(e.entityId),
  ],
  'realtime:catalogue:deleted': () => [queryKeys.catalog.all],

  'realtime:booking:created': () => [queryKeys.billing.subscription],
  'realtime:booking:updated': () => [queryKeys.billing.subscription],
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
      auth: { role: 'advertiser', orgId },
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
