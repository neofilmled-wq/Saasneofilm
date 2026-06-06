'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDevice } from '@/providers/device-provider';
import { useTvConfig } from '@/hooks/use-tv-config';
import { useAdQueue } from '@/hooks/use-ad-queue';
import { TopBar } from '@/components/layout/top-bar';
import { TabNavigation, type TabKey } from '@/components/layout/tab-navigation';
import { Sidebar, PromoList, AnnoncePanel } from '@/components/layout/sidebar';
import { PartnerBanner } from '@/components/layout/partner-banner';
import { HomeTileCard, buildHomeTiles, type HomeDestination } from '@/components/pages/home-page';
import { TntPage } from '@/components/pages/tnt-page';
import { StreamingPage } from '@/components/pages/streaming-page';
import { ActivitiesPage } from '@/components/pages/activities-page';
import { SettingsPage } from '@/components/pages/settings-page';
import { AppsPage } from '@/components/pages/apps-page';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import type { AdaptiveLayout } from '@/hooks/use-adaptive-layout';


interface SmartTvDisplayProps {
  layout: AdaptiveLayout;
  onHlsChannelOpen?: (ch: { name: string; streamUrl: string }) => void;
  onChannelListReady?: (channels: { name: string; streamUrl: string }[]) => void;
}

/**
 * Smart TV Display — replaces the bare MainDisplay.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │  TOP BAR (logo, clock, status)                   │
 * ├─────────────────────────────────────────────────┤
 * │  TABS (TNT | Streaming | Activites | Parametres) │
 * ├──────────────────────────────┬──────────────────┤
 * │                              │                  │
 * │   CONTENT PAGE (70%)         │  AD ZONE (30%)   │
 * │                              │                  │
 * ├──────────────────────────────┴──────────────────┤
 * │  TICKER BAR                                      │
 * └─────────────────────────────────────────────────┘
 *
 * Interstitial ads overlay the entire screen on boot, tab change, etc.
 */
export function SmartTvDisplay({ layout: _layout, onHlsChannelOpen, onChannelListReady }: SmartTvDisplayProps) {
  const { schedule, isConnected, token, screenId, registerTvCallbacks } = useDevice();

  const handleAuthError = useCallback(() => {
    // Auth errors are handled by DeviceProvider
  }, []);

  const { config, channels, streamingServices, activities, catalogue, macros, partnerBannerUrl, isLoading, refetch, updateMacros } = useTvConfig({
    token,
    onAuthError: handleAuthError,
  });

  // Pass channel list to shell for zapping (only when channels change, not callback)
  const channelListReadyRef = useRef(onChannelListReady);
  channelListReadyRef.current = onChannelListReady;
  const prevChannelCountRef = useRef(0);
  useEffect(() => {
    if (channels && channels.length > 0 && channels.length !== prevChannelCountRef.current) {
      prevChannelCountRef.current = channels.length;
      const playableChannels = channels
        .filter((ch: any) => ch.streamUrl)
        .map((ch: any) => ({ name: ch.name, streamUrl: ch.streamUrl }));
      channelListReadyRef.current?.(playableChannels);
    }
  }, [channels]);

  const defaultTab = (config?.defaultTab as TabKey) ?? 'HOME';
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  // Back button → go to HOME tab
  useEffect(() => {
    const handleBack = () => {
      setActiveTab((prev) => (prev !== 'HOME' ? 'HOME' : prev));
    };
    window.addEventListener('neofilm-back', handleBack);
    return () => window.removeEventListener('neofilm-back', handleBack);
  }, []);

  const enabledModules = (config?.enabledModules as string[]) ?? ['TNT', 'STREAMING', 'ACTIVITIES'];

  const houseAds = schedule?.houseAds ?? [];

  // Ad queue management
  const {
    rotationAds,
    fetchRotationAds,
    reportImpression,
  } = useAdQueue({ screenId, macros });

  // Register WS event callbacks for real-time updates
  useEffect(() => {
    registerTvCallbacks({
      onTvConfigUpdate: refetch,
      onAdsUpdate: fetchRotationAds,
      onActivitiesUpdate: refetch,
      onCatalogueUpdate: refetch,
      onMacrosUpdate: updateMacros,
    });
  }, [registerTvCallbacks, refetch, fetchRotationAds, updateMacros]);

  // Boot interstitial disabled — AdActivity native handles ad sequences now

  // Fetch rotation ads on mount and periodically (every 5 min)
  useEffect(() => {
    if (!token) return;
    fetchRotationAds();
    const interval = setInterval(fetchRotationAds, 5 * 60_000);
    return () => clearInterval(interval);
  }, [token, fetchRotationAds]);

  // Auto-reload when a new frontend version is deployed (check every 10 min)
  useEffect(() => {
    const initialBuildId = document.querySelector('script[src*="/_next/"]')?.getAttribute('src') ?? '';
    const checkForUpdate = async () => {
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const html = await res.text();
        const match = html.match(/\/_next\/[^"']+/);
        if (match && initialBuildId && !html.includes(initialBuildId.split('/').pop() ?? '__none__')) {
          console.log('[SmartTvDisplay] New build detected — reloading');
          window.location.reload();
        }
      } catch { /* offline or error — skip */ }
    };
    const interval = setInterval(checkForUpdate, 10 * 60_000);
    return () => clearInterval(interval);
  }, []);

  // Notify native side when ads availability changes
  useEffect(() => {
    try {
      window.NeoFilmAndroid?.setAdsAvailable?.(rotationAds.length);
    } catch { /* bridge not available */ }
  }, [rotationAds]);

  // Push the interstitial cadence (ms between full-screen ad sequences) to the
  // native AdOverlayService. Stored in SharedPreferences and read on each tick
  // — no APK rebuild required when partners change the value via TvMacro.
  useEffect(() => {
    const ms = macros?.interstitialIntervalMs;
    if (typeof ms === 'number' && ms > 0) {
      try {
        window.NeoFilmAndroid?.setInterstitialIntervalMs?.(ms);
      } catch { /* bridge not available */ }
    }
  }, [macros?.interstitialIntervalMs]);

  // Notify native side of WebView connection status + pass credentials for heartbeat
  useEffect(() => {
    try {
      window.NeoFilmAndroid?.setWebViewConnected?.(isConnected);
      if (isConnected && token && screenId) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const deviceId = localStorage.getItem('neofilm_device_id') || '';
        window.NeoFilmAndroid?.setDeviceCredentials?.(token, apiUrl, deviceId, screenId);
      }
    } catch { /* bridge not available */ }
  }, [isConnected, token, screenId]);

  // Tab change — no interstitial on tab switch
  const handleTabChange = useCallback(
    (tab: TabKey) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
    },
    [activeTab],
  );

  const screenName =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_screen_name') : null;

  // Timeout: if config loading takes >10s, render anyway with defaults
  const [configTimedOut, setConfigTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      console.warn('[SmartTvDisplay] Config loading timed out after 10s — rendering with defaults');
      setConfigTimedOut(true);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [isLoading]);


  if (isLoading && !configTimedOut) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0f]">
        <LoadingSpinner message="Chargement de la configuration..." />
        <p className="absolute bottom-4 text-xs text-white/40">
          {isConnected ? 'Connecté' : 'Hors ligne'} | {token ? 'Token OK' : 'Token manquant'}
        </p>
      </div>
    );
  }

  // Map home tile destinations → tab keys
  const onHomeNavigate = (dest: HomeDestination) => {
    const map: Partial<Record<HomeDestination, TabKey>> = {
      TNT: 'TNT',
      ACTIVITIES: 'ACTIVITIES',
      STREAMING: 'STREAMING',
      APPS: 'APPS',
      ADDRESSES: 'ADDRESSES',
      CONCIERGE: 'HOME',
    };
    const tab = map[dest];
    if (tab) handleTabChange(tab);
  };

  // HOME tab gets a custom 4-column grid so the annonce panel can span the
  // empty bottom-right home-grid cell + the sidebar bottom in ONE seamless
  // wide panel — that's the "annonce takes the empty space recommendation
  // left" layout the user asked for.
  const homeTiles = buildHomeTiles({
    channelCount: channels?.filter((c: any) => c.streamUrl).length,
    streamingCount: streamingServices?.length,
    activitiesCount: activities?.length,
    addressesCount: catalogue?.length,
  }).filter((t) => !t.module || enabledModules.includes(t.module));

  return (
    <div className="neo-fit-wrap" data-neofilm-ready>
      <div
        className="neo-fit-stage neo-grain"
        style={{
          display: 'grid',
          gridTemplateRows: '5.25rem 4.75rem minmax(0, 1fr) auto',
        }}
      >
        <TopBar
          partnerLogoUrl={config?.partnerLogoUrl ?? null}
          welcomeMessage={config?.welcomeMessage ?? null}
          isConnected={isConnected}
          screenName={screenName}
        />

        <TabNavigation
          enabledModules={enabledModules}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        {activeTab === 'HOME' ? (
          /* HOME tab: 4-col 2-row unified grid.
              Top row    : 3 tiles + codes promo (sidebar col)
              Bottom row : 2 tiles + annonce (spans cols 3+4) */
          <div
            data-tv-nav-group="home-tiles"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 33rem',
              gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--neo-gap)',
              padding: '1.25rem 3rem 0.75rem',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {homeTiles.slice(0, 3).map((tile, idx) => (
              <HomeTileCard
                key={tile.id}
                tile={tile}
                idx={idx}
                onClick={() => onHomeNavigate(tile.id)}
              />
            ))}
            <div style={{ gridColumn: '4', gridRow: '1', minHeight: 0 }}>
              <PromoList catalogue={catalogue ?? []} />
            </div>
            {homeTiles.slice(3, 5).map((tile, i) => (
              <HomeTileCard
                key={tile.id}
                tile={tile}
                idx={3 + i}
                onClick={() => onHomeNavigate(tile.id)}
              />
            ))}
            <div
              style={{
                gridColumn: '3 / span 2',
                gridRow: '2',
                minHeight: 0,
              }}
            >
              <AnnoncePanel
                houseAds={houseAds}
                rotationAds={rotationAds}
                adRotationMs={macros?.adRotationMs}
                onAdImpression={reportImpression}
              />
            </div>
          </div>
        ) : (
          /* Other tabs: classic content + sidebar (codes promo + annonce). */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 33rem',
              gap: '1.75rem',
              padding: '1.25rem 3rem 0.75rem',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {activeTab === 'TNT' && (
                <TntPage
                  channels={channels}
                  onChannelOpen={(ch) => onHlsChannelOpen?.({ name: ch.name, streamUrl: ch.streamUrl! })}
                />
              )}
              {activeTab === 'STREAMING' && <StreamingPage services={streamingServices} />}
              {activeTab === 'ADDRESSES' && (
                <ActivitiesPage activities={activities} catalogue={catalogue} />
              )}
              {activeTab === 'ACTIVITIES' && (
                <ActivitiesPage activities={activities} catalogue={catalogue} />
              )}
              {activeTab === 'APPS' && <AppsPage />}
              {activeTab === 'SETTINGS' && <SettingsPage />}
            </div>

            <Sidebar
              catalogue={catalogue ?? []}
              houseAds={houseAds}
              rotationAds={rotationAds}
              adRotationMs={macros?.adRotationMs}
              onAdImpression={reportImpression}
            />
          </div>
        )}

        <PartnerBanner
          partnerName={config?.welcomeMessage ?? screenName ?? null}
          city={null}
          partnerBannerUrl={partnerBannerUrl ?? null}
        />
      </div>
    </div>
  );
}

