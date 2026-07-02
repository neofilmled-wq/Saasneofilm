'use client';

import { BellOff } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Centre d'alertes — version placeholder.
 *
 * L'ancien contenu (liste d'alertes + actions "prendre en charge",
 * "redémarrer", "vider le cache", "demander les logs") était **entièrement
 * simulé** via `mockAlerts` dans `lib/mock-data.ts`. Aucun endpoint API
 * n'existe pour cette page côté partenaire — le seul endpoint `alerts` du
 * backend concerne la fraude côté admin.
 *
 * Plutôt que d'afficher des données factices comme si elles étaient
 * réelles, on montre un empty state explicite jusqu'à ce que le pipeline
 * soit branché (DeviceErrorLog → détection offline → agrégation).
 */
export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Centre d'alertes"
        description="Surveillez les incidents de vos appareils"
      />
      <EmptyState
        icon={BellOff}
        title="Alertes bientôt disponibles"
        description="Cette section sera activée dès que la remontée d'incidents temps réel sera branchée (détection hors ligne, crashs, stockage, échecs OTA). En attendant, contactez le support NeoFilm si vous constatez un dysfonctionnement."
      />
    </div>
  );
}
