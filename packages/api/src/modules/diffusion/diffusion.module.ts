import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { CampaignIndexerService } from './campaign-indexer.service';
import { MatchingService } from './matching.service';
import { SchedulerService } from './scheduler.service';
import { OverrideManagerService } from './override-manager.service';
import { DeviceSyncService } from './device-sync.service';
import { DeviceSyncController } from './device-sync.controller';
import { AdminDiffusionController } from './admin-diffusion.controller';
import { ProofIngestionService } from './proof-ingestion.service';
import { FraudDetectionService } from './fraud-detection.service';
import { AuditModule } from '../audit/audit.module';

/**
 * DiffusionModule
 *
 * Core real-time advertising engine. Responsible for:
 *   - Campaign indexing (eligible campaigns per geoHash)
 *   - Ad matching & scoring (deterministic ranking)
 *   - Schedule generation (6-hour lookahead bundles)
 *   - Device sync (pull + push schedules)
 *   - Admin overrides (force/block/pause)
 *   - Proof ingestion (DiffusionLog validation)
 *   - Fraud detection (rule-based anomaly analysis)
 *
 * On startup, rebuilds the campaign index from PostgreSQL.
 */
@Module({
  imports: [AuditModule],
  controllers: [DeviceSyncController, AdminDiffusionController],
  providers: [
    CampaignIndexerService,
    MatchingService,
    SchedulerService,
    OverrideManagerService,
    DeviceSyncService,
    ProofIngestionService,
    FraudDetectionService,
  ],
  exports: [
    CampaignIndexerService,
    MatchingService,
    SchedulerService,
    OverrideManagerService,
    FraudDetectionService,
  ],
})
export class DiffusionModule implements OnModuleInit {
  private readonly logger = new Logger(DiffusionModule.name);

  constructor(
    private readonly campaignIndexer: CampaignIndexerService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Diffusion Engine (background)...');
    // Non-blocking — index rebuilds in background so API starts immediately
    this.campaignIndexer.rebuildFullIndex()
      .then((result) => this.logger.log(`Diffusion Engine ready: ${result.campaignsIndexed} campaigns indexed`))
      .catch((error) => this.logger.warn(`Campaign index rebuild failed on startup (will retry): ${error}`));
  }
}
