import type { ScheduleBundle } from './device-api';

const CACHE_KEY = 'neofilm_schedule_cache';

export function cacheSchedule(schedule: ScheduleBundle): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(schedule));
}

export function getCachedSchedule(): ScheduleBundle | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearScheduleCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
