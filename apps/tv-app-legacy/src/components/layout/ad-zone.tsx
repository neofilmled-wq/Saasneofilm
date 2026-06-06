'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TV_CONFIG } from '@/lib/constants';
import type { CreativeManifest, TvAdItem } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';

/**
 * The diffusion scheduler returns this sentinel URL when no real house ad has
 * been uploaded yet — the underlying file does not exist on the API server.
 * We detect it so we can skip straight to the offline animated placeholder
 * instead of attempting a fetch that 404s.
 */
const HOUSE_AD_SENTINEL = '/creatives/house/default.mp4';

function isSentinel(url: string) {
  return !url || url === HOUSE_AD_SENTINEL || url.endsWith(HOUSE_AD_SENTINEL);
}

interface AdZoneProps {
  houseAds: CreativeManifest[];
  targetedAds?: TvAdItem[];
  rotationMs?: number;
  onImpression?: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
}

type DisplayAd = {
  id: string;
  fileUrl: string;
  mimeType: string;
  isTargeted: boolean;
  source: TvAdItem | CreativeManifest;
};

/**
 * Self-contained animated NEOFILM placeholder. Renders when there is no real
 * creative to play AND on video-load errors. Pure SVG + CSS — never depends on
 * network or file assets, so the annonce panel is never empty.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function NeoFilmHousePlaceholder() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse 70% 80% at 20% 30%, rgba(230,57,70,0.22), transparent 60%),' +
          'radial-gradient(ellipse 60% 70% at 85% 75%, rgba(80,90,210,0.18), transparent 65%),' +
          'linear-gradient(180deg, #11132a 0%, #050714 100%)',
      }}
    >
      {/* Diagonal motion stripes — gives the panel "video-like" liveliness */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.022) 0 18px, transparent 18px 64px)',
          animation: 'neo-marquee 16s linear infinite',
          mixBlendMode: 'screen',
        }}
      />
      {/* Centered NEOFILM wordmark + tagline */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#fff',
          animation: 'neo-placeholder-breathe 4s ease-in-out infinite',
        }}
      >
        <img
          src={`${BASE_PATH}/neofilm-wordmark.png`}
          alt="NEOFILM"
          style={{
            width: 'min(60%, 28rem)',
            height: 'auto',
            filter: 'drop-shadow(0 8px 28px rgba(230,57,70,0.4))',
          }}
        />
        <div
          style={{
            fontSize: '0.9rem',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          Votre conciergerie digitale
        </div>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.75rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ width: '2rem', height: '1px', background: 'rgba(255,255,255,0.3)' }} />
          espace publicitaire
          <span style={{ width: '2rem', height: '1px', background: 'rgba(255,255,255,0.3)' }} />
        </div>
      </div>
      <style>{`
        @keyframes neo-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(64px); }
        }
        @keyframes neo-placeholder-breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.015); }
        }
      `}</style>
    </div>
  );
}

/**
 * Ad rotation zone — fills its container.
 * - Prioritises targetedAds, then houseAds.
 * - When the pool is empty OR a creative URL is the broken house-ad sentinel,
 *   or any video URL fails to load, falls back to the offline-safe animated
 *   NEOFILM placeholder.
 */
export function AdZone({ houseAds, targetedAds = [], rotationMs, onImpression }: AdZoneProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef(new Date());
  const rotationInterval = rotationMs ?? TV_CONFIG.AD_ROTATION_INTERVAL_MS;

  const adPool = useMemo<DisplayAd[]>(() => {
    const targeted = targetedAds
      .filter((ad) => !isSentinel(ad.fileUrl))
      .map((ad) => ({
        id: ad.creativeId,
        fileUrl: resolveMediaUrl(ad.fileUrl),
        mimeType: ad.mimeType,
        isTargeted: true,
        source: ad,
      }));
    const house = houseAds
      .filter((ad) => !isSentinel(ad.fileUrl))
      .map((ad) => ({
        id: ad.creativeId,
        fileUrl: resolveMediaUrl(ad.fileUrl),
        mimeType: ad.mimeType,
        isTargeted: false,
        source: ad,
      }));
    return [...targeted, ...house];
  }, [targetedAds, houseAds]);

  const currentAd = adPool[currentIndex % adPool.length] ?? null;

  const playNext = useCallback(() => {
    if (currentAd?.isTargeted && onImpression) {
      onImpression(currentAd.source as TvAdItem, startTimeRef.current, new Date(), false);
    }
    startTimeRef.current = new Date();
    setVideoFailed(false);
    setCurrentIndex((i) => (adPool.length > 0 ? (i + 1) % adPool.length : 0));
  }, [adPool.length, currentAd, onImpression]);

  useEffect(() => {
    if (!currentAd) return;
    if (currentAd.mimeType.startsWith('image/')) {
      const timer = setTimeout(playNext, rotationInterval);
      return () => clearTimeout(timer);
    }
  }, [currentAd, playNext, rotationInterval]);

  useEffect(() => {
    setCurrentIndex(0);
    setVideoFailed(false);
    startTimeRef.current = new Date();
  }, [targetedAds.length, houseAds.length]);

  // Empty pool OR last attempt failed → NEOFILM placeholder.
  if (!currentAd || (videoFailed && adPool.length <= 1)) {
    return <NeoFilmHousePlaceholder />;
  }

  if (currentAd.mimeType.startsWith('video/')) {
    const onlyOneAd = adPool.length === 1;
    return (
      <div className="relative h-full w-full overflow-hidden">
        <video
          ref={videoRef}
          key={currentAd.id}
          src={currentAd.fileUrl}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          preload="auto"
          loop={onlyOneAd}
          onEnded={onlyOneAd ? undefined : playNext}
          onError={(e) => {
            console.warn(`[AdZone] Video error: ${currentAd.id}`, (e.target as HTMLVideoElement).error);
            if (adPool.length <= 1) {
              setVideoFailed(true);
            } else {
              playNext();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        key={currentAd.id}
        src={currentAd.fileUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => {
          console.warn(`[AdZone] Image load failed: ${currentAd.id} — ${currentAd.fileUrl}`);
          if (adPool.length <= 1) {
            setVideoFailed(true);
          } else {
            playNext();
          }
        }}
      />
    </div>
  );
}
