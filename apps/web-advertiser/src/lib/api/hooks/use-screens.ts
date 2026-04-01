'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { apiFetch } from '@/lib/api';
import type { MockScreen, ScreenEnvironment } from '@/lib/mock-data';

interface ScreenFilters {
  city?: string;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  environment?: ScreenEnvironment;
  status?: string;
}

export function useAvailableScreens(filters: ScreenFilters = {}) {
  return useQuery({
    queryKey: queryKeys.screens.available(filters),
    queryFn: async (): Promise<MockScreen[]> => {
      const raw: any[] = await apiFetch('/screens/map');

      // Map API response to the MockScreen shape used by targeting components
      // Filter out full screens — advertisers should not see them
      let screens: MockScreen[] = raw
        .filter((s) => !s.occupancy?.isFull)
        .map((s) => ({
          id: s.id,
          name: s.name,
          address: s.address ?? '',
          city: s.city ?? '',
          latitude: s.latitude ?? 0,
          longitude: s.longitude ?? 0,
          environment: (s.environment ?? 'OTHER') as ScreenEnvironment,
          status: (s.status ?? 'ACTIVE') as MockScreen['status'],
          monthlyPriceCents: s.monthlyPriceCents ?? 0,
          currency: s.currency ?? 'EUR',
          partnerOrgName: s.partnerOrg?.name ?? '',
          resolution: s.resolution ?? '1920x1080',
          isOnline: s.screenLiveStatus?.isOnline ?? false,
        }));

      if (filters.city) {
        screens = screens.filter((s) =>
          s.city.toLowerCase().includes(filters.city!.toLowerCase()),
        );
      }
      if (filters.environment) {
        screens = screens.filter((s) => s.environment === filters.environment);
      }
      if (filters.lat && filters.lng && filters.radiusKm) {
        screens = screens.filter((s) => {
          if (!s.latitude || !s.longitude) return false;
          return haversineKm(filters.lat!, filters.lng!, s.latitude, s.longitude) <= filters.radiusKm!;
        });
      }

      return screens;
    },
  });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
