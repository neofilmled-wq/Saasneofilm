'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TV_CONFIG } from '@/lib/constants';
import type { CreativeManifest, TvAdItem } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

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
  /** Either 'video', 'image', or 'placeholder' (the NEOFILM branded slide). */
  kind: 'video' | 'image' | 'placeholder';
  fileUrl: string;
  mimeType: string;
  isTargeted: boolean;
  source: TvAdItem | CreativeManifest | null;
  /** For image/placeholder slides only — overrides the default hold timer. */
  holdMs?: number;
};

/** How long the NEOFILM placeholder stays on screen between video plays. */
const PLACEHOLDER_HOLD_MS = 7000;

/** Maximum time we let a single video occupy the panel before forcing the
 *  rotation onward — protects against stuck downloads, missing onEnded, or
 *  super-long creatives that an advertiser uploaded by accident. */
const VIDEO_MAX_DURATION_MS = 45000;

/** Hardcoded rotation pool when no real campaign creative is scheduled.
 *  Order matters: the panel boots straight into the first entry. */
const HOUSE_AD_POOL: { id: string; kind: 'video' | 'placeholder'; url?: string }[] = [
  { id: 'dupplex', kind: 'video', url: `${BASE_PATH}/dupplex.mp4` },
  { id: 'neofilm_placeholder', kind: 'placeholder' },
];

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
      {/* Diagonal motion stripes — disabled: animating a 1920-px-wide
          repeating-linear-gradient with mixBlendMode:'screen' every frame
          on the Fire Stick HD's Mali GPU was a significant compositor
          tax. Static stripes look nearly identical and cost ~nothing. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.022) 0 18px, transparent 18px 64px)',
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
          // breathe animation disabled — the continuous scale() transform
          // was promoting the entire placeholder subtree to its own
          // compositor layer and re-painting it every frame.
        }}
      >
        <img
          src={`${BASE_PATH}/neofilm-wordmark.png`}
          alt="NEOFILM"
          style={{
            // Crop the wordmark padding away — same trick as the TopBar.
            width: 'min(60%, 28rem)',
            height: '7rem',
            objectFit: 'cover',
            objectPosition: 'center',
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
  // Track every URL that has failed to load. When every URL in the pool
  // ends up here, we know the rotation can't recover — fall back to the
  // NEOFILM placeholder instead of cycling between dead URLs (which
  // otherwise leaves a black panel forever).
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [lastError, setLastError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef(new Date());
  const rotationInterval = rotationMs ?? TV_CONFIG.AD_ROTATION_INTERVAL_MS;

  const adPool = useMemo<DisplayAd[]>(() => {
    const targeted: DisplayAd[] = targetedAds
      .filter((ad) => !isSentinel(ad.fileUrl))
      .map((ad) => ({
        id: ad.creativeId,
        kind: ad.mimeType.startsWith('video/') ? 'video' : 'image',
        fileUrl: resolveMediaUrl(ad.fileUrl),
        mimeType: ad.mimeType,
        isTargeted: true,
        source: ad,
      }));
    const house: DisplayAd[] = houseAds
      .filter((ad) => !isSentinel(ad.fileUrl))
      .map((ad) => ({
        id: ad.creativeId,
        kind: ad.mimeType.startsWith('video/') ? 'video' : 'image',
        fileUrl: resolveMediaUrl(ad.fileUrl),
        mimeType: ad.mimeType,
        isTargeted: false,
        source: ad,
      }));

    // Empty pool → seed with HOUSE_AD_POOL (Dupplex first, then NEOFILM
    // placeholder). Each slide cycles in order: video plays end-to-end,
    // placeholder holds for PLACEHOLDER_HOLD_MS, then loops back to start.
    if (targeted.length === 0 && house.length === 0) {
      return HOUSE_AD_POOL.map((entry) => ({
        id: `house_${entry.id}`,
        kind: entry.kind,
        fileUrl: entry.url ?? '',
        mimeType: entry.kind === 'placeholder' ? 'application/neofilm-placeholder' : 'video/mp4',
        isTargeted: false,
        source: null,
      }));
    }

    return [...targeted, ...house];
  }, [targetedAds, houseAds]);

  const markFailed = useCallback((url: string) => {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  // Skip past creatives that have already failed since this render cycle.
  // Without this, we'd cycle right back onto a dead URL and re-trigger the
  // <video> error path forever.
  const liveAdPool = useMemo(
    () => adPool.filter((ad) => !failedUrls.has(ad.fileUrl) || ad.kind === 'placeholder'),
    [adPool, failedUrls],
  );
  const liveCurrentAd = liveAdPool[currentIndex % Math.max(1, liveAdPool.length)] ?? null;

  const playNext = useCallback(() => {
    if (liveCurrentAd?.isTargeted && onImpression) {
      onImpression(liveCurrentAd.source as TvAdItem, startTimeRef.current, new Date(), false);
    }
    startTimeRef.current = new Date();
    setCurrentIndex((i) => (liveAdPool.length > 0 ? (i + 1) % liveAdPool.length : 0));
  }, [liveAdPool.length, liveCurrentAd, onImpression]);

  useEffect(() => {
    if (!liveCurrentAd) return;
    if (liveCurrentAd.kind === 'image') {
      const timer = setTimeout(playNext, liveCurrentAd.holdMs ?? rotationInterval);
      return () => clearTimeout(timer);
    }
    if (liveCurrentAd.kind === 'placeholder') {
      const timer = setTimeout(playNext, liveCurrentAd.holdMs ?? PLACEHOLDER_HOLD_MS);
      return () => clearTimeout(timer);
    }
    if (liveCurrentAd.kind === 'video' && liveAdPool.length > 1) {
      // Safety net: if onEnded never fires (stuck download, network hung,
      // muted-autoplay rejected), force the rotation onward.
      const timer = setTimeout(playNext, VIDEO_MAX_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [liveCurrentAd, playNext, rotationInterval, liveAdPool.length]);

  useEffect(() => {
    setCurrentIndex(0);
    setFailedUrls(new Set());
    startTimeRef.current = new Date();
  }, [targetedAds.length, houseAds.length]);

  // Every URL in the pool has failed → NEOFILM placeholder, don't keep
  // bouncing between broken videos.
  if (!liveCurrentAd) {
    return <NeoFilmHousePlaceholder />;
  }

  if (liveCurrentAd.kind === 'placeholder') {
    return <NeoFilmHousePlaceholder />;
  }

  if (liveCurrentAd.kind === 'video') {
    const onlyOneAd = liveAdPool.length === 1;
    return (
      <div
        className="relative h-full w-full overflow-hidden bg-black flex items-center justify-center"
        // Force the <video> onto its own hardware compositor layer so a
        // main-thread stall (e.g. focus repaint on a sibling tile) doesn't
        // freeze video frames. WebView on Fire Stick HD picks SurfaceView
        // for translateZ()-promoted layers, which has its own pipeline.
        style={{ transform: 'translateZ(0)', willChange: 'transform' }}
      >
        {/* Auto-sizing wrapper: forces a 16:9 aspect ratio matching the
            re-encoded dupplex.mp4. max-w/max-h clamp it to whatever the
            annonce panel offers on this tab (wide on HOME, narrower in
            the sidebar on Streaming/TNT/etc.). The video fills that 16:9
            box edge-to-edge — no crop, no letterbox, never distorted —
            and the panel's bg-black shows wherever the wrapper doesn't
            reach so the result reads as a tidy framed creative. */}
        <div
          style={{
            aspectRatio: '16 / 9',
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
            position: 'relative',
          }}
        >
          <video
            ref={videoRef}
            key={liveCurrentAd.id}
            src={liveCurrentAd.fileUrl}
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: 'cover' }}
            autoPlay
            muted
            playsInline
            // preload="metadata" instead of "auto" — Fire Stick HD has 1 GB
            // RAM, pre-buffering the whole creative was triggering the
            // OOM killer to nuke our process along with 5 Amazon services.
            preload="metadata"
            loop={onlyOneAd}
            onLoadedData={() => {
              console.log(`[AdZone] Video loaded: ${liveCurrentAd.id} (${liveCurrentAd.fileUrl})`);
              setLastError(null);
            }}
            onEnded={onlyOneAd ? undefined : playNext}
            onError={(e) => {
              const err = (e.target as HTMLVideoElement).error;
              const msg = err
                ? `code ${err.code}: ${err.message}`
                : 'unknown error';
              console.warn(`[AdZone] Video error: ${liveCurrentAd.id} (${liveCurrentAd.fileUrl}) — ${msg}`);
              setLastError(`${liveCurrentAd.id} → ${msg}`);
              markFailed(liveCurrentAd.fileUrl);
              playNext();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        key={liveCurrentAd.id}
        src={liveCurrentAd.fileUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => {
          console.warn(`[AdZone] Image load failed: ${liveCurrentAd.id} — ${liveCurrentAd.fileUrl}`);
          markFailed(liveCurrentAd.fileUrl);
          playNext();
        }}
      />
    </div>
  );
}
