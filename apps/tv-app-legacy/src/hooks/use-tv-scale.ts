'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * TV Responsive Scaling Engine
 *
 * Base design resolution: 1920×1080 (16:9)
 *
 * Scaling formula:
 *   scale = min(viewportWidth / 1920, viewportHeight / 1080)
 *
 * This produces a uniform scale factor that preserves aspect ratio:
 *   - 1280×720  → scale = min(0.667, 0.667) = 0.667
 *   - 1920×1080 → scale = min(1.000, 1.000) = 1.000
 *   - 2560×1440 → scale = min(1.333, 1.333) = 1.333
 *   - 3840×2160 → scale = min(2.000, 2.000) = 2.000
 *   - 2560×1080 (21:9) → scale = min(1.333, 1.000) = 1.000
 *
 * The scale is applied as a CSS custom property on <html>:
 *   --tv-scale: <number>
 *   font-size: calc(16px * var(--tv-scale))
 *
 * All rem-based sizing then scales proportionally.
 */

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const THROTTLE_MS = 200;

export interface TvScaleInfo {
  /** Current viewport width in CSS pixels */
  screenWidth: number;
  /** Current viewport height in CSS pixels */
  screenHeight: number;
  /** width / height */
  aspectRatio: number;
  /** Device pixel density */
  devicePixelRatio: number;
  /** Computed scale factor relative to 1920×1080 */
  scale: number;
  /** Whether the viewport is the base resolution or larger */
  isHD: boolean;
  /** Whether the viewport is 4K class (scale >= 1.8) */
  is4K: boolean;
}

function computeScale(): TvScaleInfo {
  const w = typeof window !== 'undefined' ? window.innerWidth : BASE_WIDTH;
  const h = typeof window !== 'undefined' ? window.innerHeight : BASE_HEIGHT;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const scale = Math.min(w / BASE_WIDTH, h / BASE_HEIGHT);

  return {
    screenWidth: w,
    screenHeight: h,
    aspectRatio: w / h,
    devicePixelRatio: dpr,
    scale,
    isHD: scale >= 0.95,
    is4K: scale >= 1.8,
  };
}

function applyScaleToDom(scale: number) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--tv-scale', scale.toFixed(4));
  root.style.setProperty('--tv-base-font', `${(16 * scale).toFixed(2)}px`);
}

export function useTvScale(): TvScaleInfo {
  const [info, setInfo] = useState<TvScaleInfo>(computeScale);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const recalculate = useCallback(() => {
    // Cancel any pending throttled call
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
    }

    // Throttle: wait THROTTLE_MS, then batch in a single rAF
    throttleRef.current = setTimeout(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const next = computeScale();
        applyScaleToDom(next.scale);
        setInfo(next);
        rafRef.current = null;
      });
    }, THROTTLE_MS);
  }, []);

  // Initial application + listeners
  useEffect(() => {
    // Apply immediately on mount
    const initial = computeScale();
    applyScaleToDom(initial.scale);
    setInfo(initial);

    // Resize (covers window resize, DevTools resize, WebView layout changes)
    window.addEventListener('resize', recalculate, { passive: true });

    // Orientation change (mobile/tablet, some Android TV sticks)
    window.addEventListener('orientationchange', recalculate, { passive: true });

    // Fullscreen change (entering/exiting fullscreen changes viewport)
    document.addEventListener('fullscreenchange', recalculate);

    // MediaQueryList for devicePixelRatio changes (zoom, display switch)
    const dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMql.addEventListener('change', recalculate);

    return () => {
      window.removeEventListener('resize', recalculate);
      window.removeEventListener('orientationchange', recalculate);
      document.removeEventListener('fullscreenchange', recalculate);
      dprMql.removeEventListener('change', recalculate);
      if (throttleRef.current) clearTimeout(throttleRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recalculate]);

  return info;
}
