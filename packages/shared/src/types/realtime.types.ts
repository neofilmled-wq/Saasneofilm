/** Models tracked by the realtime sync engine */
export type TrackedModel =
  | 'Campaign'
  | 'Screen'
  | 'StripeSubscription'
  | 'AIWallet'
  | 'AdPlacement'
  | 'CatalogueListing'
  | 'AdDecisionCache'
  | 'Booking'
  | 'ScreenLiveStatus'
  // ── Nouveaux modèles trackés ──
  | 'Creative'      // modération créatives → notifier annonceur + admin
  | 'ScreenFill'    // capacité écran → notifier partner + admin (capacity_full)
  | 'TvConfig';     // branding partenaire → notifier TV

export type DomainAction =
  | 'created'
  | 'updated'
  | 'deleted'
  // ── Actions métier spécialisées ──
  | 'approved'        // campagne / créa approuvée
  | 'rejected'        // campagne / créa rejetée
  | 'capacity_full'   // écran atteint 40 annonceurs
  | 'schedule_updated' // schedule TV recalculé
  | 'force_reload';   // commande reload TV forcé

export type ActorRole = 'admin' | 'partner' | 'advertiser' | 'device' | 'system';

export interface DomainEvent {
  eventId: string;
  entity: TrackedModel;
  entityId: string;
  action: DomainAction;
  actorRoleTargets: ActorRole[];
  rooms: string[];
  payload: Record<string, unknown>;
  timestamp: string;
  source: string;
}

export interface RealtimeEventEnvelope {
  eventId: string;
  entity: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
