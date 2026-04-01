'use client';

import { Component, useState, useEffect, type ReactNode } from 'react';
import { useDevice } from '@/providers/device-provider';
import { DeviceState } from '@/lib/state-machine';
import { useTvScale } from '@/hooks/use-tv-scale';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { PairingScreen } from '@/components/screens/pairing-screen';
import { SyncingScreen } from '@/components/screens/syncing-screen';
import { SmartTvDisplay } from '@/components/screens/smart-tv-display';
import { IptvPlayer } from '@/components/common/iptv-player';
import { OfflineScreen } from '@/components/screens/offline-screen';
import { ErrorScreen } from '@/components/screens/error-screen';
import { LoadingSpinner } from '@/components/common/loading-spinner';

/** Per-screen ErrorBoundary — catches render crashes without killing the whole app */
class ScreenBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error(`[ScreenBoundary:${this.props.name}]`, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui',
        }}>
          <div style={{ fontSize: '2em', fontWeight: 700, marginBottom: '0.5em' }}>
            <span style={{ color: '#3b82f6' }}>NEO</span>FILM
          </div>
          <p style={{ color: '#f87171', fontSize: '1.1em' }}>
            Erreur dans {this.props.name}
          </p>
          <p style={{ color: '#666', fontSize: '0.85em', marginTop: '0.5em', maxWidth: '60vw', textAlign: 'center' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '1.5em', background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '0.6em 1.5em', fontSize: '0.9em', cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TvShell() {
  const { state, errorMessage, isReady } = useDevice();
  const scaleInfo = useTvScale();
  const layout = useAdaptiveLayout(scaleInfo);

  // Full-screen channel overlays — managed at shell level to guarantee true full-screen
  const [hlsChannel, setHlsChannel] = useState<{ name: string; streamUrl: string } | null>(null);
  const [webChannel, setWebChannel] = useState<{ name: string; url: string } | null>(null);

  // Listen for Android BACK button event
  useEffect(() => {
    const handleBack = () => {
      if (hlsChannel) {
        setHlsChannel(null);
      } else if (webChannel) {
        setWebChannel(null);
      }
      // Always propagate — smart-tv-display listens too for tab navigation
    };
    window.addEventListener('neofilm-back', handleBack);
    return () => window.removeEventListener('neofilm-back', handleBack);
  }, [hlsChannel, webChannel]);

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" data-neofilm-ready>
        <LoadingSpinner message="Initialisation..." />
      </div>
    );
  }

  // Full-screen HLS/DASH player (always use web player for better error handling)
  if (hlsChannel) {
    return (
      <div data-neofilm-ready style={{ width: '100vw', height: '100vh', background: '#000', animation: 'channelEnter 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes channelEnter { from { opacity:0; transform:scale(1.04); } to { opacity:1; transform:scale(1); } }` }} />
        <IptvPlayer
          streamUrl={hlsChannel.streamUrl}
          channelName={hlsChannel.name}
          onBack={() => setHlsChannel(null)}
        />
      </div>
    );
  }

  // Full-screen Web TV via Android native bridge (openWebPageFullscreen)
  if (webChannel) {
    const hasFullscreenBridge = typeof window !== 'undefined' && !!window.NeoFilmAndroid?.openWebPageFullscreen;
    if (hasFullscreenBridge) {
      window.NeoFilmAndroid!.openWebPageFullscreen!(webChannel.url);
      // Reset state after handing off to native — use setTimeout to avoid setState during render
      setTimeout(() => setWebChannel(null), 0);
    }
    // Show brief loading overlay while native bridge opens
    return (
      <div data-neofilm-ready style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'channelEnter 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes channelEnter { from { opacity:0; transform:scale(1.04); } to { opacity:1; transform:scale(1); } }` }} />
        {!hasFullscreenBridge ? (
          // Browser dev fallback
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.8)', width: '100%', boxSizing: 'border-box' }}>
              <button onClick={() => setWebChannel(null)} style={{ width: '2.2em', height: '2.2em', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '1.2em', height: '1.2em' }}><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span style={{ fontWeight: 600, color: '#fff' }}>{webChannel.name}</span>
            </div>
            <iframe src={webChannel.url} style={{ flex: 1, width: '100%', border: 'none' }} allow="autoplay; fullscreen" title={webChannel.name} />
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
            <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
            <style dangerouslySetInnerHTML={{ __html: `@keyframes spin{to{transform:rotate(360deg)}}` }} />
            <p>Ouverture de {webChannel.name}...</p>
          </div>
        )}
      </div>
    );
  }

  // data-neofilm-ready dismisses the boot splash (see layout.tsx)
  let content;
  switch (state) {
    case DeviceState.UNPAIRED:
      content = <ScreenBoundary name="Pairing"><PairingScreen /></ScreenBoundary>; break;
    case DeviceState.PAIRED:
      content = <SyncingScreen message="Connexion etablie..." />; break;
    case DeviceState.SYNCING:
      content = <SyncingScreen message="Synchronisation du programme..." />; break;
    case DeviceState.ACTIVE:
      content = (
        <ScreenBoundary name="Display">
          <SmartTvDisplay
            layout={layout}
            onHlsChannelOpen={setHlsChannel}
            onWebChannelOpen={(ch) => setWebChannel({ name: ch.name, url: ch.webUrl })}
          />
        </ScreenBoundary>
      ); break;
    case DeviceState.OFFLINE:
      content = <ScreenBoundary name="Offline"><OfflineScreen layout={layout} /></ScreenBoundary>; break;
    case DeviceState.ERROR:
      content = <ErrorScreen message={errorMessage} />; break;
    default:
      content = <PairingScreen />;
  }

  return <div data-neofilm-ready>{content}</div>;
}
