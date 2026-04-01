// Use relative URL for API so it goes through the Next.js rewrite proxy.
// This avoids firewall issues when running in the Android emulator.
// The proxy in next.config.ts rewrites /api/v1/* → http://localhost:3001/api/v1/*
function getApiUrl() {
  if (typeof window !== 'undefined') {
    // Client-side: use relative URL (proxied by Next.js rewrite)
    return '/api/v1';
  }
  // Server-side: call API directly
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
}

function getWsUrl() {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    // Production (HTTPS): WebSocket must also use HTTPS (wss://) to avoid mixed content.
    // NPM reverse proxy routes /socket.io → api:3001 with WebSocket support.
    if (protocol === 'https:') {
      return `https://${hostname}`;
    }
    // Local dev (HTTP): connect directly to API on port 3001
    return `http://${hostname}:3001`;
  }
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
