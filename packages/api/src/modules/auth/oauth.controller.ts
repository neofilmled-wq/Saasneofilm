import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { OAuthService } from './oauth.service';
import { Public } from '../../common/decorators';

@ApiTags('OAuth')
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

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
      const redirectUrl = `${frontendUrl}/callback?token=${result.tokens.accessToken}&refresh=${result.tokens.refreshToken}&isNew=${result.isNew}`;
      return res.redirect(redirectUrl);
    } catch (err: any) {
      this.logger.error(`Google OAuth callback error: ${err.message}`);
      const fallbackUrl = this.configService.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
      return res.redirect(`${fallbackUrl}/login?error=oauth_failed`);
    }
  }
}
