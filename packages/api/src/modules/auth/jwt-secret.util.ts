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
      throw new Error(
        'JWT_SECRET is missing or uses the insecure default in production. ' +
          'Set a strong (32+ char) JWT_SECRET before starting the API.',
      );
    }
    return DEV_FALLBACK_SECRET;
  }
  return secret;
}
