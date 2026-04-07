'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TV_CONFIG } from '@/lib/constants';
import { deviceApi, DeviceAuthError, type ScheduleBundle } from '@/lib/device-api';
import { cacheSchedule, getCachedSchedule, clearScheduleCache } from '@/lib/schedule-cache';

export function useSchedule(deviceId: string | null, token: string | null, onAuthError?: () => void) {
  const [schedule, setSchedule] = useState<ScheduleBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const versionRef = useRef<number | undefined>(undefined);

  const fetchSchedule = useCallback(async () => {
    if (!deviceId || !token) return null;
    setIsLoading(true);
    try {
      const data = await deviceApi.getSchedule(deviceId, versionRef.current);
      if ('notModified' in data) return schedule;
      versionRef.current = data.version;
      cacheSchedule(data);
      setSchedule(data);
      return data;
    } catch (err) {
      if (err instanceof DeviceAuthError) {
        onAuthError?.();
        return null;
      }
      // On failure, try cache only if we have nothing yet
      const cached = getCachedSchedule();
      if (cached && !schedule) {
        setSchedule(cached);
        return cached;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, token, schedule, onAuthError]);

  /** Force clear cache and refetch from API */
  const invalidateAndRefetch = useCallback(async () => {
    versionRef.current = undefined;
    clearScheduleCache();
    return fetchSchedule();
  }, [fetchSchedule]);

  const handleScheduleUpdate = useCallback((newSchedule: ScheduleBundle) => {
    versionRef.current = newSchedule.version;
    cacheSchedule(newSchedule);
    setSchedule(newSchedule);
  }, []);

  // Load cache on mount
  useEffect(() => {
    const cached = getCachedSchedule();
    if (cached) setSchedule(cached);
  }, []);

  // Periodic refresh
  useEffect(() => {
    if (!deviceId || !token) return;
    fetchSchedule();
    const interval = setInterval(fetchSchedule, TV_CONFIG.SCHEDULE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [deviceId, token, fetchSchedule]);

  return { schedule, isLoading, fetchSchedule, handleScheduleUpdate, invalidateAndRefetch };
}
