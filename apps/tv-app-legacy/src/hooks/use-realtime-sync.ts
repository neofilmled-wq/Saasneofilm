'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

import { TV_CONFIG } from '@/lib/constants';
const WS_URL = TV_CONFIG.WS_URL;
const MAX_DEDUP_IDS = 100;

interface RealtimeEvent {
  eventId: string;
  entity: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface UseRealtimeSyncOptions {
  deviceId: string | null;
  screenId: string | null;
  onScheduleInvalidation?: () => void;
}

/**
 * TV app realtime sync hook. Listens for ad-related events
 * and triggers schedule refetch. On reconnect, replays missed events.
 */
export function useRealtimeSync({
  deviceId,
  screenId,
  onScheduleInvalidation,
}: UseRealtimeSyncOptions) {
  const socketRef = useRef<Socket | null>(null);
  const seenIds = useRef(new Set<string>());
  const seenOrder = useRef<string[]>([]);
  const lastEventTimestamp = useRef<string | undefined>(undefined);

  const deduplicate = useCallback((eventId: string): boolean => {
    if (seenIds.current.has(eventId)) return true;
    seenIds.current.add(eventId);
    seenOrder.current.push(eventId);

    while (seenOrder.current.length > MAX_DEDUP_IDS) {
      const oldest = seenOrder.current.shift()!;
      seenIds.current.delete(oldest);
    }
    return false;
  }, []);

  const handleEvent = useCallback(
    (data: RealtimeEvent) => {
      if (deduplicate(data.eventId)) return;
      lastEventTimestamp.current = data.timestamp;
      onScheduleInvalidation?.();
    },
    [deduplicate, onScheduleInvalidation],
  );

  useEffect(() => {
    if (!deviceId) return;

    const socket = io(`${WS_URL}/realtime`, {
      auth: { role: 'device', deviceId, screenId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });
    socketRef.current = socket;

    // Schedule-impacting events
    const scheduleEvents = [
      'realtime:adplacement:created',
      'realtime:adplacement:updated',
      'realtime:adplacement:deleted',
      'realtime:campaign:updated',
      'realtime:campaign:deleted',
      'realtime:adcache:created',
      'realtime:adcache:updated',
      'realtime:adcache:deleted',
    ];

    for (const eventName of scheduleEvents) {
      socket.on(eventName, handleEvent);
    }

    // On reconnect, replay any queued events
    socket.on('connect', () => {
      socket.emit('get-queued-events', {
        deviceId,
        sinceTimestamp: lastEventTimestamp.current,
      });
    });

    socket.on('queued-events', (events: RealtimeEvent[]) => {
      for (const event of events) {
        handleEvent(event);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deviceId, screenId, handleEvent]);
}
