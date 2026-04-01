import { Body, Controller, Post, Get, Query, Req, Res, UsePipes, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes';
import { loginSchema, registerSchema, refreshTokenSchema } from '@neofilm/shared';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() body: any, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.authService.register(body, ipAddress);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    schema: {
      properties: {
        email: { type: 'string', example: 'admin@neofilm.io' },
        password: { type: 'string', example: 'Password1' },
      },
    },
  })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: any, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(body.email, body.password, ipAddress, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  async refresh(@Body() body: any, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshTokens(body.refreshToken, ipAddress, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate current refresh token' })
  async logout(@CurrentUser() user: any, @Body() body: any, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.authService.logout(user.id, body?.refreshToken, ipAddress);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions for current user' })
  async logoutAll(@CurrentUser() user: any, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.authService.logoutAll(user.id, ipAddress);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }

  @Public()
  @Get('email/verify')
  @ApiOperation({ summary: 'Verify email address from link' })
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    const result = await this.authService.verifyEmail(token);
    // Redirect to login page with success message
    const partnerUrl = this.configService.get<string>('PARTNER_APP_URL', 'http://localhost:3002');
    const advertiserUrl = this.configService.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
    // Default to advertiser app for redirect
    return res.redirect(`${advertiserUrl}/login?verified=true`);
  }

  @Public()
  @Post('email/resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Resend verification email' })
  async resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }
}
