import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Roles, CurrentUser } from '../../common/decorators';
import { FraudDetectionService } from './fraud-detection.service';
import { AdminActionsService } from './admin-actions.service';

// ────────────────────────────────────────────────────────────────────────────
// Controller
// ────────────────────────────────────────────────────────────────────────────

@ApiTags('Fraud')
@ApiBearerAuth()
@Controller('fraud')
export class FraudController {
  private readonly logger = new Logger(FraudController.name);

  constructor(
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly adminActionsService: AdminActionsService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Detection endpoints
  // ──────────────────────────────────────────────────────────────────────────

  @Get('signals')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Run all fraud detection checks',
    description:
      'Executes the complete fraud detection rule engine and returns all signals found. ' +
      'Includes ghost screens, impossible impressions, self-dealing, device cloning, ' +
      'spoofed logs, and chargeback abuse.',
  })
  @ApiResponse({ status: 200, description: 'Fraud signals report' })
  async getAllSignals() {
    this.logger.log('Admin requested full fraud signals scan');
    return this.fraudDetectionService.runAllChecks();
  }

  @Get('ghost-screens')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Detect ghost screens',
    description:
      'Find screens that are ACTIVE with an ACTIVE booking but have no device heartbeats ' +
      'in the last 7 days (configurable).',
  })
  @ApiResponse({ status: 200, description: 'List of ghost screen signals' })
  async getGhostScreens() {
    this.logger.log('Admin requested ghost screen detection');
    return this.fraudDetectionService.detectGhostScreens();
  }

  @Get('self-dealing')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Detect self-dealing bookings',
    description:
      'Find bookings where the advertiser org and a partner org share a common user ' +
      'in their memberships, indicating potential self-dealing.',
  })
  @ApiResponse({ status: 200, description: 'List of self-dealing signals' })
  async getSelfDealing() {
    this.logger.log('Admin requested self-dealing detection');
    return this.fraudDetectionService.detectSelfDealing();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze / Unfreeze: Advertiser
  // ──────────────────────────────────────────────────────────────────────────

  @Post('freeze-advertiser/:orgId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Freeze an advertiser organization',
    description:
      'Flags the organization, pauses all active bookings and campaigns. ' +
      'Creates a CRITICAL audit log entry.',
  })
  @ApiParam({ name: 'orgId', description: 'Advertiser organization ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for freezing the advertiser',
          example: 'Suspected fraudulent impression inflation',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Advertiser frozen successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async freezeAdvertiser(
    @Param('orgId') orgId: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.warn(`Admin ${userId} freezing advertiser ${orgId}`);
    return this.adminActionsService.freezeAdvertiser(orgId, reason, userId);
  }

  @Post('unfreeze-advertiser/:orgId')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfreeze an advertiser organization',
    description:
      'Clears the fraud flag on the organization. Does NOT auto-resume bookings or ' +
      'campaigns — admin must resume them manually.',
  })
  @ApiParam({ name: 'orgId', description: 'Advertiser organization ID' })
  @ApiResponse({ status: 200, description: 'Advertiser unfrozen successfully' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async unfreezeAdvertiser(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.log(`Super admin ${userId} unfreezing advertiser ${orgId}`);
    return this.adminActionsService.unfreezeAdvertiser(orgId, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze / Unfreeze: Partner Payout
  // ──────────────────────────────────────────────────────────────────────────

  @Post('freeze-partner-payout/:orgId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Freeze partner payout',
    description:
      'Sets PartnerPayoutProfile.frozen=true preventing any further payouts. ' +
      'Creates a CRITICAL audit log entry.',
  })
  @ApiParam({ name: 'orgId', description: 'Partner organization ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for freezing payouts',
          example: 'Suspected ghost screen fraud',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Partner payout frozen' })
  @ApiResponse({ status: 404, description: 'PartnerPayoutProfile not found' })
  async freezePartnerPayout(
    @Param('orgId') orgId: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.warn(`Admin ${userId} freezing partner payout for org ${orgId}`);
    return this.adminActionsService.freezePartnerPayout(orgId, reason, userId);
  }

  @Post('unfreeze-partner-payout/:orgId')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfreeze partner payout',
    description: 'Sets PartnerPayoutProfile.frozen=false, allowing payouts again.',
  })
  @ApiParam({ name: 'orgId', description: 'Partner organization ID' })
  @ApiResponse({ status: 200, description: 'Partner payout unfrozen' })
  @ApiResponse({ status: 404, description: 'PartnerPayoutProfile not found' })
  async unfreezePartnerPayout(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.log(`Super admin ${userId} unfreezing partner payout for org ${orgId}`);
    return this.adminActionsService.unfreezePartnerPayout(orgId, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Freeze / Unfreeze: Booking
  // ──────────────────────────────────────────────────────────────────────────

  @Post('freeze-booking/:bookingId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Freeze a booking',
    description:
      'Flags the booking, sets status to PAUSED, and pauses the linked campaign. ' +
      'Creates a CRITICAL audit log entry.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for freezing the booking',
          example: 'Self-dealing detected between advertiser and partner',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Booking frozen successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async freezeBooking(
    @Param('bookingId') bookingId: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.warn(`Admin ${userId} freezing booking ${bookingId}`);
    return this.adminActionsService.freezeBooking(bookingId, reason, userId);
  }

  @Post('unfreeze-booking/:bookingId')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfreeze a booking',
    description:
      'Clears the fraud flag on the booking. Does NOT change booking status — ' +
      'admin must resume manually.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking unfrozen successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async unfreezeBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.log(`Super admin ${userId} unfreezing booking ${bookingId}`);
    return this.adminActionsService.unfreezeBooking(bookingId, userId);
  }
}
