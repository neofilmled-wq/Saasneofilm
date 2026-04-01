'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Check } from 'lucide-react';
import { Button, Checkbox } from '@neofilm/ui';
import { toast } from 'sonner';
import { useAvailableScreens } from '@/lib/api/hooks/use-screens';
import { useUpdateCampaign } from '@/lib/api/hooks/use-campaigns';
import { OnlineStatusDot } from '@/components/common/status-badge';
import type { MockScreen } from '@/lib/mock-data';

const AdvertiserScreenMap = dynamic(
  () => import('@/components/map/advertiser-screen-map').then((m) => m.AdvertiserScreenMap),
  { ssr: false, loading: () => <div className="flex h-[350px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">Chargement de la carte...</div> },
);

interface CampaignScreenEditorProps {
  campaignId: string;
  campaignType: string;
  currentScreenIds: string[];
  onSaved: () => void;
}

export function CampaignScreenEditor({ campaignId, campaignType, currentScreenIds, onSaved }: CampaignScreenEditorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentScreenIds));
  const { data: screens = [], isLoading } = useAvailableScreens({});
  const updateCampaign = useUpdateCampaign();

  const isDiffusion = campaignType === 'AD_SPOT';

  function toggleScreen(screen: MockScreen) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(screen.id)) {
        next.delete(screen.id);
      } else {
        next.add(screen.id);
      }
      return next;
    });
  }

  const hasChanges = useMemo(() => {
    if (selectedIds.size !== currentScreenIds.length) return true;
    return currentScreenIds.some((id) => !selectedIds.has(id));
  }, [selectedIds, currentScreenIds]);

  async function handleSave() {
    try {
      await updateCampaign.mutateAsync({
        id: campaignId,
        data: { selectedScreenIds: Array.from(selectedIds) },
      });
      toast.success('Écrans mis à jour avec succès');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la mise à jour');
    }
  }

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    screens.filter((s) => selectedIds.has(s.id)).forEach((s) => {
      map.set(s.city, (map.get(s.city) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedIds, screens]);

  const accentBg = isDiffusion ? 'bg-primary/5' : 'bg-blue-50';
  const accentBorder = isDiffusion ? 'border-primary/30' : 'border-blue-200';

  return (
    <div className="space-y-4">
      {/* Map + list */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border lg:col-span-2" style={{ minHeight: 350 }}>
          <AdvertiserScreenMap
            screens={screens}
            selectedIds={selectedIds}
            onToggle={toggleScreen}
            flyTo={null}
          />
        </div>
        <div className="max-h-[450px] overflow-y-auto rounded-lg border">
          {isLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">Chargement...</div>
          )}
          {!isLoading && screens.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Aucun écran trouvé</div>
          )}
          {screens.map((screen) => (
            <label
              key={screen.id}
              className={`flex items-center gap-3 border-b p-3 transition-colors last:border-0 cursor-pointer hover:bg-muted/50 ${
                selectedIds.has(screen.id) ? accentBg : ''
              }`}
            >
              <Checkbox
                checked={selectedIds.has(screen.id)}
                onCheckedChange={() => toggleScreen(screen)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{screen.name}</p>
                <p className="text-xs text-muted-foreground">
                  {screen.city} — {screen.partnerOrgName}
                </p>
              </div>
              <OnlineStatusDot isOnline={screen.isOnline} />
            </label>
          ))}
        </div>
      </div>

      {/* Selection summary + save */}
      <div className={`flex items-center justify-between rounded-lg border p-4 ${accentBorder} ${accentBg}`}>
        <div>
          <p className="text-sm font-medium">
            {selectedIds.size} écran{selectedIds.size !== 1 ? 's' : ''} sélectionné{selectedIds.size !== 1 ? 's' : ''}
          </p>
          {cityCounts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {cityCounts.slice(0, 5).map(([city, count]) => (
                <span key={city} className="rounded bg-white/80 px-2 py-0.5 text-xs">
                  {city} ({count})
                </span>
              ))}
              {cityCounts.length > 5 && (
                <span className="rounded bg-white/80 px-2 py-0.5 text-xs text-muted-foreground">
                  +{cityCounts.length - 5} villes
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateCampaign.isPending}
          className="gap-1.5"
        >
          <Check className="h-4 w-4" />
          {updateCampaign.isPending ? 'Enregistrement...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
}
