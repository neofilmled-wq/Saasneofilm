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

  // Full-screen channel overlay — managed at shell level to guarantee true full-screen
  const [hlsChannel, setHlsChannel] = useState<{ name: string; streamUrl: string } | null>(null);
  // Channel list for zapping
  const [channelList, setChannelList] = useState<{ name: string; streamUrl: string }[]>([]);

  // Listen for Android BACK button event
  useEffect(() => {
    const handleBack = () => {
      if (hlsChannel) {
        setHlsChannel(null);
      }
      // Always propagate — smart-tv-display listens too for tab navigation
    };
    window.addEventListener('neofilm-back', handleBack);
    return () => window.removeEventListener('neofilm-back', handleBack);
  }, [hlsChannel]);

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" data-neofilm-ready>
        <LoadingSpinner message="Initialisation..." />
      </div>
    );
  }

  // Zapping functions
  const zapChannel = (direction: 1 | -1) => {
    console.log('[TvShell] zapChannel direction=' + direction + ' channelList.length=' + channelList.length + ' current=' + hlsChannel?.name);
    if (!hlsChannel || channelList.length === 0) return;
    const currentIdx = channelList.findIndex(ch => ch.streamUrl === hlsChannel.streamUrl);
    const nextIdx = (currentIdx + direction + channelList.length) % channelList.length;
    setHlsChannel(channelList[nextIdx]);
  };

  // Full-screen HLS/DASH player (always use web player for better error handling)
  if (hlsChannel) {
    return (
      <div data-neofilm-ready style={{ width: '100vw', height: '100vh', background: '#000', animation: 'channelEnter 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes channelEnter { from { opacity:0; transform:scale(1.04); } to { opacity:1; transform:scale(1); } }` }} />
        <IptvPlayer
          key={hlsChannel.streamUrl}
          streamUrl={hlsChannel.streamUrl}
          channelName={hlsChannel.name}
          onBack={() => setHlsChannel(null)}
          onChannelDown={() => zapChannel(1)}
          onChannelUp={() => zapChannel(-1)}
        />
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
            onHlsChannelOpen={(ch) => { console.log('[TvShell] Channel opened:', ch.name); setHlsChannel(ch); }}
            onChannelListReady={(list) => { console.log('[TvShell] Channel list ready:', list.length); setChannelList(list); }}
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
