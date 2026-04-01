'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TV_CONFIG } from '@/lib/constants';
import type { CreativeManifest, TvAdItem } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';

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
 * Ad rotation zone — fills its flex container (30% horizontal, 25% vertical).
 * All media uses object-fit: cover for center-crop without stretch.
 *
 * Prioritizes targetedAds over houseAds. Falls back to NeoFilm placeholder when empty.
 */
export function AdZone({ houseAds, targetedAds = [], rotationMs, onImpression }: AdZoneProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef(new Date());
  const rotationInterval = rotationMs ?? TV_CONFIG.AD_ROTATION_INTERVAL_MS;

  // Build unified ad pool: targeted first, then house
  const adPool: DisplayAd[] = [
    ...targetedAds.map((ad) => ({
      id: ad.creativeId,
      fileUrl: resolveMediaUrl(ad.fileUrl),
      mimeType: ad.mimeType,
      isTargeted: true,
      source: ad,
    })),
    ...houseAds.map((ad) => ({
      id: ad.creativeId,
      fileUrl: resolveMediaUrl(ad.fileUrl),
      mimeType: ad.mimeType,
      isTargeted: false,
      source: ad,
    })),
  ];

  const currentAd = adPool[currentIndex % adPool.length] ?? null;

  const playNext = useCallback(() => {
    // Report impression for targeted ads
    if (currentAd?.isTargeted && onImpression) {
      onImpression(currentAd.source as TvAdItem, startTimeRef.current, new Date(), false);
    }
    startTimeRef.current = new Date();
    setCurrentIndex((i) => (adPool.length > 0 ? (i + 1) % adPool.length : 0));
  }, [adPool.length, currentAd, onImpression]);

  // Auto-rotate for images
  useEffect(() => {
    if (!currentAd) return;
    if (currentAd.mimeType.startsWith('image/')) {
      const timer = setTimeout(playNext, rotationInterval);
      return () => clearTimeout(timer);
    }
  }, [currentAd, playNext, rotationInterval]);

  // Reset index when ad pool changes
  useEffect(() => {
    setCurrentIndex(0);
    startTimeRef.current = new Date();
  }, [targetedAds.length, houseAds.length]);

  if (!currentAd) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-card">
        <div className="text-center">
          <h3 className="font-bold text-primary" style={{ fontSize: '1.5em' }}>NEO</h3>
          <h3 className="font-bold" style={{ fontSize: '1.5em' }}>FILM</h3>
          <p className="mt-[0.5em] text-muted-foreground" style={{ fontSize: '0.875em' }}>
            Espace publicitaire
          </p>
        </div>
      </div>
    );
  }

  if (currentAd.mimeType.startsWith('video/')) {
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
          onEnded={playNext}
          onError={(e) => {
            console.warn(`[AdZone] Video error: ${currentAd.id}`, (e.target as HTMLVideoElement).error);
            playNext();
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
          playNext();
        }}
      />
    </div>
  );
}
