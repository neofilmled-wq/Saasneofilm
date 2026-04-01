'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { queryKeys } from '@/lib/api/query-keys';

const POLLING_INTERVAL = 30_000; // 30 seconds

export function usePollingFallback() {
  const { isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isConnected) return; // WebSocket is active, no need for polling

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription });
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [isConnected, queryClient]);
}
