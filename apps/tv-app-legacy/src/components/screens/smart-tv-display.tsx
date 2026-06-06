'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDevice } from '@/providers/device-provider';
import { useTvConfig } from '@/hooks/use-tv-config';
import { useAdQueue } from '@/hooks/use-ad-queue';
import { TopBar } from '@/components/layout/top-bar';
import { TabNavigation, type TabKey } from '@/components/layout/tab-navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { PartnerBanner } from '@/components/layout/partner-banner';
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

  // Global ad sidebar — shared across all tabs so the <video> instance persists
  const hasAds = rotationAds.length > 0 || houseAds.length > 0;

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

  // Autofit the 1920×1080 stage to the actual TV viewport.
  //
  // JS-driven absolute positioning. The stage is positioned via inline
  // top/left styles computed from viewport + scaled stage size — no CSS
  // centering, no grid/flex, no transform quirks possible.
  //
  // Also paints a small debug overlay in the top-right corner showing the
  // detected viewport + computed scale + offsets so we can diagnose any
  // remaining quirk by just looking at the TV screen.
  useEffect(() => {
    const fit = () => {
      const stage = document.querySelector('.neo-fit-stage') as HTMLElement | null;
      if (!stage) return;
      const w = window.innerWidth || document.documentElement.clientWidth;
      const h = window.innerHeight || document.documentElement.clientHeight;
      const s = Math.min(w / 1920, h / 1080);
      const scaledW = 1920 * s;
      const scaledH = 1080 * s;
      const offsetLeft = Math.max(0, (w - scaledW) / 2);
      const offsetTop = Math.max(0, (h - scaledH) / 2);
      stage.style.transformOrigin = '0 0';
      stage.style.transform = `scale(${s})`;
      stage.style.top = `${offsetTop}px`;
      stage.style.left = `${offsetLeft}px`;
      const dbg = document.getElementById('neo-fit-debug');
      if (dbg) {
        dbg.textContent =
          `vp ${w}×${h} | scale ${s.toFixed(3)} | stage ${scaledW.toFixed(0)}×${scaledH.toFixed(0)} | off ${offsetLeft.toFixed(0)},${offsetTop.toFixed(0)} | dpr ${window.devicePixelRatio}`;
      }
      console.log(
        `[NeoFit] viewport=${w}x${h} scale=${s.toFixed(3)} stage=${scaledW.toFixed(0)}x${scaledH.toFixed(0)} offset=${offsetLeft.toFixed(0)},${offsetTop.toFixed(0)} dpr=${window.devicePixelRatio}`,
      );
    };
    fit();
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => fit());
      ro.observe(document.documentElement);
    }
    const timers = [50, 200, 500, 1000].map((d) => setTimeout(fit, d));
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [isLoading, configTimedOut]);

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

  return (
    <div className="neo-fit-wrap" data-neofilm-ready>
      {/* Debug overlay — top-right corner, outside the scaled stage so it's
          always at native viewport size and immune to scaling math. Remove
          this once the layout is confirmed correct on every TV size. */}
      <div
        id="neo-fit-debug"
        style={{
          position: 'fixed',
          top: 6,
          right: 6,
          padding: '4px 8px',
          font: '11px/1.2 monospace',
          color: '#fff',
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        booting…
      </div>
      <div
        className="neo-fit-stage neo-grain"
        style={{
          display: 'grid',
          gridTemplateRows: '84px 76px minmax(0, 1fr) auto',
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

        {/* Main grid: page (left) + sidebar (right) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hasAds || (catalogue && catalogue.length > 0)
              ? 'minmax(0, 1fr) 540px'
              : 'minmax(0, 1fr)',
            gap: 28,
            padding: '20px 48px 12px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'HOME' && (
              <HomePage
                onNavigate={onHomeNavigate}
                enabledModules={enabledModules}
                channelCount={channels?.filter((c: any) => c.streamUrl).length}
                streamingCount={streamingServices?.length}
                activitiesCount={activities?.length}
                addressesCount={catalogue?.length}
              />
            )}
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

          {(hasAds || (catalogue && catalogue.length > 0)) && (
            <Sidebar
              catalogue={catalogue ?? []}
              houseAds={houseAds}
              rotationAds={rotationAds}
              adRotationMs={macros?.adRotationMs}
              onAdImpression={reportImpression}
            />
          )}
        </div>

        <PartnerBanner
          partnerName={config?.welcomeMessage ?? screenName ?? null}
          city={null}
          partnerBannerUrl={partnerBannerUrl ?? null}
        />
      </div>
    </div>
  );
}

