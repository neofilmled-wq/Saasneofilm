import { Injectable } from '@nestjs/common';
import type { TrackedModel, DomainAction, ActorRole } from '@neofilm/shared';

interface EventMapping {
  clientEventName: string;
  actorRoleTargets: ActorRole[];
  rooms: (payload: Record<string, unknown>) => string[];
}

type MappingKey = `${TrackedModel}:${DomainAction}`;

const MAPPINGS: Partial<Record<MappingKey, EventMapping>> = {
  // ── Campaign ──
  'Campaign:created': {
    clientEventName: 'realtime:campaign:created',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Campaign:updated': {
    clientEventName: 'realtime:campaign:updated',
    actorRoleTargets: ['admin', 'advertiser', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Campaign:deleted': {
    clientEventName: 'realtime:campaign:deleted',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },

  // ── Screen ──
  'Screen:created': {
    clientEventName: 'realtime:screen:created',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'Screen:updated': {
    clientEventName: 'realtime:screen:updated',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'Screen:deleted': {
    clientEventName: 'realtime:screen:deleted',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },

  // ── StripeSubscription ──
  'StripeSubscription:created': {
    clientEventName: 'realtime:subscription:created',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.organizationId ? [`advertiser:${p.organizationId}`] : []),
    ],
  },
  'StripeSubscription:updated': {
    clientEventName: 'realtime:subscription:updated',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.organizationId ? [`advertiser:${p.organizationId}`] : []),
    ],
  },
  'StripeSubscription:deleted': {
    clientEventName: 'realtime:subscription:deleted',
    actorRoleTargets: ['admin'],
    rooms: () => ['admin'],
  },

  // ── AIWallet ──
  'AIWallet:created': {
    clientEventName: 'realtime:wallet:created',
    actorRoleTargets: ['advertiser'],
    rooms: (p) => [
      ...(p.organizationId ? [`advertiser:${p.organizationId}`] : []),
    ],
  },
  'AIWallet:updated': {
    clientEventName: 'realtime:wallet:updated',
    actorRoleTargets: ['advertiser'],
    rooms: (p) => [
      ...(p.organizationId ? [`advertiser:${p.organizationId}`] : []),
    ],
  },
  'AIWallet:deleted': {
    clientEventName: 'realtime:wallet:deleted',
    actorRoleTargets: ['advertiser'],
    rooms: () => [],
  },

  // ── AdPlacement ──
  'AdPlacement:created': {
    clientEventName: 'realtime:adplacement:created',
    actorRoleTargets: ['admin', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },
  'AdPlacement:updated': {
    clientEventName: 'realtime:adplacement:updated',
    actorRoleTargets: ['admin', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },
  'AdPlacement:deleted': {
    clientEventName: 'realtime:adplacement:deleted',
    actorRoleTargets: ['admin', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },

  // ── CatalogueListing ──
  'CatalogueListing:created': {
    clientEventName: 'realtime:catalogue:created',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'CatalogueListing:updated': {
    clientEventName: 'realtime:catalogue:updated',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'CatalogueListing:deleted': {
    clientEventName: 'realtime:catalogue:deleted',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: () => ['admin'],
  },

  // ── Campaign status spécialisés ──
  'Campaign:approved': {
    clientEventName: 'realtime:campaign:approved',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Campaign:rejected': {
    clientEventName: 'realtime:campaign:rejected',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Campaign:schedule_updated': {
    clientEventName: 'realtime:campaign:schedule_updated',
    actorRoleTargets: ['admin', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },

  // ── Creative modération ──
  'Creative:created': {
    clientEventName: 'realtime:creative:created',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Creative:updated': {
    clientEventName: 'realtime:creative:updated',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Creative:approved': {
    clientEventName: 'realtime:creative:approved',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Creative:rejected': {
    clientEventName: 'realtime:creative:rejected',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },
  'Creative:deleted': {
    clientEventName: 'realtime:creative:deleted',
    actorRoleTargets: ['admin', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
    ],
  },

  // ── ScreenFill (capacité écrans) ──
  'ScreenFill:created': {
    clientEventName: 'realtime:screenfill:created',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'ScreenFill:updated': {
    clientEventName: 'realtime:screenfill:updated',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'ScreenFill:capacity_full': {
    clientEventName: 'realtime:screen:capacity_full',
    actorRoleTargets: ['admin', 'partner', 'advertiser'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'ScreenFill:deleted': {
    clientEventName: 'realtime:screenfill:deleted',
    actorRoleTargets: ['admin', 'partner'],
    rooms: () => ['admin'],
  },

  // ── TvConfig (branding partenaire → push TV) ──
  'TvConfig:created': {
    clientEventName: 'realtime:tvconfig:created',
    actorRoleTargets: ['admin', 'partner', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },
  'TvConfig:updated': {
    clientEventName: 'realtime:tvconfig:updated',
    actorRoleTargets: ['admin', 'partner', 'device'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },
  'TvConfig:deleted': {
    clientEventName: 'realtime:tvconfig:deleted',
    actorRoleTargets: ['admin', 'partner'],
    rooms: () => ['admin'],
  },
  'TvConfig:force_reload': {
    clientEventName: 'realtime:tv:force_reload',
    actorRoleTargets: ['device'],
    rooms: (p) => [
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },

  // ── AdDecisionCache ──
  'AdDecisionCache:created': {
    clientEventName: 'realtime:adcache:created',
    actorRoleTargets: ['device'],
    rooms: (p) => [
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },
  'AdDecisionCache:updated': {
    clientEventName: 'realtime:adcache:updated',
    actorRoleTargets: ['device'],
    rooms: (p) => [
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },
  'AdDecisionCache:deleted': {
    clientEventName: 'realtime:adcache:deleted',
    actorRoleTargets: ['device'],
    rooms: (p) => [
      ...(p.screenId ? [`screen:${p.screenId}`] : []),
    ],
  },

  // ── Booking ──
  'Booking:created': {
    clientEventName: 'realtime:booking:created',
    actorRoleTargets: ['admin', 'advertiser', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'Booking:updated': {
    clientEventName: 'realtime:booking:updated',
    actorRoleTargets: ['admin', 'advertiser', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.advertiserOrgId ? [`advertiser:${p.advertiserOrgId}`] : []),
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'Booking:deleted': {
    clientEventName: 'realtime:booking:deleted',
    actorRoleTargets: ['admin'],
    rooms: () => ['admin'],
  },

  // ── ScreenLiveStatus ──
  'ScreenLiveStatus:created': {
    clientEventName: 'realtime:screenstatus:created',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'ScreenLiveStatus:updated': {
    clientEventName: 'realtime:screenstatus:updated',
    actorRoleTargets: ['admin', 'partner'],
    rooms: (p) => [
      'admin',
      ...(p.partnerOrgId ? [`partner:${p.partnerOrgId}`] : []),
    ],
  },
  'ScreenLiveStatus:deleted': {
    clientEventName: 'realtime:screenstatus:deleted',
    actorRoleTargets: ['admin', 'partner'],
    rooms: () => ['admin'],
  },
};

@Injectable()
export class EventMapperService {
  /**
   * Given a model name and action, resolves the event routing information.
   * Returns null if the model/action combination is not tracked.
   */
  resolve(
    entity: string,
    action: DomainAction,
    payload: Record<string, unknown>,
  ): { clientEventName: string; actorRoleTargets: ActorRole[]; rooms: string[] } | null {
    const key = `${entity}:${action}` as MappingKey;
    const mapping = MAPPINGS[key];
    if (!mapping) return null;

    return {
      clientEventName: mapping.clientEventName,
      actorRoleTargets: mapping.actorRoleTargets,
      rooms: mapping.rooms(payload),
    };
  }
}
