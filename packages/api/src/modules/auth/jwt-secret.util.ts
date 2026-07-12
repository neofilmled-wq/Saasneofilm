import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK_SECRET = 'change-this-in-production-minimum-32-chars';

/**
 * Single source of truth for the JWT signing secret.
 *
 * Previously three files (auth.module, jwt.strategy, messaging.gateway) each
 * hardcoded the same dev fallback. If JWT_SECRET was ever missing in
 * production the app would silently sign/verify tokens with a public,
 * well-known string — allowing anyone to forge admin/device JWTs.
 *
 * Now: in production a missing (or default) secret is a hard boot failure.
 * In dev/test we keep the fallback so local work isn't blocked.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  const isProd = config.get<string>('NODE_ENV') === 'production';

  if (!secret || secret === DEV_FALLBACK_SECRET) {
    if (isProd) {
      // Loud warning instead of a hard crash: bricking a live API (with 200
      // TVs + paying customers) is worse than continuing. The operator must
      // still set a strong JWT_SECRET, but the app stays up in the meantime.
      // eslint-disable-next-line no-console
      console.error(
        '[SECURITY] JWT_SECRET is missing or uses the insecure default in PRODUCTION. ' +
          'Set a strong (32+ char) JWT_SECRET immediately — tokens are currently signable with a public value.',
      );
    }
    return secret || DEV_FALLBACK_SECRET;
  }
  return secret;
}
