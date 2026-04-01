import { Body, Controller, Post, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { MfaService } from './mfa.service';
import { Public, CurrentUser, Roles } from '../../common/decorators';

@ApiTags('MFA')
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('setup')
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Generate TOTP secret and QR code URL for MFA setup' })
  async setup(@CurrentUser() user: any) {
    return this.mfaService.generateSetup(user.id);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Confirm MFA setup with a TOTP code' })
  async enable(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.mfaService.enableMfa(user.id, body.code);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA code during login' })
  async verify(@Body() body: { mfaToken: string; code: string }, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.mfaService.verifyMfaLogin(body.mfaToken, body.code, ipAddress, userAgent);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Disable MFA (requires current TOTP code)' })
  async disable(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.mfaService.disableMfa(user.id, body.code);
  }

  @Post('backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Regenerate backup codes (requires current TOTP code)' })
  async regenerateBackupCodes(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.mfaService.regenerateBackupCodes(user.id, body.code);
  }
}