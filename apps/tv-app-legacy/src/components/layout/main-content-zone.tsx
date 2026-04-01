'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduleEntry, CreativeManifest } from '@/lib/device-api';

interface MainContentZoneProps {
  entries: ScheduleEntry[];
  creativeManifest: Record<string, CreativeManifest>;
}

/**
 * Main content zone — fills its flex container (70% horizontal, 75% vertical).
 * Media uses object-fit: cover for center-crop.
 * Container uses absolute positioning to guarantee no overflow or stretch.
 */
export function MainContentZone({ entries, creativeManifest }: MainContentZoneProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentEntry = entries[currentIndex];
  const creative = currentEntry ? creativeManifest[currentEntry.creativeId] : null;

  const playNext = useCallback(() => {
    setCurrentIndex((i) => (entries.length > 0 ? (i + 1) % entries.length : 0));
  }, [entries.length]);

  useEffect(() => {
    if (!creative) return;
    if (creative.mimeType.startsWith('image/')) {
      const timer = setTimeout(playNext, currentEntry.durationMs || 10_000);
      return () => clearTimeout(timer);
    }
  }, [creative, currentEntry, playNext]);

  if (!creative) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-bold" style={{ fontSize: '1.875em' }}>
            <span className="text-primary">NEO</span>FILM
          </h2>
          <p className="mt-[0.5em] text-muted-foreground" style={{ fontSize: '1.125em' }}>
            En attente de contenu...
          </p>
        </div>
      </div>
    );
  }

  if (creative.mimeType.startsWith('video/')) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <video
          ref={videoRef}
          key={creative.creativeId}
          src={creative.fileUrl}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={playNext}
          onError={(e) => {
            console.warn(`[MainContentZone] Video error: ${creative.creativeId}`, (e.target as HTMLVideoElement).error);
            playNext();
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        key={creative.creativeId}
        src={creative.fileUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => {
          console.warn(`[MainContentZone] Image load failed: ${creative.creativeId} — ${creative.fileUrl}`);
          playNext();
        }}
      />
    </div>
  );
}
