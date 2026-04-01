'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Monitor, X, Tv, BookOpen, Info } from 'lucide-react';
import { Button, Card, CardContent, Checkbox, Label, AddressAutocomplete } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import type { AddressSelection } from '@neofilm/ui';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';
import { useAvailableScreens } from '@/lib/api/hooks/use-screens';
import { useBusyScreens } from '@/lib/api/hooks/use-campaigns';
import { OnlineStatusDot } from '@/components/common/status-badge';
import type { MockScreen, ScreenEnvironment } from '@/lib/mock-data';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const AdvertiserScreenMap = dynamic(
  () => import('@/components/map/advertiser-screen-map').then((m) => m.AdvertiserScreenMap),
  { ssr: false, loading: () => <div className="flex h-[350px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">Chargement de la carte...</div> },
);

const TV_PACKS = [50, 100, 150, 200] as const;
const ENVIRONMENTS: { value: ScreenEnvironment | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tous les types' },
  { value: 'HOTEL_LOBBY', label: "Hall d'hôtel" },
  { value: 'HOTEL_ROOM', label: "Chambre d'hôtel" },
  { value: 'CINEMA_LOBBY', label: 'Cinéma' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'RETAIL', label: 'Commerce' },
  { value: 'OUTDOOR', label: 'Extérieur' },
];

interface PricingQuote {
  diffusionMonthly: number | null;
  catalogueMonthly: number | null;
  totalMonthly: number;
  totalEngagement: number;
  pricePerTvDiffusion: number | null;
  pricePerTvCatalogue: number | null;
  durationMonths: number;
}

function usePricingQuote(
  diffusionTvCount?: number,
  catalogueTvCount?: number,
  durationMonths: number = 12,
) {
  const params = new URLSearchParams();
  if (diffusionTvCount) params.set('diffusionTvCount', String(diffusionTvCount));
  if (catalogueTvCount) params.set('catalogueTvCount', String(catalogueTvCount));
  params.set('durationMonths', String(durationMonths));

  const enabled = !!(diffusionTvCount || catalogueTvCount);

  return useQuery<PricingQuote>({
    queryKey: ['pricing', diffusionTvCount, catalogueTvCount, durationMonths],
    queryFn: () => apiFetch(`/pricing/compute?${params.toString()}`),
    enabled,
  });
}

// ─── Reusable screen targeting block ────────────────────────────────────────

interface TargetingBlockProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accentClass: string; // e.g. 'border-primary' or 'border-blue-500'
  accentBg: string;    // e.g. 'bg-primary/5' or 'bg-blue-50'
  packActiveClass: string; // classes for active pack button
  screens: MockScreen[];
  isLoading: boolean;
  selectedIds: Set<string>;
  selectedScreens: MockScreen[];
  packSize: number | undefined;
  onPackSelect: (size: number) => void;
  onPackClear: () => void;
  onToggleScreen: (screen: MockScreen) => void;
  flyTo: { lat: number; lng: number } | null;
  priceLine?: React.ReactNode;
  busyIds?: Set<string>;
  minPack?: number; // Minimum pack size (existing subscription) — packs below this are disabled
}

function TargetingBlock({
  title, description, icon, accentClass, accentBg,
  packActiveClass, screens, isLoading,
  selectedIds, selectedScreens, packSize,
  onPackSelect, onPackClear, onToggleScreen, flyTo, priceLine,
  busyIds = new Set(),
  minPack = 0,
}: TargetingBlockProps) {
  const availableScreens = screens.filter((s) => !busyIds.has(s.id));

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    selectedScreens.forEach((s) => {
      map.set(s.city, (map.get(s.city) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedScreens]);

  return (
    <Card className={`border-2 transition-colors ${packSize ? accentClass : 'border-muted'}`}>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>

        {/* Pack selector */}
        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Pack TV</Label>
          <div className="flex flex-wrap gap-2">
            {TV_PACKS.map((size) => {
              const tooMany = size > availableScreens.length;
              const belowMin = minPack > 0 && size < minPack;
              const disabled = tooMany || belowMin;
              const isActive = packSize === size || (minPack === size && !packSize);
              return (
                <button
                  key={size}
                  onClick={() => !disabled && onPackSelect(size)}
                  disabled={disabled}
                  title={
                    belowMin ? `Pack actuel : ${minPack} TV — vous ne pouvez pas réduire`
                    : tooMany ? `Seulement ${availableScreens.length} écrans en ligne disponibles`
                    : undefined
                  }
                  className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                    disabled
                      ? 'border-muted text-muted-foreground/40 cursor-not-allowed opacity-50'
                      : isActive
                        ? packActiveClass
                        : 'border-muted hover:border-primary/50'
                  }`}
                >
                  {size} TV
                </button>
              );
            })}
            {packSize && !minPack && (
              <button
                onClick={onPackClear}
                className="rounded-lg border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="inline h-3 w-3" />
              </button>
            )}
          </div>
          {priceLine}
          <p className="mt-1 text-xs text-muted-foreground">
            {availableScreens.length} écran{availableScreens.length !== 1 ? 's' : ''} en ligne disponible{availableScreens.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Map + list */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-lg border lg:col-span-2" style={{ minHeight: 300 }}>
            <AdvertiserScreenMap
              screens={availableScreens}
              selectedIds={selectedIds}
              onToggle={onToggleScreen}
              flyTo={flyTo}
            />
          </div>
          <div className="max-h-85 overflow-y-auto rounded-lg border">
            {isLoading && (
              <div className="p-4 text-center text-sm text-muted-foreground">Chargement...</div>
            )}
            {!isLoading && screens.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">Aucun écran trouvé</div>
            )}
            {availableScreens.slice(0, 50).map((screen) => {
              return (
                <label
                  key={screen.id}
                  className={`flex items-center gap-3 border-b p-3 transition-colors last:border-0 cursor-pointer hover:bg-muted/50 ${selectedIds.has(screen.id) ? accentBg : ''}`}
                >
                  <Checkbox
                    checked={selectedIds.has(screen.id)}
                    onCheckedChange={() => onToggleScreen(screen)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{screen.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {screen.city} — {screen.partnerOrgName}
                    </p>
                  </div>
                  <OnlineStatusDot isOnline={screen.isOnline} />
                </label>
              );
            })}
          </div>
        </div>

        {/* Selection summary */}
        {selectedIds.size > 0 && (
          <div className={`rounded-lg p-3 ${accentBg}`}>
            <p className="text-sm font-medium">
              {selectedIds.size} écran{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {cityCounts.slice(0, 5).map(([city, count]) => (
                <span key={city} className="rounded bg-white/80 px-2 py-0.5 text-xs">
                  {city} ({count})
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function StepTargeting() {
  const { draft, updateDraft, nextStep, prevStep, editingCampaignId, initialDiffusionPackSize, initialCatalogPackSize } = useCampaignWizard();
  const isEditing = !!editingCampaignId;
  const hasAdSpot = draft.types.includes('AD_SPOT');
  const hasCatalog = draft.types.includes('CATALOG_LISTING');

  // In edit mode, use the original pack sizes from DB as minimum (immutable)
  const minDiffusionPack = isEditing ? initialDiffusionPackSize : 0;
  const minCatalogPack = isEditing ? initialCatalogPackSize : 0;

  const [citySearch, setCitySearch] = useState(draft.targetingCity);
  const [environment, setEnvironment] = useState<ScreenEnvironment | 'ALL'>('ALL');
  const durationMonths = draft.subscriptionMonths || 12;

  const { data: busyData } = useBusyScreens();
  const busyAdSpotIds = useMemo(() => new Set(busyData?.AD_SPOT ?? []), [busyData]);
  const busyCatalogIds = useMemo(() => new Set(busyData?.CATALOG_LISTING ?? []), [busyData]);

  const { data: screens = [], isLoading } = useAvailableScreens({
    city: citySearch || undefined,
    environment: environment === 'ALL' ? undefined : environment,
  });

  // Derived sets
  const diffusionIds = new Set(draft.selectedScreenIds);
  const catalogIds = new Set(draft.catalogSelectedScreenIds);

  // Pricing query
  const diffusionTvCount = draft.packSize ?? undefined;
  const catalogueTvCount = draft.catalogPackSize ?? undefined;

  const { data: quote, error: quoteError } = usePricingQuote(
    diffusionTvCount,
    catalogueTvCount,
    durationMonths,
  );

  // Helper: find matching pack for a screen count, or null
  function findMatchingPack(count: number): number | null {
    return TV_PACKS.find((p) => p === count) ?? null;
  }

  // ── Diffusion handlers ──
  function toggleDiffusionScreen(screen: MockScreen) {
    const newIds = diffusionIds.has(screen.id)
      ? draft.selectedScreenIds.filter((id) => id !== screen.id)
      : [...draft.selectedScreenIds, screen.id];
    const newScreens = diffusionIds.has(screen.id)
      ? draft.selectedScreens.filter((s) => s.id !== screen.id)
      : [...draft.selectedScreens, screen];
    const matchingPack = findMatchingPack(newIds.length);
    updateDraft({ selectedScreenIds: newIds, selectedScreens: newScreens, packSize: matchingPack });
  }

  function selectDiffusionPack(size: number) {
    const online = screens.filter((s) => !busyAdSpotIds.has(s.id));
    const selected = online.slice(0, size);
    updateDraft({
      packSize: size,
      selectedScreenIds: selected.map((s) => s.id),
      selectedScreens: selected,
    });
  }

  function clearDiffusionPack() {
    updateDraft({ packSize: null, selectedScreenIds: [], selectedScreens: [] });
  }

  // ── Catalogue handlers ──
  function toggleCatalogScreen(screen: MockScreen) {
    const newIds = catalogIds.has(screen.id)
      ? draft.catalogSelectedScreenIds.filter((id) => id !== screen.id)
      : [...draft.catalogSelectedScreenIds, screen.id];
    const newScreens = catalogIds.has(screen.id)
      ? draft.catalogSelectedScreens.filter((s) => s.id !== screen.id)
      : [...draft.catalogSelectedScreens, screen];
    const matchingPack = findMatchingPack(newIds.length);
    updateDraft({ catalogSelectedScreenIds: newIds, catalogSelectedScreens: newScreens, catalogPackSize: matchingPack });
  }

  function selectCatalogPack(size: number) {
    const online = screens.filter((s) => !busyCatalogIds.has(s.id));
    const selected = online.slice(0, size);
    updateDraft({
      catalogPackSize: size,
      catalogSelectedScreenIds: selected.map((s) => s.id),
      catalogSelectedScreens: selected,
    });
  }

  function clearCatalogPack() {
    updateDraft({ catalogPackSize: null, catalogSelectedScreenIds: [], catalogSelectedScreens: [] });
  }

  const flyTo = draft.targetingLat && draft.targetingLng
    ? { lat: draft.targetingLat, lng: draft.targetingLng }
    : null;

  const diffusionValid = !hasAdSpot || TV_PACKS.includes(draft.selectedScreenIds.length as any);
  const catalogValid = !hasCatalog || TV_PACKS.includes(draft.catalogSelectedScreenIds.length as any);
  const canProceed = diffusionValid && catalogValid;

  const diffusionMismatch = hasAdSpot && draft.selectedScreenIds.length > 0 && !TV_PACKS.includes(draft.selectedScreenIds.length as any);
  const catalogMismatch = hasCatalog && draft.catalogSelectedScreenIds.length > 0 && !TV_PACKS.includes(draft.catalogSelectedScreenIds.length as any);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Ciblage des écrans TV</h2>

      {/* Shared filters */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Ville / Adresse</Label>
          <AddressAutocomplete
            value={citySearch}
            onChange={(v) => setCitySearch(v)}
            onSelect={(sel: AddressSelection) => {
              const city = sel.city || sel.label;
              setCitySearch(city);
              updateDraft({
                targetingCity: city,
                targetingLat: sel.lat,
                targetingLng: sel.lng,
              });
            }}
            placeholder="Rechercher une ville..."
          />
        </div>
        <div className="space-y-2">
          <Label>Type d&apos;emplacement</Label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as typeof environment)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENVIRONMENTS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info: screens are not cumulative */}
      {hasAdSpot && hasCatalog && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex gap-3 p-4">
            <Info className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Les écrans ne se cumulent pas entre les deux offres</p>
              <p className="mt-1 text-amber-700">
                Les écrans sélectionnés pour la diffusion TV et le catalogue sont indépendants, mais un même écran
                peut apparaître dans les deux sélections. Par exemple, si vous choisissez 150 écrans pour le catalogue
                et 100 pour la diffusion TV, certains écrans peuvent être communs aux deux — vous n&apos;aurez donc pas
                forcément 250 écrans différents au total.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diffusion Publicité TV */}
      {hasAdSpot && (
        <TargetingBlock
          title="Diffusion Publicité TV"
          description="Diffusez vos spots publicitaires sur les écrans TV des partenaires."
          icon={<Tv className="h-5 w-5 text-primary" />}
          accentClass="border-primary"
          accentBg="bg-primary/5"
          packActiveClass="border-primary bg-primary text-primary-foreground"
          screens={screens}
          isLoading={isLoading}
          selectedIds={diffusionIds}
          selectedScreens={draft.selectedScreens}
          packSize={draft.packSize ?? undefined}
          onPackSelect={selectDiffusionPack}
          onPackClear={clearDiffusionPack}
          onToggleScreen={toggleDiffusionScreen}
          flyTo={flyTo}
          minPack={minDiffusionPack}
          priceLine={
            quote?.diffusionMonthly != null ? (
              <p className="mt-2 text-sm font-medium text-primary">
                {quote.diffusionMonthly.toFixed(2)} €/mois
                <span className="ml-1 text-xs text-muted-foreground">
                  ({quote.pricePerTvDiffusion?.toFixed(2)} €/TV)
                </span>
              </p>
            ) : undefined
          }
          busyIds={busyAdSpotIds}
        />
      )}

      {/* Catalogue TV */}
      {hasCatalog && (
        <TargetingBlock
          title="Catalogue TV"
          description="Affichez vos fiches produits dans le catalogue TV des partenaires."
          icon={<BookOpen className="h-5 w-5 text-blue-500" />}
          accentClass="border-blue-500"
          accentBg="bg-blue-50"
          packActiveClass="border-blue-500 bg-blue-500 text-white"
          screens={screens}
          isLoading={isLoading}
          selectedIds={catalogIds}
          selectedScreens={draft.catalogSelectedScreens}
          packSize={draft.catalogPackSize ?? undefined}
          onPackSelect={selectCatalogPack}
          onPackClear={clearCatalogPack}
          onToggleScreen={toggleCatalogScreen}
          flyTo={flyTo}
          minPack={minCatalogPack}
          priceLine={
            quote?.catalogueMonthly != null ? (
              <p className="mt-2 text-sm font-medium text-blue-600">
                {quote.catalogueMonthly.toFixed(2)} €/mois
                <span className="ml-1 text-xs text-muted-foreground">
                  ({quote.pricePerTvCatalogue?.toFixed(2)} €/TV)
                </span>
              </p>
            ) : undefined
          }
          busyIds={busyCatalogIds}
        />
      )}

      {/* Global pricing summary */}
      {quote && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <span className="font-semibold">Récapitulatif tarif</span>
              </div>
              <div className="text-right space-y-0.5">
                {quote.diffusionMonthly != null && (
                  <p className="text-xs text-muted-foreground">
                    Diffusion: {quote.diffusionMonthly.toFixed(2)} €/mois
                  </p>
                )}
                {quote.catalogueMonthly != null && (
                  <p className="text-xs text-muted-foreground">
                    Catalogue: {quote.catalogueMonthly.toFixed(2)} €/mois
                  </p>
                )}
                <p className="text-lg font-bold text-primary">
                  {quote.totalMonthly.toFixed(2)} €/mois
                </p>
                <p className="text-xs text-muted-foreground">
                  Total engagement ({durationMonths} mois) : {quote.totalEngagement.toFixed(2)} €
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {quoteError && (
        <p className="text-sm text-red-500">
          <Info className="mr-1 inline h-4 w-4" />
          {(quoteError as Error).message || 'Erreur de calcul du prix'}
        </p>
      )}

      {/* Pack validation warnings */}
      {diffusionMismatch && (
        <p className="text-sm text-amber-600 font-medium">
          <Info className="mr-1 inline h-4 w-4" />
          Diffusion TV : {draft.selectedScreenIds.length} écrans sélectionnés — veuillez choisir un pack valide ({TV_PACKS.join(', ')})
        </p>
      )}
      {catalogMismatch && (
        <p className="text-sm text-amber-600 font-medium">
          <Info className="mr-1 inline h-4 w-4" />
          Catalogue TV : {draft.catalogSelectedScreenIds.length} écrans sélectionnés — veuillez choisir un pack valide ({TV_PACKS.join(', ')})
        </p>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>Précédent</Button>
        <Button onClick={nextStep} disabled={!canProceed}>Suivant</Button>
      </div>
    </div>
  );
}
