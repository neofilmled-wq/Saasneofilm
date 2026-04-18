'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDevice } from '@/providers/device-provider';
import { useTvConfig } from '@/hooks/use-tv-config';
import { useAdQueue } from '@/hooks/use-ad-queue';
import { TopBar } from '@/components/layout/top-bar';
import { TabNavigation, type TabKey } from '@/components/layout/tab-navigation';
import { TickerBar } from '@/components/layout/ticker-bar';
import { AdZone } from '@/components/layout/ad-zone';
import { HomePage, type HomeDestination } from '@/components/pages/home-page';
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
export function SmartTvDisplay({ layout, onHlsChannelOpen, onChannelListReady }: SmartTvDisplayProps) {
  const { schedule, isConnected, token, screenId, registerTvCallbacks } = useDevice();

  const handleAuthError = useCallback(() => {
    // Auth errors are handled by DeviceProvider
  }, []);

  const { config, channels, streamingServices, activities, catalogue, macros, isLoading, refetch, updateMacros } = useTvConfig({
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

  // Fetch rotation ads on mount and periodically
  useEffect(() => {
    if (!token) return;
    fetchRotationAds();
    // Quick retry after 5s in case first fetch was too early
    const quickRetry = setTimeout(fetchRotationAds, 5000);
    const interval = setInterval(fetchRotationAds, 60_000);
    return () => { clearTimeout(quickRetry); clearInterval(interval); };
  }, [token, fetchRotationAds]);

  // Auto-reload when a new frontend version is deployed
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
    const interval = setInterval(checkForUpdate, 60_000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Notify native side when ads availability changes
  useEffect(() => {
    try {
      window.NeoFilmAndroid?.setAdsAvailable?.(rotationAds.length);
    } catch { /* bridge not available */ }
  }, [rotationAds]);

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

  // Show ads in the sidebar — not on HOME (it has its own 3-slot panel)
  const hasAds = rotationAds.length > 0 || houseAds.length > 0;
  // HomePage manages its own ads — no sidebar on HOME
  const isHomePage = activeTab === 'HOME';

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

  return (
    <>
      {/* Interstitial disabled — AdActivity native handles ads */}

      {/* Ambient background gradient */}
      <div className="tv-ambient-bg" />

      {/* Glass shell — main floating container */}
      <div
        className="tv-glass-shell relative z-10 flex flex-col overflow-hidden"
        style={{
          position: 'absolute',
          top: 'var(--tv-safe-y, 1.2vh)', right: 'var(--tv-safe-x, 1.2vw)',
          bottom: 'var(--tv-safe-y, 1.2vh)', left: 'var(--tv-safe-x, 1.2vw)',
        }}
      >
        {/* Top bar */}
        <TopBar
          partnerLogoUrl={config?.partnerLogoUrl ?? null}
          welcomeMessage={config?.welcomeMessage ?? null}
          isConnected={isConnected}
          screenName={screenName}
        />

        {/* Tab navigation */}
        <TabNavigation
          enabledModules={enabledModules}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        {/* Main content area — split between page and ads */}
        <div
          className="flex min-h-0 flex-1 overflow-hidden"
          style={{ flexDirection: layout.orientation === 'horizontal' ? 'row' : 'column' }}
        >
          {/* Content page */}
          <div
            className="min-h-0 min-w-0 overflow-hidden"
            style={{ flex: hasAds ? layout.mainFlex : 1 }}
          >
            {activeTab === 'HOME' && (
                <HomePage
                  onNavigate={(dest: HomeDestination) => {
                    const map: Record<HomeDestination, TabKey | null> = { TNT:'TNT', ACTIVITIES:'ACTIVITIES', STREAMING:'STREAMING', APPS:'APPS' };
                    const tab = map[dest]; if (tab) handleTabChange(tab);
                  }}
                  enabledModules={enabledModules}
                  targetedAds={rotationAds}
                  houseAds={houseAds}
                  rotationMs={macros?.adRotationMs}
                  onImpression={reportImpression}
                />
              )}
            {activeTab === 'TNT' && (
              <TntPage
                channels={channels}
                onChannelOpen={(ch) => onHlsChannelOpen?.({ name: ch.name, streamUrl: ch.streamUrl! })}
              />
            )}
            {activeTab === 'STREAMING' && <StreamingPage services={streamingServices} />}
            {activeTab === 'ACTIVITIES' && (
              <ActivitiesPage
                activities={activities}
                catalogue={catalogue}
                macros={macros}
                targetedAds={rotationAds}
                onImpression={reportImpression}
              />
            )}
            {activeTab === 'APPS' && <AppsPage />}
            {activeTab === 'SETTINGS' && <SettingsPage />}
          </div>

          {/* Ad zone — only if we have ads and not on activities with split mode */}
          {hasAds && !isHomePage && !(activeTab === 'ACTIVITIES' && macros?.activitiesSplit) && (
            <>
              <div
                className="tv-glass-divider shrink-0"
                style={{
                  width: layout.orientation === 'horizontal' ? '1px' : '100%',
                  height: layout.orientation === 'horizontal' ? '100%' : '1px',
                }}
              />
              <div
                className="min-h-0 min-w-0 overflow-hidden flex flex-col"
                style={{ flex: layout.adFlex }}
              >
                <div style={{ flex: 1 }} />
                <div style={{ width: '100%', padding: '0 0.5em' }}>
                  <p
                    className="text-muted-foreground"
                    style={{ fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5em' }}
                  >
                    Nos partenaires
                  </p>
                  <div className="overflow-hidden rounded-xl" style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                      <AdZone
                        houseAds={houseAds}
                        targetedAds={rotationAds}
                        rotationMs={macros?.adRotationMs}
                        onImpression={reportImpression}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1 }} />
              </div>
            </>
          )}
        </div>

        {/* Ticker bar */}
        <TickerBar
          isConnected={isConnected}
          tickerHeight={layout.tickerHeight}
        />
      </div>
    </>
  );
}
