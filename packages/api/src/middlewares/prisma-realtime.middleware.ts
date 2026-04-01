import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../services/realtime/event-bus.service';
import { EventMapperService } from '../services/realtime/event-mapper.service';
import type { DomainEvent, TrackedModel, DomainAction } from '@neofilm/shared';

const TRACKED_MODELS: Set<string> = new Set([
  'Campaign',
  'Screen',
  'StripeSubscription',
  'AIWallet',
  'AdPlacement',
  'CatalogueListing',
  'AdDecisionCache',
  'Booking',
  'ScreenLiveStatus',
]);

function toDomainAction(prismaAction: string): DomainAction | null {
  switch (prismaAction) {
    case 'create':
    case 'createMany':
      return 'created';
    case 'update':
    case 'updateMany':
    case 'upsert':
      return 'updated';
    case 'delete':
    case 'deleteMany':
      return 'deleted';
    default:
      return null;
  }
}

function extractPayload(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};

  const r = result as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  if (r.id) payload.id = r.id;
  if (r.partnerOrgId) payload.partnerOrgId = r.partnerOrgId;
  if (r.advertiserOrgId) payload.advertiserOrgId = r.advertiserOrgId;
  if (r.organizationId) payload.organizationId = r.organizationId;
  if (r.orgId) payload.orgId = r.orgId;
  if (r.screenId) payload.screenId = r.screenId;
  if (r.campaignId) payload.campaignId = r.campaignId;
  if (r.advertiserId) payload.advertiserId = r.advertiserId;
  if (r.status) payload.status = r.status;

  return payload;
}

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

@Injectable()
export class PrismaRealtimeMiddleware implements OnModuleInit {
  private readonly logger = new Logger(PrismaRealtimeMiddleware.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly eventMapper: EventMapperService,
  ) {}

  onModuleInit() {
    // NOTE: Prisma 6 removed $use (middleware API) in favour of $extends query extensions.
    // Real-time domain events are now emitted explicitly in each service instead.
    this.logger.log(
      `Prisma realtime middleware registered (${TRACKED_MODELS.size} tracked models — explicit emit mode)`,
    );
  }

  private async publishEvent(
    model: string,
    action: DomainAction,
    result: unknown,
  ): Promise<void> {
    const payload = extractPayload(result);
    const entityId = (payload.id as string) ?? 'unknown';

    const mapping = this.eventMapper.resolve(model, action, payload);
    if (!mapping) return;

    const event: DomainEvent = {
      eventId: generateEventId(),
      entity: model as TrackedModel,
      entityId,
      action,
      actorRoleTargets: mapping.actorRoleTargets,
      rooms: mapping.rooms,
      payload,
      timestamp: new Date().toISOString(),
      source: 'prisma-middleware',
    };

    await this.eventBus.publish(event);
  }
}
