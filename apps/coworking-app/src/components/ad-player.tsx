'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deviceApi, resolveMediaUrl, type TvAdItem } from '@/lib/device-api';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Same sentinel the diffusion scheduler returns when no real house ad exists.
const HOUSE_AD_SENTINEL = '/creatives/house/default.mp4';
function isSentinel(url: string) {
  return !url || url === HOUSE_AD_SENTINEL || url.endsWith(HOUSE_AD_SENTINEL);
}

/** Built-in fallback pool when nothing is scheduled — same as legacy. */
const HOUSE_AD_POOL: { id: string; kind: 'video' | 'placeholder'; url?: string }[] = [
  { id: 'dupplex', kind: 'video', url: `${BASE_PATH}/dupplex.mp4` },
  { id: 'neofilm_placeholder', kind: 'placeholder' },
];

const PLACEHOLDER_HOLD_MS = 7000;
const IMAGE_HOLD_MS = 12000;
const VIDEO_MAX_DURATION_MS = 45000;
const REFETCH_INTERVAL_MS = 3 * 60_000;

type DisplayAd = {
  id: string;
  kind: 'video' | 'image' | 'placeholder';
  fileUrl: string;
  holdMs?: number;
};

/**
 * Full-screen ad loop for a paired Coworking screen.
 * Fetches targeted + house ads from /tv/ads and rotates them; falls back to the
 * bundled Dupplex video + a NeoFilm placeholder when nothing is scheduled.
 */
export function AdPlayer() {
  const [targeted, setTargeted] = useState<TvAdItem[]>([]);
  const [house, setHouse] = useState<TvAdItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fetch ads on mount, then refresh periodically.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await deviceApi.getAds('POWER_ON', 20);
        if (cancelled) return;
        setTargeted(Array.isArray(res.ads) ? res.ads : []);
        setHouse(Array.isArray(res.fallbackHouseAds) ? res.fallbackHouseAds : []);
      } catch {
        // Non-fatal — keep whatever we had; the house fallback still plays.
      }
    };
    load();
    const id = setInterval(load, REFETCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const adPool: DisplayAd[] = useMemo(() => {
    const t: DisplayAd[] = targeted
      .filter((ad) => !isSentinel(ad.fileUrl))
      .map((ad) => ({
        id: `t_${ad.creativeId}`,
        kind: ad.mimeType.startsWith('video/') ? 'video' : 'image',
        fileUrl: resolveMediaUrl(ad.fileUrl),
      }));
    const h: DisplayAd[] = house
      .filter((ad) => !isSentinel(ad.fileUrl))
      .map((ad) => ({
        id: `h_${ad.creativeId}`,
        kind: ad.mimeType.startsWith('video/') ? 'video' : 'image',
        fileUrl: resolveMediaUrl(ad.fileUrl),
      }));

    if (t.length === 0 && h.length === 0) {
      return HOUSE_AD_POOL.map((e) => ({
        id: `house_${e.id}`,
        kind: e.kind,
        fileUrl: e.url ?? '',
      }));
    }
    return [...t, ...h];
  }, [targeted, house]);

  const livePool = useMemo(
    () => adPool.filter((ad) => !failedUrls.has(ad.fileUrl) || ad.kind === 'placeholder'),
    [adPool, failedUrls],
  );
  const current = livePool[currentIndex % Math.max(1, livePool.length)] ?? null;

  const playNext = useCallback(() => {
    setCurrentIndex((i) => (livePool.length > 0 ? (i + 1) % livePool.length : 0));
  }, [livePool.length]);

  const markFailed = useCallback((url: string) => {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  // Reset rotation when the pool changes.
  useEffect(() => {
    setCurrentIndex(0);
    setFailedUrls(new Set());
  }, [targeted.length, house.length]);

  // Advance timers for image / placeholder / stuck-video.
  useEffect(() => {
    if (!current) return;
    if (current.kind === 'image') {
      const t = setTimeout(playNext, current.holdMs ?? IMAGE_HOLD_MS);
      return () => clearTimeout(t);
    }
    if (current.kind === 'placeholder') {
      const t = setTimeout(playNext, current.holdMs ?? PLACEHOLDER_HOLD_MS);
      return () => clearTimeout(t);
    }
    if (current.kind === 'video' && livePool.length > 1) {
      const t = setTimeout(playNext, VIDEO_MAX_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [current, playNext, livePool.length]);

  if (!current || current.kind === 'placeholder') {
    return <NeoFilmPlaceholder />;
  }

  if (current.kind === 'video') {
    const onlyOne = livePool.length === 1;
    return (
      <div style={fullscreen}>
        <video
          ref={videoRef}
          key={current.id}
          src={current.fileUrl}
          style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }}
          width={1280}
          height={720}
          autoPlay
          muted
          playsInline
          preload="auto"
          loop={onlyOne}
          onEnded={onlyOne ? undefined : playNext}
          onError={() => {
            markFailed(current.fileUrl);
            playNext();
          }}
        />
      </div>
    );
  }

  return (
    <div style={fullscreen}>
      <img
        key={current.id}
        src={current.fileUrl}
        alt=""
        style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }}
        onError={() => {
          markFailed(current.fileUrl);
          playNext();
        }}
      />
    </div>
  );
}

const fullscreen: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  height: '100vh',
  width: '100vw',
  background: '#000',
  overflow: 'hidden',
};

function NeoFilmPlaceholder() {
  return (
    <div
      style={{
        ...fullscreen,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        background:
          'radial-gradient(1200px 600px at 50% 30%, rgba(230,57,70,0.15), transparent 60%), #0a0810',
        color: '#fff',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'clamp(2.5rem, 8vw, 5rem)', fontWeight: 800, letterSpacing: '-0.02em' }}>
        <span style={{ color: '#E63946' }}>NEO</span>FILM
      </h1>
      <p style={{ margin: 0, fontSize: '1.2rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>
        Coworking
      </p>
    </div>
  );
}
