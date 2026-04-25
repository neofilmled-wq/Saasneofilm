'use client';

import { useMemo } from 'react';
import type { TvScaleInfo } from './use-tv-scale';

/**
 * Adaptive Layout Engine for Split-Screen TV Display
 *
 * Standard (aspect ratio >= 1.6, e.g., 16:9 = 1.778):
 *   ┌──────────────────────┬──────────┐
 *   │   MAIN (flex: 7)     │ AD (3)   │
 *   │                      │          │
 *   └──────────────────────┴──────────┘
 *   flex-direction: row
 *
 * Narrow (aspect ratio < 1.6, e.g., 4:3 = 1.333):
 *   ┌────────────────────────────────┐
 *   │         MAIN (75%)             │
 *   ├────────────────────────────────┤
 *   │         ADS  (25%)             │
 *   └────────────────────────────────┘
 *   flex-direction: column
 *
 * Breakpoint: 1.6 (between 16:10=1.6 and 16:9=1.778)
 * Screens at exactly 16:10 use vertical, 16:9 and wider use horizontal.
 */

const ASPECT_RATIO_BREAKPOINT = 1.6;

export type LayoutOrientation = 'horizontal' | 'vertical';

export interface AdaptiveLayout {
  /** 'horizontal' for wide screens, 'vertical' for narrow */
  orientation: LayoutOrientation;
  /** CSS flex-direction value */
  flexDirection: 'row' | 'column';
  /** Flex grow value for main content zone */
  mainFlex: number;
  /** Flex grow value for ad zone */
  adFlex: number;
  /** Safe zone padding scaled to current resolution */
  safeZonePadding: string;
  /** Ticker height scaled to current resolution */
  tickerHeight: number;
  /** Whether the screen is ultra-wide (21:9+) */
  isUltraWide: boolean;
}

export function useAdaptiveLayout(scaleInfo: TvScaleInfo): AdaptiveLayout {
  return useMemo(() => {
    const { aspectRatio, scale } = scaleInfo;
    const isWide = aspectRatio >= ASPECT_RATIO_BREAKPOINT;
    const isUltraWide = aspectRatio >= 2.2;

    // Safe zone: 5% equivalent at base resolution, scaled
    // At 1920×1080: ~96px horizontal, ~54px vertical
    // Using vw/vh ensures it adapts to actual viewport
    const safeZonePadding = '2.5vh 2.5vw';

    // Ticker height: 48px at 1080p, scales with resolution
    const tickerHeight = Math.round(48 * scale);

    if (isWide) {
      return {
        orientation: 'horizontal' as const,
        flexDirection: 'row' as const,
        mainFlex: 50, // 50% content (cards / grid / list)
        adFlex: 50,   // 50% right zone (code promo on top + ad video at bottom)
        safeZonePadding,
        tickerHeight,
        isUltraWide,
      };
    }

    // Narrow / portrait: stack vertically
    return {
      orientation: 'vertical' as const,
      flexDirection: 'column' as const,
      mainFlex: 75, // 75% of height
      adFlex: 25,   // 25% of height
      safeZonePadding,
      tickerHeight,
      isUltraWide,
    };
  }, [scaleInfo]);
}
