'use client';

import { Component, useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react';
import { useDevice } from '@/providers/device-provider';
import { DeviceState } from '@/lib/state-machine';
import { useTvScale } from '@/hooks/use-tv-scale';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { PairingScreen } from '@/components/screens/pairing-screen';
import { SyncingScreen } from '@/components/screens/syncing-screen';
import { SmartTvDisplay } from '@/components/screens/smart-tv-display';
import { OfflineScreen } from '@/components/screens/offline-screen';
import { ErrorScreen } from '@/components/screens/error-screen';
import { LoadingSpinner } from '@/components/common/loading-spinner';

// Lazy-load the IPTV player — it pulls hls.js (~50 KB gzip) which only
// matters when the user actually opens a TNT channel. Keeping it out of
// the initial bundle gets the home page on screen meaningfully faster.
const IptvPlayer = lazy(() =>
  import('@/components/common/iptv-player').then((m) => ({ default: m.IptvPlayer })),
);

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
  // streamUrls that the native MediaPlayer failed on — those fall back to
  // the WebView IptvPlayer (hls.js) which handles a much wider range of HLS
  // manifests than Android's bundled MediaPlayer.
  const [nativeFailedUrls, setNativeFailedUrls] = useState<Set<string>>(new Set());

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

  // Zap via Android up/down while the native player is open. Native side
  // dispatches `neofilm-native-player-zap` with detail.dir = -1 (up) or +1 (down).
  // Hook lives above the early return for `isReady` so the hook order stays
  // stable (React error #310). Logic uses the latest hlsChannel/channelList
  // via the deps and reads them inside the handler closure.
  useEffect(() => {
    if (!hlsChannel || channelList.length === 0) return;
    const handleZap = (e: Event) => {
      const dir = (e as CustomEvent<{ dir: number }>).detail?.dir;
      if (dir !== 1 && dir !== -1) return;
      const currentIdx = channelList.findIndex((ch) => ch.streamUrl === hlsChannel.streamUrl);
      const nextIdx = (currentIdx + dir + channelList.length) % channelList.length;
      setHlsChannel(channelList[nextIdx]);
    };
    window.addEventListener('neofilm-native-player-zap', handleZap);
    return () => window.removeEventListener('neofilm-native-player-zap', handleZap);
  }, [hlsChannel, channelList]);

  // Use the native Android player when the bridge is available.
  // Why: the WebView's <video> + hls.js stack relies on Chromium's media pipeline,
  // which doesn't fall back to software HEVC. Cheap Android TV sticks (e.g. Fire
  // Stick basique) without hardware HEVC then play audio with a black frame.
  // The native VideoView path uses Android system codecs with software fallback.
  // NOTE: openNativeHls is the IPTV-fullscreen function on the native side.
  // showNativeVideo is a different (positioned, muted, looping) bridge used by
  // the ad sidebar — using it here was the previous regression.
  const nativeBridgeAvailable =
    typeof window !== 'undefined' && !!(window as { NeoFilmAndroid?: { openNativeHls?: unknown } }).NeoFilmAndroid?.openNativeHls;
  // Use native only when the bridge exists AND the stream hasn't already
  // failed via MediaPlayer (codec / manifest format unsupported).
  const useNativePlayer =
    nativeBridgeAvailable && !!hlsChannel && !nativeFailedUrls.has(hlsChannel.streamUrl);

  // Tracks whether the most recent native player session ended via an error,
  // so the subsequent `neofilm-native-player-closed` event (always emitted
  // by the native side, even after an error) doesn't wipe hlsChannel — we
  // want to keep it set and fall back to the hls.js player instead.
  const errorBeforeCloseRef = useRef(false);

  useEffect(() => {
    if (!useNativePlayer || !hlsChannel) return;
    const bridge = (window as { NeoFilmAndroid?: { openNativeHls?: (url: string) => void } }).NeoFilmAndroid;
    bridge?.openNativeHls?.(hlsChannel.streamUrl);

    const currentUrl = hlsChannel.streamUrl;
    errorBeforeCloseRef.current = false;
    const onClosed = () => {
      if (errorBeforeCloseRef.current) {
        // Native errored — fallback path will re-render with hls.js. Keep channel.
        errorBeforeCloseRef.current = false;
        return;
      }
      setHlsChannel(null);
    };
    const onError = () => {
      console.warn('[TvShell] Native player failed for', currentUrl, '— falling back to hls.js');
      errorBeforeCloseRef.current = true;
      setNativeFailedUrls((prev) => {
        if (prev.has(currentUrl)) return prev;
        const next = new Set(prev);
        next.add(currentUrl);
        return next;
      });
    };
    window.addEventListener('neofilm-native-player-closed', onClosed);
    window.addEventListener('neofilm-native-player-error', onError);
    return () => {
      window.removeEventListener('neofilm-native-player-closed', onClosed);
      window.removeEventListener('neofilm-native-player-error', onError);
    };
  }, [useNativePlayer, hlsChannel]);

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

  // data-neofilm-ready dismisses the boot splash (see layout.tsx)
  // SmartTvDisplay stays mounted underneath the channel overlay so its tab
  // state (TNT/STREAMING/ACTIVITIES…) survives a channel close — otherwise
  // the user is bounced back to HOME on every player exit.
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

  // Full-screen channel playback — rendered as an absolute overlay so the
  // underlying SmartTvDisplay keeps its tab state.
  const channelOverlay = hlsChannel ? (
    useNativePlayer ? (
      // Native VideoView sits above the WebView — just paint black underneath.
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
          background: '#000', zIndex: 1000,
        }}
      />
    ) : (
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
          background: '#000', zIndex: 1000,
          animation: 'channelEnter 0.35s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: `@keyframes channelEnter { from { opacity:0; transform:scale(1.04); } to { opacity:1; transform:scale(1); } }` }} />
        <Suspense fallback={<LoadingSpinner message="Ouverture de la chaîne..." />}>
          <IptvPlayer
            key={hlsChannel.streamUrl}
            streamUrl={hlsChannel.streamUrl}
            channelName={hlsChannel.name}
            onBack={() => setHlsChannel(null)}
            onChannelDown={() => zapChannel(1)}
            onChannelUp={() => zapChannel(-1)}
          />
        </Suspense>
      </div>
    )
  ) : null;

  return (
    <div data-neofilm-ready>
      {content}
      {channelOverlay}
    </div>
  );
}
