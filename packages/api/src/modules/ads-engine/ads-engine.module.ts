import { Module } from '@nestjs/common';
import { AdsSchedulerService } from './ads-scheduler.service';
import { AdsEngineController } from './ads-engine.controller';
import { AdsAdminController } from './ads-admin.controller';
import { AdsEventService } from './ads-event.service';

/**
 * ADS ENGINE MODULE (ADD-ON)
 *
 * This module is completely isolated from the existing diffusion module.
 * It provides:
 * - Industrial-grade AdsScheduler with scoring, tier split, and frequency caps
 * - Decision caching with batch invalidation
 * - Event logging with idempotency
 * - Admin recompute endpoints
 *
 * It does NOT modify any existing service, controller, or module.
 * It only reads from existing Prisma models (Campaign, Screen, Creative)
 * and writes to new models (AdPlacement, AdDecisionCache, AdEvent, AdRuleSet).
 */
@Module({
  controllers: [AdsEngineController, AdsAdminController],
  providers: [AdsSchedulerService, AdsEventService],
  exports: [AdsSchedulerService, AdsEventService],
})
export class AdsEngineModule {}
