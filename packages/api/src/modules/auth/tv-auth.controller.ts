import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { TvAuthService } from './tv-auth.service';

@ApiTags('TV Auth')
@Controller('tv')
@SkipThrottle()
export class TvAuthController {
  constructor(private readonly tvAuthService: TvAuthService) {}

  /**
   * TV device self-registers and gets a 6-digit PIN + QR payload.
   * No admin action needed upfront.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'TV device self-registration — returns PIN + QR data' })
  async register(@Body() body: { deviceId: string; serialNumber?: string; androidId?: string }) {
    if (!body.deviceId) throw new BadRequestException('deviceId is required');
    return this.tvAuthService.registerDevice(body.deviceId, body.serialNumber, body.androidId);
  }

  @Public()
  @Post('reconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconnect a paired device by its Android hardware ID — returns JWT if found' })
  async reconnect(@Body() body: { androidId: string }) {
    if (!body.androidId) throw new BadRequestException('androidId is required');
    const result = await this.tvAuthService.reconnectByAndroidId(body.androidId);
    if (!result) throw new NotFoundException('No paired device found for this androidId');
    return result;
  }

  /**
   * Pair a device by PIN — can be called by admin portal OR by the device itself.
   */
  @Public()
  @Post('pair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pair device by PIN — returns JWT + screen info' })
  async pair(@Body() body: { pin: string; screenId?: string }) {
    if (!body.pin) throw new BadRequestException('pin is required');
    return this.tvAuthService.pairByPin(body.pin, body.screenId);
  }

  /**
   * TV device polls this to check if it has been paired yet.
   * Called every 3s during pairing — must not be throttled.
   */
  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Check device pairing status' })
  async status(@Query('deviceId') deviceId: string) {
    if (!deviceId) throw new BadRequestException('deviceId query param required');
    return this.tvAuthService.getDeviceStatus(deviceId);
  }

  /**
   * Reset device back to PROVISIONING — clears pairedAt and screenId so a new PIN is generated.
   * Called from the TV settings "Réinitialiser l'appairage" flow.
   */
  @Public()
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset device to PROVISIONING state so a new PIN is generated' })
  async reset(@Body() body: { deviceId: string }) {
    if (!body.deviceId) throw new BadRequestException('deviceId is required');
    return this.tvAuthService.resetDevice(body.deviceId);
  }

  /**
   * Authenticated endpoint — TV uses its JWT to validate it's still paired.
   * Called on boot when a token exists in localStorage.
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current device info (requires device JWT)' })
  async me(@Req() req: any) {
    const deviceId = req.user?.id;
    if (!deviceId || req.user?.type !== 'device') {
      throw new BadRequestException('Device JWT required');
    }
    return this.tvAuthService.getDeviceInfo(deviceId);
  }

  /**
   * Check if an app update is available.
   * Called by the APK on boot — no auth required.
   */
  @Public()
  @Get('check-update')
  @ApiOperation({ summary: 'Check for APK update — returns latest version + download URL' })
  async checkUpdate(
    @Query('versionCode') versionCode?: string,
    @Query('variant') variant?: string,
  ) {
    return this.tvAuthService.checkUpdate(
      versionCode ? parseInt(versionCode, 10) : 0,
      variant || 'all',
    );
  }
}
