import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CanvaService } from './canva.service';
import { CreateDesignDto } from './dto/create-design.dto';
import { ExportDesignDto } from './dto/export-design.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators';

@ApiTags('Canva Integration')
@Controller()
export class CanvaController {
  private readonly logger = new Logger(CanvaController.name);

  constructor(
    private readonly canvaService: CanvaService,
    private readonly config: ConfigService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // OAuth Integration
  // ──────────────────────────────────────────────────────────────────────────

  @Get('integrations/canva/connect')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Canva OAuth authorization URL' })
  async connect(@CurrentUser('id') userId: string) {
    const url = await this.canvaService.getConnectUrl(userId);
    return { url };
  }

  @Public()
  @Get('integrations/canva/callback')
  @ApiOperation({ summary: 'Canva OAuth callback' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get<string>('ADVERTISER_APP_URL', 'http://localhost:3003');
    try {
      if (!code || !state) {
        return res.redirect(`${frontendUrl}/settings?error=canva_missing_params`);
      }

      await this.canvaService.handleCallback(code, state);
      return res.redirect(`${frontendUrl}/media-library?canva=connected`);
    } catch (err: any) {
      this.logger.error(`Canva callback error: ${err.message}`);
      return res.redirect(`${frontendUrl}/settings?error=canva_callback_failed`);
    }
  }

  @Get('integrations/canva/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check Canva connection status' })
  async status(@CurrentUser('id') userId: string) {
    return this.canvaService.getConnectionStatus(userId);
  }

  @Delete('integrations/canva/disconnect')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect Canva account' })
  async disconnect(@CurrentUser('id') userId: string) {
    await this.canvaService.disconnect(userId);
    return { message: 'Canva account disconnected' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Design Management
  // ──────────────────────────────────────────────────────────────────────────

  @Post('canva/designs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new Canva design' })
  async createDesign(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDesignDto,
  ) {
    return this.canvaService.createDesign(userId, dto.title, dto.width, dto.height);
  }

  @Get('canva/designs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Canva designs for current org' })
  async listDesigns(@CurrentUser('id') userId: string) {
    return this.canvaService.listDesigns(userId);
  }

  @Post('canva/designs/sync')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync designs from Canva account' })
  async syncDesigns(@CurrentUser('id') userId: string) {
    return this.canvaService.syncDesignsFromCanva(userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Export
  // ──────────────────────────────────────────────────────────────────────────

  @Post('canva/designs/:canvaDesignId/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start a Canva design export' })
  async startExport(
    @CurrentUser('id') userId: string,
    @Param('canvaDesignId') canvaDesignId: string,
    @Body() dto: ExportDesignDto,
  ) {
    return this.canvaService.startExport(userId, canvaDesignId, dto.format, {
      quality: dto.quality,
      width: dto.width,
      height: dto.height,
    });
  }

  @Get('canva/designs/:canvaDesignId/export-status/:exportId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check export status' })
  async getExportStatus(
    @CurrentUser('id') userId: string,
    @Param('canvaDesignId') canvaDesignId: string,
    @Param('exportId') exportId: string,
  ) {
    return this.canvaService.getExportStatus(userId, canvaDesignId, exportId);
  }

  @Post('canva/designs/:canvaDesignId/import/:exportId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download Canva export and store in NeoFilm (creates a Creative)' })
  async importExport(
    @CurrentUser('id') userId: string,
    @Param('canvaDesignId') canvaDesignId: string,
    @Param('exportId') exportId: string,
    @Query('format') format: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.canvaService.downloadAndStoreExport(
      userId,
      canvaDesignId,
      exportId,
      format || 'png',
      campaignId,
    );
  }
}
