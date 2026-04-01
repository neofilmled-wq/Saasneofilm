'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deviceApi,
  DeviceAuthError,
  type TvConfigResponse,
  type TvChannel,
  type StreamingService,
  type ActivityPlace,
  type CatalogueListing,
  type TvMacroResponse,
} from '@/lib/device-api';

interface UseTvConfigOptions {
  token: string | null;
  onAuthError: () => void;
}

interface TvConfigState {
  config: TvConfigResponse | null;
  channels: TvChannel[];
  streamingServices: StreamingService[];
  activities: ActivityPlace[];
  catalogue: CatalogueListing[];
  macros: TvMacroResponse | null;
  isLoading: boolean;
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

export function useTvConfig({ token, onAuthError }: UseTvConfigOptions) {
  const [state, setState] = useState<TvConfigState>({
    config: null,
    channels: [],
    streamingServices: [],
    activities: [],
    catalogue: [],
    macros: null,
    isLoading: false,
  });

  const fetchedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!token) return;

    setState((s) => ({ ...s, isLoading: true }));

    try {
      // Try bootstrap first (single call for all data)
      const bootstrap = await deviceApi.getBootstrap();

      console.log(
        `[TvConfig] bootstrap loaded: ${bootstrap.channels.length} channels, ${bootstrap.streamingServices.length} streaming, ${bootstrap.activities.length} activities`,
      );

      setState({
        config: bootstrap.config ?? {
          screenId: null,
          enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
          defaultTab: 'TNT',
          partnerLogoUrl: null,
          welcomeMessage: null,
          tickerText: null,
        },
        channels: bootstrap.channels ?? [],
        streamingServices: bootstrap.streamingServices ?? [],
        activities: bootstrap.activities ?? [],
        catalogue: bootstrap.catalogue ?? [],
        macros: bootstrap.macros ?? DEFAULT_MACROS,
        isLoading: false,
      });
    } catch (err) {
      if (err instanceof DeviceAuthError) {
        onAuthError();
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      // Bootstrap failed — fallback to individual fetches
      console.warn('[TvConfig] bootstrap failed, falling back to individual fetches:', err);

      try {
        const safeCatch = <T>(fallback: T) => (e: unknown) => {
          if (e instanceof DeviceAuthError) throw e;
          console.warn('[TvConfig] fetch error (using fallback):', e);
          return fallback;
        };

        const [config, channels, streaming, activities, catalogue, macros] = await Promise.all([
          deviceApi.getTvConfig().catch(safeCatch<TvConfigResponse | null>(null)),
          deviceApi.getChannels().catch(safeCatch<TvChannel[]>([])),
          deviceApi.getStreaming().catch(safeCatch<StreamingService[]>([])),
          deviceApi.getActivities().catch(safeCatch<ActivityPlace[]>([])),
          deviceApi.getCatalogue().catch(safeCatch<CatalogueListing[]>([])),
          deviceApi.getMacros().catch(safeCatch<TvMacroResponse | null>(null)),
        ]);

        setState({
          config: config ?? {
            screenId: null,
            enabledModules: ['TNT', 'STREAMING', 'ACTIVITIES'],
            defaultTab: 'TNT',
            partnerLogoUrl: null,
            welcomeMessage: null,
            tickerText: null,
          },
          channels: channels ?? [],
          streamingServices: streaming ?? [],
          activities: activities ?? [],
          catalogue: catalogue ?? [],
          macros: macros ?? DEFAULT_MACROS,
          isLoading: false,
        });
      } catch (fallbackErr) {
        if (fallbackErr instanceof DeviceAuthError) {
          onAuthError();
        }
        setState((s) => ({ ...s, isLoading: false }));
      }
    }
  }, [token, onAuthError]);

  // Fetch on first mount when token is available
  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAll();
  }, [token, fetchAll]);

  // Refresh catalogue + activities every 2 minutes so TV picks up content updates
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => fetchAll(), 2 * 60_000);
    return () => clearInterval(id);
  }, [token, fetchAll]);

  // Expose refetch for WebSocket-triggered updates
  const refetch = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  // Update macros in-memory (from WS push, no refetch needed)
  const updateMacros = useCallback((macros: TvMacroResponse) => {
    setState((s) => ({ ...s, macros }));
  }, []);

  return {
    ...state,
    refetch,
    updateMacros,
  };
}
