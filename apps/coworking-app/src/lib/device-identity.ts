const FINGERPRINT_KEY = 'neofilm_device_fingerprint';

declare global {
  interface Window {
    NeoFilmAndroid?: {
      getAndroidId?: () => string;
      isAndroidTv?: () => boolean;
      openSystemSettings?: () => void;
      setDeviceCredentials?: (token: string, apiUrl: string, deviceId: string, screenId: string) => void;
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
