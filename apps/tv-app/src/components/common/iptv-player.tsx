'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { MediaPlayerClass } from 'dashjs';

export interface IptvPlayerProps {
  streamUrl: string;
  channelName: string;
  onBack: () => void;
  /** Max auto-retries before showing permanent error. Default: 3 */
  maxRetries?: number;
}

type PlayerState = 'loading' | 'playing' | 'error' | 'retrying';

/**
 * Robust HLS video player for IPTV streams.
 *
 * - Dynamic import of hls.js (no SSR)
 * - Auto-retry on network errors (limited)
 * - Muted autoplay (browser policy safe)
 * - Fallback UI on permanent failure
 * - Compatible with WebView Android TV
 */
export function IptvPlayer({
  streamUrl,
  channelName,
  onBack,
  maxRetries = 3,
}: IptvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<MediaPlayerClass | null>(null);
  const retryCount = useRef(0);
  const [playerState, setPlayerState] = useState<PlayerState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Overlay auto-hide
  const [showOverlay, setShowOverlay] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const resetOverlayTimer = useCallback(() => {
    setShowOverlay(true);
    clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setShowOverlay(false), 5000);
  }, []);

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashRef.current) {
      dashRef.current.reset();
      dashRef.current = null;
    }
  }, []);

  const isDash = streamUrl.endsWith('.mpd');

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlayerState('loading');
    setErrorMsg(null);
    destroyPlayer();

    if (isDash) {
      // DASH stream (.mpd)
      import('dashjs').then((dashjs) => {
        if (!videoRef.current) return;
        const player = dashjs.MediaPlayer().create();
        dashRef.current = player;
        player.initialize(video, streamUrl, true);
        player.updateSettings({
          streaming: {
            buffer: { fastSwitchEnabled: true },
            abr: { autoSwitchBitrate: { video: false } },
          },
        });
        // Force highest quality
        player.on('streamInitialized' as any, () => {
          try {
            const bitrateList = (player as any).getBitrateInfoListFor?.('video')
              ?? (player as any).getRepresentationsByType?.('video');
            if (bitrateList && bitrateList.length > 0) {
              (player as any).setQualityFor?.('video', bitrateList.length - 1);
            }
          } catch { /* ignore if API not available */ }
        });

        player.on('playbackStarted' as any, () => {
          retryCount.current = 0;
          setPlayerState('playing');
        });

        player.on('error' as any, (e: any) => {
          if (retryCount.current < maxRetries) {
            retryCount.current++;
            setPlayerState('retrying');
            setErrorMsg(`Reconnexion... (${retryCount.current}/${maxRetries})`);
            setTimeout(() => {
              player.attachSource(streamUrl);
            }, 2000);
          } else {
            setPlayerState('error');
            setErrorMsg(e?.error?.message || 'Flux DASH indisponible');
          }
        });
      }).catch(() => {
        setPlayerState('error');
        setErrorMsg('Impossible de charger le lecteur DASH');
      });
    } else {
      // HLS stream (.m3u8)
      import('hls.js').then(({ default: HlsLib }) => {
        if (!videoRef.current) return;

        if (HlsLib.isSupported()) {
          const hls = new HlsLib({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            startFragPrefetch: true,
            capLevelToPlayerSize: false,
            startLevel: -1,
            autoStartLoad: true,
          });
          hlsRef.current = hls;

          hls.loadSource(streamUrl);
          hls.attachMedia(video);

          hls.on(HlsLib.Events.MANIFEST_PARSED, (_e, data) => {
            // Force highest quality to avoid resolution switch zoom
            if (data.levels.length > 1) {
              hls.currentLevel = data.levels.length - 1;
            }
            retryCount.current = 0;
            // Try with sound first
            video.muted = false;
            video.volume = 1.0;
            video.play().then(() => {
              setPlayerState('playing');
              setIsMuted(false);
            }).catch(() => {
              // Autoplay with sound blocked — fallback muted
              video.muted = true;
              setIsMuted(true);
              video.play().then(() => setPlayerState('playing')).catch(() => setPlayerState('playing'));
            });
          });

          hls.on(HlsLib.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;

            if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
              if (retryCount.current < maxRetries) {
                retryCount.current++;
                setPlayerState('retrying');
                setErrorMsg(`Reconnexion... (${retryCount.current}/${maxRetries})`);
                setTimeout(() => hls.startLoad(), 2000);
              } else {
                setPlayerState('error');
                setErrorMsg('Flux indisponible — vérifiez votre connexion');
              }
            } else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setPlayerState('error');
              setErrorMsg('Format de flux non supporté');
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
          video.muted = true;
          video.addEventListener('loadedmetadata', () => {
            video.play().then(() => {
              setTimeout(() => { if (videoRef.current) { videoRef.current.muted = false; setIsMuted(false); } }, 500);
            }).catch(() => {});
            setPlayerState('playing');
          }, { once: true });
          video.addEventListener('error', () => {
            setPlayerState('error');
            setErrorMsg('Flux indisponible');
          }, { once: true });
        } else {
          setPlayerState('error');
          setErrorMsg('Navigateur incompatible avec la lecture HLS');
        }
      }).catch(() => {
        setPlayerState('error');
        setErrorMsg('Impossible de charger le lecteur vidéo');
      });
    }
  }, [streamUrl, maxRetries, destroyPlayer, isDash]);

  // Start playback on mount / streamUrl change
  useEffect(() => {
    retryCount.current = 0;
    startPlayback();
    resetOverlayTimer();

    return () => {
      destroyPlayer();
      clearTimeout(overlayTimer.current);
    };
  }, [streamUrl, startPlayback, destroyPlayer, resetOverlayTimer]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  }, []);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black"
      onMouseMove={resetOverlayTimer}
      onClick={resetOverlayTimer}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="h-full w-full"
        style={{ objectFit: 'contain', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        playsInline
        controls={false}
      />

      {/* Loading spinner — inline styles for guaranteed visibility */}
      {playerState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)',
        }}>
          <div style={{
            width: '3em', height: '3em', borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#3b82f6',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ marginTop: '1em', color: 'rgba(255,255,255,0.8)', fontSize: '0.9em' }}>
            Chargement de {channelName}...
          </p>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes spin{to{transform:rotate(360deg)}}' }} />
        </div>
      )}

      {/* Retrying state */}
      {playerState === 'retrying' && (
        <div className="absolute inset-x-0 bottom-[4em] flex justify-center">
          <div
            className="flex items-center gap-[0.5em] rounded-lg bg-yellow-900/80 px-[1em] py-[0.5em] text-yellow-200"
            style={{ fontSize: '0.85em' }}
          >
            <div className="h-[1em] w-[1em] animate-spin rounded-full border-2 border-yellow-200/30 border-t-yellow-200" />
            {errorMsg}
          </div>
        </div>
      )}

      {/* Error state — high-contrast for TV visibility */}
      {playerState === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(to bottom, #1a0000, #000)' }}>
          <div
            style={{
              width: '4em', height: '4em', fontSize: '1.5em',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', background: '#dc2626', color: '#fff',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '1.5em', height: '1.5em' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p style={{ marginTop: '0.75em', fontSize: '1.2em', fontWeight: 600, color: '#fca5a5' }}>
            {errorMsg || 'Flux indisponible'}
          </p>
          <p style={{ marginTop: '0.4em', fontSize: '0.8em', color: '#999' }}>
            {channelName} — {streamUrl.substring(0, 50)}{streamUrl.length > 50 ? '...' : ''}
          </p>
          <div className="mt-[1em] flex gap-[0.75em]">
            <button
              onClick={() => { retryCount.current = 0; startPlayback(); }}
              style={{
                background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
                padding: '0.5em 1.5em', fontSize: '0.9em', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Relancer
            </button>
            <button
              onClick={onBack}
              style={{
                background: '#333', color: '#fff', border: 'none', borderRadius: '8px',
                padding: '0.5em 1.5em', fontSize: '0.9em', cursor: 'pointer',
              }}
            >
              Retour
            </button>
          </div>
        </div>
      )}

      {/* Unmute prompt — big central button for user interaction */}
      {isMuted && playerState === 'playing' && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          style={{
            position: 'absolute', bottom: '2em', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.8)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)',
            borderRadius: '12px', padding: '0.8em 2em', fontSize: '1.1em', cursor: 'pointer',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5em', zIndex: 50,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '1.4em', height: '1.4em' }}>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
          Activer le son
        </button>
      )}

      {/* Channel info overlay — auto-hides */}
      {showOverlay && playerState === 'playing' && (
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-black/80 to-transparent"
          style={{ padding: '1em 1.5em', paddingBottom: '3em' }}
        >
          <div className="flex items-center gap-[0.75em]">
            <button
              onClick={onBack}
              className="flex items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              style={{ width: '2.5em', height: '2.5em' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '1.2em', height: '1.2em' }}>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div>
              <div className="font-bold text-white" style={{ fontSize: '1.1em' }}>
                {channelName}
              </div>
              <div className="flex items-center gap-[0.3em] text-white/60" style={{ fontSize: '0.75em' }}>
                <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-red-500" />
                EN DIRECT
              </div>
            </div>
          </div>

          {/* Mute toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            className="flex items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            style={{ width: '2.5em', height: '2.5em' }}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '1.2em', height: '1.2em' }}>
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: '1.2em', height: '1.2em' }}>
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
