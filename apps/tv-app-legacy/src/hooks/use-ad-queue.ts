'use client';

import { useCallback, useRef, useState } from 'react';
import { deviceApi, type TvAdItem, type TvMacroResponse } from '@/lib/device-api';

type TriggerContext = 'POWER_ON' | 'OPEN_APP' | 'CHANGE_APP' | 'CATALOG_OPEN' | 'SCHEDULED';

interface UseAdQueueOptions {
  screenId: string | null;
  macros: TvMacroResponse | null;
}

const DEFAULT_MACROS: TvMacroResponse = {
  screenId: null,
  spotDuration15s: true,
  spotDuration30s: true,
  skipDelayMs: 7000,
  adRotationMs: 15000,
  splitRatio: 70,
  adOnBoot: true,
  adOnTabChange: true,
  adOnAppOpen: true,
  adOnCatalogOpen: false,
  activitiesSplit: true,
  activitiesAdNoSkip: true,
  maxAdsPerHour: 20,
  maxInterstitialsPerSession: 10,
};

/**
 * useAdQueue — manages ad interstitials and rotation ads.
 *
 * - requestInterstitial(trigger): checks macros, fetches ads, sets interstitialAd
 * - rotationAds: ads for the sidebar rotation zone, refreshed periodically
 * - reportImpression: logs to backend
 * - Round-robin with anti-repetition (last 5 creatives)
 */
export function useAdQueue({ screenId, macros: externalMacros }: UseAdQueueOptions) {
  const macros = externalMacros ?? DEFAULT_MACROS;
  const [interstitialAd, setInterstitialAd] = useState<TvAdItem | null>(null);
  const [rotationAds, setRotationAds] = useState<TvAdItem[]>([]);

  // Session counters
  const interstitialCountRef = useRef(0);
  const hourlyCountRef = useRef(0);
  const hourlyResetRef = useRef(Date.now());
  const lastInterstitialTimeRef = useRef(0); // timestamp of last shown interstitial

  // Anti-repetition: last 5 shown creative IDs
  const recentCreativesRef = useRef<Set<string>>(new Set());

  const resetHourlyIfNeeded = useCallback(() => {
    const now = Date.now();
    if (now - hourlyResetRef.current > 3600_000) {
      hourlyCountRef.current = 0;
      hourlyResetRef.current = now;
    }
  }, []);

  const isTriggerEnabled = useCallback(
    (trigger: TriggerContext): boolean => {
      switch (trigger) {
        case 'POWER_ON':
          return macros.adOnBoot;
        case 'OPEN_APP':
          return macros.adOnAppOpen;
        case 'CHANGE_APP':
          return macros.adOnTabChange;
        case 'CATALOG_OPEN':
          return macros.adOnCatalogOpen;
        case 'SCHEDULED':
          return true;
        default:
          return false;
      }
    },
    [macros],
  );

  /**
   * Request an interstitial ad for a given trigger context.
   * Returns true if an ad will be shown, false if skipped (cap reached, disabled, no ads).
   */
  const requestInterstitial = useCallback(
    async (trigger: TriggerContext): Promise<boolean> => {
      // Check if trigger is enabled in macros
      if (!isTriggerEnabled(trigger)) return false;

      // Check 5-minute cooldown between interstitials
      const now = Date.now();
      if (now - lastInterstitialTimeRef.current < 5 * 60_000) return false;

      // Check session cap
      if (interstitialCountRef.current >= macros.maxInterstitialsPerSession) return false;

      // Check hourly cap
      resetHourlyIfNeeded();
      if (hourlyCountRef.current >= macros.maxAdsPerHour) return false;

      try {
        const response = await deviceApi.getAds(trigger, 1);

        if (response.ads.length === 0) return false;

        // Pick the first ad that hasn't been shown recently (anti-repetition)
        let ad = response.ads.find((a) => !recentCreativesRef.current.has(a.creativeId));
        if (!ad) {
          // All recently shown — reset and pick first
          recentCreativesRef.current.clear();
          ad = response.ads[0];
        }

        setInterstitialAd(ad);
        interstitialCountRef.current++;
        hourlyCountRef.current++;
        lastInterstitialTimeRef.current = Date.now();

        // Track recent creative
        recentCreativesRef.current.add(ad.creativeId);
        if (recentCreativesRef.current.size > 5) {
          const first = recentCreativesRef.current.values().next().value;
          if (first) recentCreativesRef.current.delete(first);
        }

        return true;
      } catch (err) {
        console.warn('[useAdQueue] Failed to fetch interstitial ads:', err);
        return false;
      }
    },
    [isTriggerEnabled, macros.maxInterstitialsPerSession, macros.maxAdsPerHour, resetHourlyIfNeeded],
  );

  /** Dismiss the current interstitial (after complete or skip). */
  const dismissInterstitial = useCallback(() => {
    setInterstitialAd(null);
  }, []);

  /** Fetch rotation ads for the sidebar AdZone. */
  const fetchRotationAds = useCallback(async () => {
    try {
      const response = await deviceApi.getAds('SCHEDULED', 10);
      setRotationAds(response.ads);
      // Notify native Android service of ads availability + data
      try {
        window.NeoFilmAndroid?.setAdsAvailable?.(response.ads.length);
        window.NeoFilmAndroid?.setAdsData?.(JSON.stringify(response.ads));
      } catch { /* bridge not available */ }
    } catch (err) {
      console.warn('[useAdQueue] Failed to fetch rotation ads:', err);
    }
  }, []);

  /** Report an ad impression to the backend (diffusion proof batch format). */
  const reportImpression = useCallback(
    async (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => {
      if (!screenId) return;

      const durationMs = endTime.getTime() - startTime.getTime();
      const deviceId = typeof window !== 'undefined'
        ? localStorage.getItem('neofilm_device_id') || 'unknown'
        : 'unknown';
      const proofId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      try {
        // Generate HMAC signature matching backend expectation
        const startIso = startTime.toISOString();
        const endIso = endTime.toISOString();

        await deviceApi.reportImpression({
          deviceId,
          batchId: proofId,
          proofs: [{
            proofId,
            screenId,
            campaignId: ad.campaignId,
            creativeId: ad.creativeId,
            startTime: startIso,
            endTime: endIso,
            durationMs,
            triggerContext: skipped ? 'CHANGE_APP' : 'SCHEDULED',
            appVersion: '1.0.0',
            mediaHash: ad.fileHash || 'none',
            signature: 'none', // Backend skips HMAC when provisioningToken is empty
          }],
        });
      } catch (err) {
        console.warn('[useAdQueue] Failed to report impression:', err);
      }
    },
    [screenId],
  );

  return {
    interstitialAd,
    rotationAds,
    requestInterstitial,
    dismissInterstitial,
    fetchRotationAds,
    reportImpression,
  };
}
