const FINGERPRINT_KEY = 'neofilm_device_fingerprint';

declare global {
  interface Window {
    NeoFilmAndroid?: {
      getAndroidId?: () => string;
      isAndroidTv?: () => boolean;
      getInstalledApps?: () => string;
      launchApp?: (packageName: string) => boolean;
      openWebPage?: (url: string) => void;
      openWebPageFullscreen?: (url: string) => void;
      closeWebPage?: () => void;
      isSplitScreenActive?: () => boolean;
      openNativeHls?: (url: string) => void;
      closeNativeHls?: () => void;
      setAdsAvailable?: (count: number) => void;
      setAdsData?: (json: string) => void;
      setWebViewConnected?: (connected: boolean) => void;
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

export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';

  // Prefer the real ANDROID_ID from the native bridge (unique per device)
  try {
    const androidId = window.NeoFilmAndroid?.getAndroidId?.();
    if (androidId) {
      // Store it so it's consistent everywhere
      localStorage.setItem(FINGERPRINT_KEY, androidId);
      return androidId;
    }
  } catch {
    // Bridge not available (running in browser, not WebView)
  }

  // Fallback: random UUID for dev/browser
  let fingerprint = localStorage.getItem(FINGERPRINT_KEY);
  if (!fingerprint) {
    fingerprint = generateUUID();
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  }
  return fingerprint;
}
