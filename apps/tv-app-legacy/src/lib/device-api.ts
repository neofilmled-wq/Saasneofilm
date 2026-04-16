import { TV_CONFIG } from './constants';

/**
 * Rewrite media URLs so they are accessible from the Android emulator.
 * The API stores URLs like http://localhost:9000/... but the emulator
 * needs http://10.0.2.2:9000/... to reach the host machine.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  // Rewrite localhost URLs when running in Android emulator (hostname = 10.0.2.2)
  if (typeof window !== 'undefined' && window.location.hostname === '10.0.2.2') {
    return url.replace('//localhost:', '//10.0.2.2:').replace('//localhost/', '//10.0.2.2/');
  }
  return url;
}

class DeviceAuthError extends Error {
  constructor() {
    super('DEVICE_AUTH_FAILED');
    this.name = 'DeviceAuthError';
  }
}

async function deviceFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_device_token') : null;

  // 15s timeout prevents hanging requests from causing permanent black screen
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${TV_CONFIG.API_URL}${path}`, {
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
    throw new Error(err.message || `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();
  // NestJS TransformInterceptor wraps responses in { data, statusCode, timestamp }
  if (json && typeof json === 'object' && 'data' in json && 'statusCode' in json) {
    return json.data as T;
  }
  return json as T;
}

// ── Response types ────────────────────────

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

export interface TvPairResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  device: {
    id: string;
    serialNumber: string;
    screenId: string | null;
    screenName: string | null;
  };
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

export interface TokenRefreshResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface ScheduleEntry {
  slotIndex: number;
  campaignId: string;
  creativeId: string;
  durationMs: number;
  priority: number;
  tier: 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';
  validFrom: string;
  validUntil: string;
  triggerTypes: string[];
}

export interface CreativeManifest {
  creativeId: string;
  fileUrl: string;
  fileUrlMedium?: string;
  fileUrlLow?: string;
  fileHash: string;
  durationMs: number;
  width: number;
  height: number;
  mimeType: string;
  fileSizeBytes: number;
}

export interface ScheduleBundle {
  version: number;
  generatedAt: string;
  screenId: string;
  validFrom: string;
  validUntil: string;
  entries: ScheduleEntry[];
  houseAds: CreativeManifest[];
  creativeManifest: Record<string, CreativeManifest>;
}

// ── TV Smart Config types ─────────────────

export interface TvConfigResponse {
  screenId: string | null;
  enabledModules: string[];
  defaultTab: 'TNT' | 'STREAMING' | 'ACTIVITIES' | 'SETTINGS';
  partnerLogoUrl: string | null;
  welcomeMessage: string | null;
  tickerText: string | null;
}

export interface TvChannel {
  id: string;
  name: string;
  number: number;
  logoUrl: string | null;
  streamUrl: string | null;
  category: string;
  isActive: boolean;
}

export interface IptvChannel {
  id: string;
  name: string;
  logoUrl: string | null;
  group: string;
  streamUrl: string;
  country: string;
  isLive: boolean;
}

export interface StreamingService {
  id: string;
  name: string;
  logoUrl: string | null;
  launchUrl: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ActivityPlace {
  id: string;
  name: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  sortOrder: number;
  isSponsored?: boolean;
  sponsorBadge?: string | null;
}

// ── Ad delivery types ────────────────────

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

export interface TvMacroResponse {
  screenId: string | null;
  spotDuration15s: boolean;
  spotDuration30s: boolean;
  skipDelayMs: number;
  adRotationMs: number;
  splitRatio: number;
  adOnBoot: boolean;
  adOnTabChange: boolean;
  adOnAppOpen: boolean;
  adOnCatalogOpen: boolean;
  activitiesSplit: boolean;
  activitiesAdNoSkip: boolean;
  maxAdsPerHour: number;
  maxInterstitialsPerSession: number;
}

export interface CatalogueListing {
  id: string;
  title: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  ctaUrl: string | null;
  promoCode: string | null;
  phone: string | null;
  address: string | null;
  keywords: string[];
}

export interface TvBootstrapResponse {
  config: TvConfigResponse;
  channels: TvChannel[];
  streamingServices: StreamingService[];
  activities: ActivityPlace[];
  catalogue: CatalogueListing[];
  macros: TvMacroResponse;
  ads: TvAdItem[];
}

// ── API methods ───────────────────────────

export const deviceApi = {
  /** TV self-registration: device gets a PIN + QR payload */
  register: (deviceId: string, serialNumber?: string, androidId?: string) =>
    deviceFetch<TvRegisterResponse>('/tv/register', {
      method: 'POST',
      body: JSON.stringify({ deviceId, serialNumber, androidId }),
    }),

  /** Reconnect by Android hardware ID — returns JWT if device was previously paired */
  reconnect: (androidId: string) =>
    deviceFetch<TvPairResponse>('/tv/reconnect', {
      method: 'POST',
      body: JSON.stringify({ androidId }),
    }),

  /** Pair device by PIN (can be called by admin or device) */
  pair: (pin: string, screenId?: string) =>
    deviceFetch<TvPairResponse>('/tv/pair', {
      method: 'POST',
      body: JSON.stringify({ pin, screenId }),
    }),

  /** Poll pairing status (TV calls this while showing PIN) */
  checkStatus: (deviceId: string) =>
    deviceFetch<TvStatusResponse>(`/tv/status?deviceId=${deviceId}`),

  /** Validate device JWT — returns device info if still paired */
  me: () => deviceFetch<TvMeResponse>('/tv/me'),

  /** Reset device to PROVISIONING so a new PIN is generated on next register */
  reset: (deviceId: string) =>
    deviceFetch<{ reset: boolean }>('/tv/reset', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    }),

  /** Legacy: authenticate with pre-created provisioning token */
  authenticate: (provisioningToken: string, deviceFingerprint?: string) =>
    deviceFetch<TvPairResponse>('/auth/device', {
      method: 'POST',
      body: JSON.stringify({ provisioningToken, deviceFingerprint }),
    }),

  /** Refresh JWT token */
  refreshToken: () =>
    deviceFetch<TokenRefreshResponse>('/auth/device/refresh', { method: 'POST' }),

  /** REST heartbeat */
  heartbeat: () =>
    deviceFetch<{ status: string; timestamp: string }>('/auth/device/heartbeat', {
      method: 'POST',
    }),

  /** Fetch schedule for a device */
  getSchedule: (deviceId: string, sinceVersion?: number) =>
    deviceFetch<ScheduleBundle>(
      `/diffusion/schedule?deviceId=${deviceId}${sinceVersion ? `&since=${sinceVersion}` : ''}`,
    ),

  // ── TV Smart Config ─────────────────────

  /** Get TV configuration for the device's screen */
  getTvConfig: () => deviceFetch<TvConfigResponse>('/tv/config'),

  /** Get TNT/IPTV channel list */
  getChannels: () => deviceFetch<TvChannel[]>('/tv/channels'),

  /** Get streaming services */
  getStreaming: () => deviceFetch<StreamingService[]>('/tv/streaming'),

  /** Get activities for the device's org */
  getActivities: () => deviceFetch<ActivityPlace[]>('/tv/activities'),

  /** Get active advertiser catalogue listings targeting this screen */
  getCatalogue: () => deviceFetch<CatalogueListing[]>('/tv/catalogue'),

  /** Get live IPTV channels from M3U playlist (cached backend) */
  getIptvChannels: (options?: { q?: string; group?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.group) params.set('group', options.group);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return deviceFetch<IptvChannel[]>(`/tv/iptv/channels${qs ? `?${qs}` : ''}`);
  },

  // ── Ad delivery ────────────────────────

  /** Get targeted ads for a trigger context */
  getAds: (trigger: string, maxAds?: number) => {
    const params = new URLSearchParams({ trigger });
    if (maxAds) params.set('maxAds', String(maxAds));
    return deviceFetch<TvAdsResponse>(`/tv/ads?${params}`);
  },

  /** Get TV macros for this device's screen */
  getMacros: () => deviceFetch<TvMacroResponse>('/tv/macros'),

  /** Get bootstrap data (all TV data in one call) */
  getBootstrap: () => deviceFetch<TvBootstrapResponse>('/tv/bootstrap'),

  /** Register a click on a catalogue listing */
  registerCatalogueClick: (listingId: string) =>
    deviceFetch<{ id: string; clickCount: number }>(`/advertiser/catalogue/${listingId}/click`, {
      method: 'POST',
    }),

  /** Report an ad impression (diffusion proof batch format) */
  reportImpression: (data: {
    deviceId: string;
    batchId: string;
    proofs: Array<{
      proofId: string;
      screenId: string;
      campaignId: string;
      creativeId: string;
      startTime: string;
      endTime: string;
      durationMs: number;
      triggerContext: string;
      appVersion: string;
      mediaHash: string;
      signature: string;
    }>;
  }) =>
    deviceFetch<{ batchId: string; accepted: number; rejected: number }>('/diffusion/log', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export { DeviceAuthError };
