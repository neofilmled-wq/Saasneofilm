const FINGERPRINT_KEY = 'neofilm_device_fingerprint';

declare global {
  interface Window {
    NeoFilmAndroid?: {
      getAndroidId?: () => string;
      isAndroidTv?: () => boolean;
      /** JSON string with device integrity signals, e.g. {"isEmulator":true}.
       *  Present only in APK builds that ship the emulator check. */
      getDeviceIntegrity?: () => string;
      openSystemSettings?: () => void;
      setDeviceCredentials?: (token: string, apiUrl: string, deviceId: string, screenId: string) => void;
      /** JSON array of launchable apps: [{ packageName, label, icon(base64 PNG) }]. */
      getInstalledApps?: () => string;
      /** Launch an installed app by package name. Returns true on success. */
      launchApp?: (packageName: string) => boolean;
    };
  }
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older WebViews (Android TV) that lack crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable per-device id: real ANDROID_ID via the native bridge when available,
 *  otherwise a persisted random UUID (dev/browser). */
export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';

  try {
    const androidId = window.NeoFilmAndroid?.getAndroidId?.();
    if (androidId) {
      localStorage.setItem(FINGERPRINT_KEY, androidId);
      return androidId;
    }
  } catch {
    // Bridge not available (running in browser, not WebView)
  }

  let fingerprint = localStorage.getItem(FINGERPRINT_KEY);
  if (!fingerprint) {
    fingerprint = generateUUID();
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  }
  return fingerprint;
}

export function getAndroidId(): string | undefined {
  try {
    return window.NeoFilmAndroid?.getAndroidId?.() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Classify the client so the backend can hide non-display devices (browsers,
 * VMs) from live screen surfaces:
 *   - no native bridge  → BROWSER (the app opened in a plain web browser)
 *   - bridge + emulator → EMULATOR (APK running in an Android VM/emulator)
 *   - bridge + real box → HARDWARE
 * An APK without the integrity method (older build) reports HARDWARE, so the
 * existing fleet is never wrongly hidden.
 */
export function getDeviceClass(): 'HARDWARE' | 'EMULATOR' | 'BROWSER' {
  if (typeof window === 'undefined') return 'BROWSER';
  const bridge = window.NeoFilmAndroid;
  if (!bridge || typeof bridge.getAndroidId !== 'function') return 'BROWSER';
  try {
    const raw = bridge.getDeviceIntegrity?.();
    if (raw) {
      const info = JSON.parse(raw) as { isEmulator?: boolean };
      if (info?.isEmulator) return 'EMULATOR';
    }
  } catch {
    // Malformed/absent integrity payload — fall through to HARDWARE.
  }
  return 'HARDWARE';
}
