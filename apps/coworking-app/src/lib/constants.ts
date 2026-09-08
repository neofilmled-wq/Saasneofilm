// Same API host as the rest of the platform (e.g. https://neofilmapi.alkaya.fr/api/v1).
function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
}

function getWsUrl() {
  return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
}

export const CW_CONFIG = {
  get API_URL(): string {
    return getApiUrl();
  },
  get WS_URL(): string {
    return getWsUrl();
  },
  PAIRING_POLL_INTERVAL_MS: 3_000 as const,
  HEARTBEAT_INTERVAL_MS: 30_000 as const,
  /** Reported with every diffusion proof. Keep in sync with android versionName. */
  APP_VERSION: '0.1.1' as const,
  /** Batch window for diffusion proofs — well under the 10 req/min throttle. */
  DIFFUSION_FLUSH_INTERVAL_MS: 60_000 as const,
};
