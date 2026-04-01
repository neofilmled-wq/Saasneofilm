'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TvAdItem } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';

interface AdInterstitialProps {
  ad: TvAdItem;
  onComplete: () => void;
  onSkip: () => void;
  onImpression: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
}

/**
 * Fullscreen ad interstitial overlay.
 * - Video autoplay muted or image with timer
 * - Skip button: hidden at start, appears after `canSkipAfterMs` (default 7s) with countdown
 * - "Passer dans Xs" → "Passer >>"
 */
export function AdInterstitial({ ad, onComplete, onSkip, onImpression }: AdInterstitialProps) {
  const [canSkip, setCanSkip] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(ad.canSkipAfterMs / 1000));
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(new Date());
  const videoRef = useRef<HTMLVideoElement>(null);
  const impressionReportedRef = useRef(false);

  const totalDurationSec = Math.ceil(ad.durationMs / 1000);
  const isVideo = ad.mimeType.startsWith('video/');
  const skipDelayMs = ad.canSkipAfterMs;
  const noSkip = skipDelayMs <= 0;

  const reportImpression = useCallback(
    (skipped: boolean) => {
      if (impressionReportedRef.current) return;
      impressionReportedRef.current = true;
      onImpression(ad, startTimeRef.current, new Date(), skipped);
    },
    [ad, onImpression],
  );

  // Countdown timer for skip button
  useEffect(() => {
    if (noSkip) return; // No skip for this context (e.g. CATALOG_OPEN rotation)

    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        const remaining = Math.ceil(skipDelayMs / 1000) - next;
        if (remaining <= 0) {
          setCanSkip(true);
          setCountdown(0);
          clearInterval(interval);
        } else {
          setCountdown(remaining);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [skipDelayMs, noSkip]);

  // Auto-complete for images after full duration
  useEffect(() => {
    if (isVideo) return;

    const timer = setTimeout(() => {
      reportImpression(false);
      onComplete();
    }, ad.durationMs);

    return () => clearTimeout(timer);
  }, [isVideo, ad.durationMs, reportImpression, onComplete]);

  const handleSkip = useCallback(() => {
    reportImpression(true);
    onSkip();
  }, [reportImpression, onSkip]);

  const handleVideoEnd = useCallback(() => {
    reportImpression(false);
    onComplete();
  }, [reportImpression, onComplete]);

  const handleVideoError = useCallback(() => {
    reportImpression(true);
    onComplete();
  }, [reportImpression, onComplete]);

  const progressPercent = isVideo
    ? 0 // Video has its own progress
    : Math.min(100, (elapsed / totalDurationSec) * 100);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      role="dialog"
      aria-label="Publicité"
    >
      {/* Media */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={resolveMediaUrl(ad.fileUrl)}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={handleVideoEnd}
          onError={handleVideoError}
        />
      ) : (
        <img
          src={resolveMediaUrl(ad.fileUrl)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Progress bar at bottom */}
      {!isVideo && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div
            className="h-full bg-white/60 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Advertiser badge */}
      <div
        className="absolute left-4 top-4 rounded-md bg-black/60 px-3 py-1.5 text-white/80"
        style={{ fontSize: '0.75em' }}
      >
        Publicité — {ad.advertiserName}
      </div>

      {/* Skip button zone — bottom right */}
      {!noSkip && (
        <div className="absolute bottom-6 right-6">
          {canSkip ? (
            <button
              onClick={handleSkip}
              className="flex items-center gap-2 rounded-md bg-white/90 px-5 py-2.5 font-semibold text-black shadow-lg transition-colors hover:bg-white"
              style={{ fontSize: '1em' }}
            >
              Passer
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M5 4l10 8-10 8V4zm11 0h3v16h-3V4z" />
              </svg>
            </button>
          ) : (
            <div
              className="rounded-md bg-black/60 px-4 py-2 text-white/80"
              style={{ fontSize: '0.9em' }}
            >
              Passer dans {countdown}s
            </div>
          )}
        </div>
      )}
    </div>
  );
}
