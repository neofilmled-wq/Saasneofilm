import { Controller, Get, Post, Body, Query, Res, Logger, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { OAuthService } from './oauth.service';
import { Public } from '../../common/decorators';

interface PendingLogin {
  accessToken: string;
  refreshToken: string;
  isNew: boolean;
  exp: number;
}

@ApiTags('OAuth')
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  /**
   * One-time codes so OAuth tokens NEVER travel in a redirect URL (audit M1).
   * The callback redirects with ?code=…; the SPA exchanges it via POST for the
   * tokens (in the response body). Short-lived + single-use, in memory.
   */
  private readonly pendingLogins = new Map<string, PendingLogin>();
  private readonly CODE_TTL_MS = 60_000;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

  private issueLoginCode(accessToken: string, refreshToken: string, isNew: boolean): string {
    const now = Date.now();
    for (const [c, v] of this.pendingLogins) if (v.exp <= now) this.pendingLogins.delete(c);
    const code = randomBytes(24).toString('base64url');
    this.pendingLogins.set(code, { accessToken, refreshToken, isNew, exp: now + this.CODE_TTL_MS });
    return code;
  }

  private consumeLoginCode(code: string): PendingLogin | null {
    const entry = this.pendingLogins.get(code);
    if (!entry) return null;
    this.pendingLogins.delete(code); // one-time use
    if (entry.exp <= Date.now()) return null;
    return entry;
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth(@Query('interfaceType') interfaceType: string, @Res() res: Response) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return res.status(503).json({ message: 'Google OAuth not configured' });
    }
    const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/v1/auth/oauth/google/callback');
    const state = Buffer.from(JSON.stringify({ interfaceType: interfaceType || 'ADVERTISER' })).toString('base64');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent('openid email profile')}&` +
      `state=${state}&` +
      `access_type=offline&` +
      `prompt=consent`;
    return res.redirect(url);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const stateData = JSON.parse(Buffer.from(state || '', 'base64').toString());
      const interfaceType = stateData.interfaceType === 'PARTNER' ? 'PARTNER' : 'ADVERTISER';

      // Exchange code for tokens
      const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
      const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/v1/auth/oauth/google/callback');

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenData.error_description || 'Token exchange failed');
      }

      // Get user info
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();

      const result = await this.oauthService.handleOAuthLogin(
        {
          email: userInfo.email,
          firstName: userInfo.given_name || userInfo.name?.split(' ')[0] || 'User',
          lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
          providerAccountId: userInfo.id,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        },
        'google',
        interfaceType as 'PARTNER' | 'ADVERTISER',
      );

      // Redirect to frontend
      const frontendUrl = interfaceType === 'PARTNER'
        ? this.configService.get<string>('PARTNER_APP_URL', 'http://localhost:3002')
        : this.configService.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
      // No tokens in the URL: hand out a one-time code the SPA exchanges via POST.
      const loginCode = this.issueLoginCode(result.tokens.accessToken, result.tokens.refreshToken, result.isNew);
      return res.redirect(`${frontendUrl}/callback?code=${loginCode}`);
    } catch (err: any) {
      this.logger.error(`Google OAuth callback error: ${err.message}`);
      const fallbackUrl = this.configService.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
      return res.redirect(`${fallbackUrl}/login?error=oauth_failed`);
    }
  }

  /**
   * Exchange the one-time login code (from the ?code= redirect) for the JWTs.
   * Single-use, short-lived — so tokens are delivered in a POST body, never in
   * a URL / log / Referer. (audit M1)
   */
  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a one-time OAuth login code for JWTs' })
  async exchange(@Body('code') code: string) {
    if (!code) throw new BadRequestException('code is required');
    const entry = this.consumeLoginCode(code);
    if (!entry) throw new BadRequestException('Invalid or expired code');
    return {
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
      isNew: entry.isNew,
    };
  }
}
