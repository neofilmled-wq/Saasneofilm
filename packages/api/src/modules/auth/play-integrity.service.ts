import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, createSign } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Play Integrity verification — server-side proof that the app runs on a genuine,
 * non-emulated device. Unlike the client-declared `deviceClass`, an integrity
 * token is signed by Google and cannot be forged by a browser/VM/curl.
 *
 * Fully INERT unless PLAY_INTEGRITY_ENABLED=true AND a service-account key is
 * configured (GOOGLE_APPLICATION_CREDENTIALS). While disabled, `enabled` is
 * false and registerDevice keeps its current behaviour.
 *
 * NOTE: not yet validated end-to-end — needs a real Google Cloud project +
 * service account + the Play Integrity API enabled (see docs/PLAY-INTEGRITY.md).
 */
@Injectable()
export class PlayIntegrityService {
  private readonly logger = new Logger(PlayIntegrityService.name);
  /** nonce -> expiry (ms). In-memory, short-lived, anti-replay. */
  private readonly nonces = new Map<string, number>();
  private readonly NONCE_TTL_MS = 5 * 60_000;

  get enabled(): boolean {
    return process.env.PLAY_INTEGRITY_ENABLED === 'true';
  }

  /** Issue a one-time nonce the APK must embed in its integrity request. */
  issueNonce(): string {
    this.pruneNonces();
    const nonce = randomBytes(24).toString('base64url');
    this.nonces.set(nonce, Date.now() + this.NONCE_TTL_MS);
    return nonce;
  }

  private pruneNonces() {
    const now = Date.now();
    for (const [n, exp] of this.nonces) if (exp <= now) this.nonces.delete(n);
  }

  private consumeNonce(nonce: string): boolean {
    const exp = this.nonces.get(nonce);
    if (!exp || exp <= Date.now()) return false;
    this.nonces.delete(nonce); // one-time use
    return true;
  }

  /**
   * Verify an integrity token. Returns { ok } when the device meets Google's
   * device-integrity verdict and the nonce matches. On any error while enabled,
   * returns ok:false with a reason (fail-closed).
   */
  async verify(
    integrityToken: string,
    nonce: string,
    packageName: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!integrityToken || !nonce) return { ok: false, reason: 'MISSING_TOKEN_OR_NONCE' };
    if (!this.consumeNonce(nonce)) return { ok: false, reason: 'BAD_OR_EXPIRED_NONCE' };

    try {
      const accessToken = await this.getGoogleAccessToken();
      const res = await fetch(
        `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ integrity_token: integrityToken }),
        },
      );
      if (!res.ok) return { ok: false, reason: `GOOGLE_HTTP_${res.status}` };

      const data: any = await res.json();
      const payload = data?.tokenPayloadExternal ?? {};
      const returnedNonce: string | undefined = payload?.requestDetails?.nonce;
      if (returnedNonce !== nonce) return { ok: false, reason: 'NONCE_MISMATCH' };

      const verdicts: string[] = payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
      if (!verdicts.includes('MEETS_DEVICE_INTEGRITY')) {
        return { ok: false, reason: `WEAK_VERDICT:${verdicts.join(',') || 'none'}` };
      }
      return { ok: true };
    } catch (e) {
      this.logger.error(`Play Integrity verify failed: ${(e as Error)?.message}`);
      return { ok: false, reason: 'VERIFY_ERROR' };
    }
  }

  /** Mint a Google OAuth2 access token from the service-account key (RS256 JWT). */
  private async getGoogleAccessToken(): Promise<string> {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
    const sa = JSON.parse(readFileSync(keyPath, 'utf8')) as {
      client_email: string;
      private_key: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const header = b64({ alg: 'RS256', typ: 'JWT' });
    const claim = b64({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/playintegrity',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const sig = signer.sign(sa.private_key).toString('base64url');
    const assertion = `${header}.${claim}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}`);
    const json: any = await res.json();
    if (!json.access_token) throw new Error('no access_token');
    return json.access_token as string;
  }
}
