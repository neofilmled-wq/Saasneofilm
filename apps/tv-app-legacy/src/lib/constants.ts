// Use NEXT_PUBLIC_API_URL on both client and server to call the API directly
// (e.g. https://neofilmapi.alkaya.fr/api/v1) instead of relying on the
// hostname the TV app is served from.
function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
}

function getWsUrl() {
  // Always use the configured NEXT_PUBLIC_WS_URL (e.g. https://neofilmapi.alkaya.fr)
  // so the WebSocket targets the same API host as the REST calls.
  return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
}

export const TV_CONFIG = {
  get API_URL(): string { return getApiUrl(); },
  get WS_URL(): string { return getWsUrl(); },
  HEARTBEAT_INTERVAL_MS: 30_000 as const,
  PAIRING_POLL_INTERVAL_MS: 3_000 as const,
  SCHEDULE_REFRESH_INTERVAL_MS: 300_000 as const,
  TOKEN_REFRESH_BUFFER_MS: 300_000 as const,
  RECONNECT_BASE_MS: 1_000 as const,
  RECONNECT_MAX_MS: 60_000 as const,
  AD_ROTATION_INTERVAL_MS: 15_000 as const,
  PROVISIONING_TOKEN_TTL_MS: 600_000 as const,
  MAIN_ZONE_WIDTH_PERCENT: 70 as const,
  AD_ZONE_WIDTH_PERCENT: 30 as const,
  TICKER_HEIGHT_PX: 48 as const,
};
