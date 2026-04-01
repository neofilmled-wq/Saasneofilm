import { Body, Controller, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { DeviceAuthService } from './device-auth.service';
import { Public } from '../../common/decorators';

@ApiTags('Device Auth')
@Controller('auth/device')
export class DeviceAuthController {
  constructor(private readonly deviceAuthService: DeviceAuthService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Authenticate device via provisioning token' })
  async authenticate(@Body() body: { provisioningToken: string; deviceFingerprint?: string }) {
    return this.deviceAuthService.authenticateDevice(body.provisioningToken, body.deviceFingerprint);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh device token' })
  async refresh(@Req() req: Request) {
    const deviceId = (req as any).user?.id || (req as any).user?.sub;
    return this.deviceAuthService.refreshDeviceToken(deviceId);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Device heartbeat' })
  async heartbeat(@Req() req: Request) {
    const deviceId = (req as any).user?.id || (req as any).user?.sub;
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.deviceAuthService.heartbeat(deviceId, ipAddress);
  }
}