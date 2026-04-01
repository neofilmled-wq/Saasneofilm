/**
 * ad-layout-engine.ts
 *
 * Calculates optimal dimensions and display strategy for ad creatives inside
 * a given zone on a TV screen.
 *
 * Entry points:
 *   computeAdLayout(creative, zone, screen) → AdLayout
 *   detectScreenMetrics()                   → ScreenMetrics   (browser only)
 *   getZoneDimensions(context, screen)      → Zone
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Creative {
  width?: number;
  height?: number;
  type: 'VIDEO' | 'IMAGE' | 'HTML';
  durationMs?: number;
}

export type ZoneContext =
  | 'HOME_SPLIT'
  | 'TV_SPLIT'
  | 'CATALOGUE_SPLIT'
  | 'FULLSCREEN'
  | 'INTERSTITIAL';

export interface Zone {
  width: number;
  height: number;
  context: ZoneContext;
}

export interface ScreenMetrics {
  width: number;
  height: number;
  pixelRatio: number;
  resolution: '720p' | '1080p' | '4K' | 'unknown';
}

export interface AdLayout {
  width: number;
  height: number;
  objectFit: 'contain' | 'cover' | 'fill';
  alignItems: 'center' | 'flex-start' | 'flex-end';
  justifyContent: 'center' | 'flex-start' | 'flex-end';
  letterbox: boolean;
  scale: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Classify a pixel height into a broadcast resolution label.
 * We use the physical pixel height (after multiplying by pixelRatio).
 */
function classifyResolution(
  physicalHeight: number,
): ScreenMetrics['resolution'] {
  if (physicalHeight >= 2160) return '4K';
  if (physicalHeight >= 1080) return '1080p';
  if (physicalHeight >= 720) return '720p';
  return 'unknown';
}

/**
 * Returns the aspect ratio of a rectangle (width / height).
 * Falls back to 1 if height is 0 to avoid division-by-zero.
 */
function aspectRatio(width: number, height: number): number {
  return height === 0 ? 1 : width / height;
}

/**
 * True when two ratios differ by less than `threshold` (relative).
 *
 * @example
 *   ratioClose(16/9, 1.78, 0.05) → true  (< 5 % relative difference)
 */
function ratioClose(a: number, b: number, threshold = 0.15): boolean {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return true;
  return Math.abs(a - b) / max < threshold;
}

// ---------------------------------------------------------------------------
// Zone dimension presets (split fractions of the physical screen)
// ---------------------------------------------------------------------------

/**
 * Ad column ratios for split-screen layouts.
 * These match the `adFlex / (mainFlex + adFlex)` fractions in `use-adaptive-layout`.
 */
const SPLIT_AD_FRACTION = {
  horizontal: 3 / 10, // adFlex=3, mainFlex=7 → 30 % of width
  vertical: 25 / 100, // adFlex=25%, mainFlex=75% → 25 % of height
} as const;

/**
 * Returns pixel dimensions for a named zone context given the screen metrics.
 *
 * For split-screen zones the layout direction follows the same breakpoint used
 * in `use-adaptive-layout` (aspectRatio >= 1.6 → horizontal row).
 */
export function getZoneDimensions(
  context: ZoneContext,
  screen: ScreenMetrics,
): Zone {
  const { width, height } = screen;
  const screenAr = aspectRatio(width, height);
  const isWide = screenAr >= 1.6;

  switch (context) {
    case 'HOME_SPLIT':
    case 'TV_SPLIT':
    case 'CATALOGUE_SPLIT': {
      if (isWide) {
        // Horizontal layout: ad column on the right
        const adWidth = Math.round(width * SPLIT_AD_FRACTION.horizontal);
        return { width: adWidth, height, context };
      } else {
        // Vertical layout: ad row at the bottom
        const adHeight = Math.round(height * SPLIT_AD_FRACTION.vertical);
        return { width, height: adHeight, context };
      }
    }

    case 'FULLSCREEN':
    case 'INTERSTITIAL':
      return { width, height, context };
  }
}

// ---------------------------------------------------------------------------
// Core layout computation
// ---------------------------------------------------------------------------

/**
 * computeAdLayout — computes the optimal layout for displaying `creative`
 * inside `zone` on `screen`.
 *
 * Strategy selection (in priority order):
 *
 * 1. HTML creatives always use `fill` — the HTML document manages its own layout.
 * 2. FULLSCREEN / INTERSTITIAL with ratio match < 15% → `cover` (immersive).
 * 3. FULLSCREEN / INTERSTITIAL with ratio mismatch ≥ 15% → `contain`.
 * 4. Split-screen zones (HOME_SPLIT, TV_SPLIT, CATALOGUE_SPLIT) → always `contain`
 *    to avoid clipping.
 * 5. Letterbox flag is set when the creative and zone have perpendicular orientations
 *    (e.g. 16:9 in a 9:16 zone).
 * 6. For 4K screens, `scale` = pixelRatio (retina-aware).
 */
export function computeAdLayout(
  creative: Creative,
  zone: Zone,
  screen: ScreenMetrics,
): AdLayout {
  // Effective creative dimensions — fall back to zone dimensions when unknown.
  const creativeW = creative.width ?? zone.width;
  const creativeH = creative.height ?? zone.height;

  const creativeAr = aspectRatio(creativeW, creativeH);
  const zoneAr = aspectRatio(zone.width, zone.height);

  // Scale factor: retina-aware for 4K; 1 otherwise.
  const scale = screen.resolution === '4K' ? screen.pixelRatio : 1;

  // ── 1. HTML: always fill ────────────────────────────────────────────────
  if (creative.type === 'HTML') {
    return {
      width: zone.width,
      height: zone.height,
      objectFit: 'fill',
      alignItems: 'center',
      justifyContent: 'center',
      letterbox: false,
      scale,
    };
  }

  // ── 2 & 3. Fullscreen / Interstitial ────────────────────────────────────
  const isFullscreen =
    zone.context === 'FULLSCREEN' || zone.context === 'INTERSTITIAL';

  if (isFullscreen) {
    const ratioMatch = ratioClose(creativeAr, zoneAr, 0.15);
    const objectFit: AdLayout['objectFit'] = ratioMatch ? 'cover' : 'contain';

    // Letterbox is relevant only for `contain` with perpendicular orientations.
    const creativeIsLandscape = creativeAr >= 1;
    const zoneIsLandscape = zoneAr >= 1;
    const letterbox = objectFit === 'contain' && creativeIsLandscape !== zoneIsLandscape;

    return {
      width: zone.width,
      height: zone.height,
      objectFit,
      alignItems: 'center',
      justifyContent: 'center',
      letterbox,
      scale,
    };
  }

  // ── 4. Split-screen zones: always contain ───────────────────────────────
  // Compute the largest contained dimensions while preserving creative ratio.
  const { containedWidth, containedHeight } = scaleToContain(
    creativeW,
    creativeH,
    zone.width,
    zone.height,
  );

  // Detect perpendicular orientations for letterbox flag.
  const creativeIsLandscape = creativeAr >= 1;
  const zoneIsLandscape = zoneAr >= 1;
  const letterbox = creativeIsLandscape !== zoneIsLandscape;

  return {
    width: containedWidth,
    height: containedHeight,
    objectFit: 'contain',
    alignItems: 'center',
    justifyContent: 'center',
    letterbox,
    scale,
  };
}

// ---------------------------------------------------------------------------
// Geometry utilities
// ---------------------------------------------------------------------------

/**
 * Returns the largest dimensions that fit `srcW × srcH` inside `maxW × maxH`
 * while preserving aspect ratio (letterbox / pillarbox "contain" behaviour).
 */
function scaleToContain(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { containedWidth: number; containedHeight: number } {
  if (srcW === 0 || srcH === 0) {
    return { containedWidth: maxW, containedHeight: maxH };
  }

  const widthScale = maxW / srcW;
  const heightScale = maxH / srcH;
  const fitScale = Math.min(widthScale, heightScale);

  return {
    containedWidth: Math.round(srcW * fitScale),
    containedHeight: Math.round(srcH * fitScale),
  };
}

// ---------------------------------------------------------------------------
// Screen metrics detection (browser only)
// ---------------------------------------------------------------------------

/**
 * detectScreenMetrics — reads `window.screen` and `devicePixelRatio` to build
 * a `ScreenMetrics` object.
 *
 * Must be called in a browser context (not during SSR).
 * For SSR-safe usage guard with `typeof window !== 'undefined'`.
 */
export function detectScreenMetrics(): ScreenMetrics {
  if (typeof window === 'undefined') {
    // SSR fallback: assume 1080p.
    return {
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      resolution: '1080p',
    };
  }

  const width = window.screen.width;
  const height = window.screen.height;
  const pixelRatio = window.devicePixelRatio ?? 1;

  // Use physical pixel height for resolution classification.
  const physicalHeight = Math.round(height * pixelRatio);
  const resolution = classifyResolution(physicalHeight);

  return { width, height, pixelRatio, resolution };
}
