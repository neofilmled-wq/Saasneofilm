import { CW_CONFIG } from './constants';

/** Rewrite localhost media URLs so they resolve from an Android emulator. */
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  if (typeof window !== 'undefined' && window.location.hostname === '10.0.2.2') {
    return url.replace('//localhost:', '//10.0.2.2:').replace('//localhost/', '//10.0.2.2/');
  }
  return url;
}

export class DeviceAuthError extends Error {
  constructor() {
    super('DEVICE_AUTH_FAILED');
    this.name = 'DeviceAuthError';
  }
}

async function deviceFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_device_token') : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${CW_CONFIG.API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Network timeout: ${path} (15s)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 || res.status === 403) {
    throw new DeviceAuthError();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  // NestJS TransformInterceptor wraps responses in { data, statusCode, timestamp }
  if (json && typeof json === 'object' && 'data' in json && 'statusCode' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

// ── Response types (pairing subset) ────────────────────────

export interface TvRegisterResponse {
  deviceId: string;
  pin: string;
  expiresAt: string;
  pairingUrl: string;
  qrPayload: string;
  alreadyPaired?: boolean;
  screenId?: string;
  screenName?: string | null;
}

export interface TvStatusResponse {
  status: 'WAITING' | 'PAIRED';
  deviceId: string;
  screenId?: string;
  screenName?: string;
  accessToken?: string;
  expiresIn?: number;
}

export interface TvMeResponse {
  paired: boolean;
  deviceId: string;
  serialNumber: string;
  screenId: string | null;
  screenName: string | null;
  partnerOrgId: string | null;
  status: string;
  pairedAt: string | null;
}

export interface TvAdItem {
  campaignId: string;
  creativeId: string;
  fileUrl: string;
  fileHash: string;
  durationMs: number;
  mimeType: string;
  width: number;
  height: number;
  tier: 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';
  canSkipAfterMs: number;
  advertiserName: string;
}

export interface TvAdsResponse {
  ads: TvAdItem[];
  fallbackHouseAds: TvAdItem[];
}

// ── Endpoints (shared with the legacy backend — no server change needed) ────

export const deviceApi = {
  /** Register this box → returns a PIN + deviceId (or alreadyPaired). */
  register: (deviceId: string, serialNumber?: string, androidId?: string) =>
    deviceFetch<TvRegisterResponse>('/tv/register', {
      method: 'POST',
      body: JSON.stringify({ deviceId, serialNumber, androidId }),
    }),

  /** Poll pairing status while showing the PIN. */
  checkStatus: (deviceId: string) =>
    deviceFetch<TvStatusResponse>(`/tv/status?deviceId=${encodeURIComponent(deviceId)}`),

  /** Validate the stored device JWT — returns device info if still paired. */
  me: () => deviceFetch<TvMeResponse>('/tv/me'),

  /** Ads for this device's screen: targeted campaigns + house-ad fallback. */
  getAds: (trigger: string, maxAds?: number) => {
    const params = new URLSearchParams({ trigger });
    if (maxAds) params.set('maxAds', String(maxAds));
    return deviceFetch<TvAdsResponse>(`/tv/ads?${params.toString()}`);
  },
};
