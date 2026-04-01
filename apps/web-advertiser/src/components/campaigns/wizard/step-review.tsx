'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Film, CreditCard, AlertCircle, Pencil, Tv, BookOpen } from 'lucide-react';
import { Button, Card, CardContent, Checkbox } from '@neofilm/ui';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';
import { useUpdateCampaign } from '@/lib/api/hooks/use-campaigns';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { formatDate } from '@/lib/utils';

interface PricingQuote {
  diffusionMonthly: number | null;
  catalogueMonthly: number | null;
  totalMonthly: number;
  totalEngagement: number;
  pricePerTvDiffusion: number | null;
  pricePerTvCatalogue: number | null;
  durationMonths: number;
}

export function StepReview() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, updateDraft, setStep, reset, prevStep, editingCampaignId } = useCampaignWizard();
  const updateCampaign = useUpdateCampaign();
  const isEditing = !!editingCampaignId;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAdSpot = draft.types.includes('AD_SPOT');
  const hasCatalog = draft.types.includes('CATALOG_LISTING');

  // Re-fetch pricing quote using the same params as step 3
  const diffusionTvCount = draft.packSize ?? undefined;
  const catalogueTvCount = draft.catalogPackSize ?? undefined;
  const durationMonths = draft.subscriptionMonths ?? 6;

  const params = new URLSearchParams();
  if (diffusionTvCount) params.set('diffusionTvCount', String(diffusionTvCount));
  if (catalogueTvCount) params.set('catalogueTvCount', String(catalogueTvCount));
  params.set('durationMonths', String(durationMonths));

  const { data: quote } = useQuery<PricingQuote>({
    queryKey: ['pricing', diffusionTvCount, catalogueTvCount, durationMonths],
    queryFn: () => apiFetch(`/pricing/compute?${params.toString()}`),
    enabled: !!(diffusionTvCount || catalogueTvCount),
  });

  // City breakdown for diffusion screens
  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    draft.selectedScreens.forEach((s) => {
      map.set(s.city, (map.get(s.city) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [draft.selectedScreens]);

  const catalogCityCounts = useMemo(() => {
    const map = new Map<string, number>();
    draft.catalogSelectedScreens.forEach((s) => {
      map.set(s.city, (map.get(s.city) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [draft.catalogSelectedScreens]);

  const bothTypes = hasAdSpot && hasCatalog;

  async function createCampaigns(nameOverride?: string) {
    const baseName = nameOverride ?? draft.name;
    const groupId = bothTypes ? crypto.randomUUID() : undefined;

    const diffusionBudget = quote?.diffusionMonthly != null ? Math.round(quote.diffusionMonthly * 100) : 0;
    const catalogBudget = quote?.catalogueMonthly != null ? Math.round(quote.catalogueMonthly * 100) : 0;
    const totalBudget = quote ? Math.round(quote.totalMonthly * 100) : 0;

    // Single atomic API call — server does everything in one Prisma transaction
    const payload: Record<string, any> = {
      name: baseName,
      description: draft.description,
      objective: draft.objective || undefined,
      category: draft.category || undefined,
      durationMonths,
      groupId,
      advertiserOrgId: user?.orgId,
    };

    if (hasAdSpot) {
      payload.adSpot = {
        budgetCents: bothTypes ? diffusionBudget : totalBudget,
        selectedScreenIds: draft.selectedScreenIds,
        ...(draft.mediaFileUrl ? {
          video: {
            name: baseName,
            fileUrl: draft.mediaFileUrl,
            mimeType: 'video/mp4',
            durationMs: draft.mediaDurationMs ?? undefined,
          },
        } : {}),
      };
    }

    if (hasCatalog) {
      payload.catalog = {
        budgetCents: bothTypes ? catalogBudget : totalBudget,
        selectedScreenIds: draft.catalogSelectedScreenIds,
        ...(draft.catalogImageFileUrl ? {
          image: {
            name: baseName,
            fileUrl: draft.catalogImageFileUrl,
            mimeType: 'image/jpeg',
          },
        } : {}),
        ...(draft.catalogTitle ? {
          listing: {
            title: draft.catalogTitle,
            description: draft.catalogDescription || undefined,
            category: draft.catalogCategory || 'OTHER',
            imageUrl: draft.catalogImageFileUrl || undefined,
            ctaUrl: draft.catalogCtaUrl || undefined,
            promoCode: draft.catalogPromoCode || undefined,
            phone: draft.catalogPhone,
            address: draft.catalogAddress,
            keywords: draft.catalogKeywords
              ? draft.catalogKeywords.split(',').map((k: string) => k.trim()).filter(Boolean)
              : [],
          },
        } : {}),
      };
    }

    const result = await apiFetch<{ firstId?: string }>('/campaigns/create-full', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return result?.firstId;
  }

  async function handleSubmit() {
    if (!isEditing && !draft.agreedToTerms) {
      toast.error('Veuillez accepter les conditions générales');
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateCampaign.mutateAsync({ id: editingCampaignId!, data: {
          name: draft.name,
          description: draft.description,
          startDate: draft.startDate,
          endDate: draft.endDate,
          selectedScreenIds: draft.selectedScreenIds,
        }});
        toast.success('Campagne modifiée avec succès.');
        reset();
        router.push(`/campaigns/${editingCampaignId}`);
      } else {
        const firstId = await createCampaigns();
        toast.success('Campagne soumise pour vérification ! Vous serez notifié une fois validée.');
        reset();
        router.push(firstId ? `/campaigns/${firstId}` : '/campaigns');
      }
    } catch (err: any) {
      console.error('Campaign creation error:', err);
      toast.error(isEditing ? 'Erreur lors de la modification' : `Erreur lors de la création : ${err?.message ?? 'erreur inconnue'}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveDraft() {
    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateCampaign.mutateAsync({ id: editingCampaignId!, data: { name: draft.name || 'Brouillon sans nom', description: draft.description } });
        toast.success('Modifications enregistrées');
        reset();
        router.push(`/campaigns/${editingCampaignId}`);
      } else {
        const firstId = await createCampaigns(draft.name || 'Brouillon sans nom');
        toast.success('Brouillon enregistré');
        reset();
        router.push(firstId ? `/campaigns/${firstId}` : '/campaigns');
      }
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Validation checks
  const checks = [
    { ok: !!draft.name, label: 'Nom de campagne renseigné' },
    { ok: draft.types.length > 0, label: 'Type de campagne sélectionné' },
    { ok: !hasAdSpot || draft.mediaStatus === 'ready', label: 'Vidéo uploadée et prête' },
    { ok: !hasCatalog || draft.catalogImageStatus === 'ready', label: 'Image catalogue uploadée' },
    { ok: !hasCatalog || (draft.catalogTitle.trim().length >= 3 && draft.catalogCategory.length > 0 && draft.catalogPhone.trim().length > 0 && draft.catalogAddress.trim().length > 0 && draft.catalogKeywords.trim().length > 0), label: 'Fiche catalogue renseignée' },
    { ok: !hasAdSpot || draft.selectedScreenIds.length > 0, label: 'Écrans diffusion sélectionnés' },
    { ok: !hasCatalog || draft.catalogSelectedScreenIds.length > 0, label: 'Écrans catalogue sélectionnés' },
  ].filter((c) => {
    // Only show relevant checks
    if (c.label.includes('Vidéo') && !hasAdSpot) return false;
    if (c.label.includes('catalogue') && !hasCatalog) return false;
    if (c.label.includes('diffusion') && !hasAdSpot) return false;
    return true;
  });

  const allChecksPass = checks.every((c) => c.ok);

  const typeLabels = draft.types.map((t) =>
    t === 'AD_SPOT' ? 'Spot publicitaire' : 'Fiche catalogue',
  ).join(' + ');

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Validation et soumission</h2>

      {/* Validation checklist */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 font-medium">Vérifications</h3>
          <ul className="space-y-2">
            {checks.map((check, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {check.ok ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className={check.ok ? '' : 'text-amber-600'}>{check.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Campaign summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Basics */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-medium">
                <Film className="h-4 w-4" /> Campagne
              </h3>
              <button onClick={() => setStep(0)} className="text-xs text-primary hover:underline">
                <Pencil className="mr-1 inline h-3 w-3" /> Modifier
              </button>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Nom</dt>
                <dd className="font-medium">{draft.name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{typeLabels || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Abonnement</dt>
                <dd>{durationMonths} mois</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Dates</dt>
                <dd className="text-muted-foreground text-xs">Définies après validation et paiement</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Media */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-medium">
                <Film className="h-4 w-4" /> Média
              </h3>
              <button onClick={() => setStep(1)} className="text-xs text-primary hover:underline">
                <Pencil className="mr-1 inline h-3 w-3" /> Modifier
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {hasAdSpot && (
                <div className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-primary" />
                  {draft.mediaUrl ? (
                    <span className="text-green-600 font-medium">Vidéo prête</span>
                  ) : (
                    <span className="text-amber-600">Aucune vidéo</span>
                  )}
                </div>
              )}
              {hasCatalog && (
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  {draft.catalogImageUrl ? (
                    <span className="text-green-600 font-medium">Image catalogue prête</span>
                  ) : (
                    <span className="text-amber-600">Aucune image</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Fiche catalogue summary */}
        {hasCatalog && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-medium">
                  <BookOpen className="h-4 w-4 text-blue-500" /> Fiche catalogue
                </h3>
                <button onClick={() => setStep(hasCatalog && hasAdSpot ? 2 : 2)} className="text-xs text-primary hover:underline">
                  <Pencil className="mr-1 inline h-3 w-3" /> Modifier
                </button>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Titre</dt>
                  <dd className="font-medium">{draft.catalogTitle || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Catégorie</dt>
                  <dd>{draft.catalogCategory || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Téléphone</dt>
                  <dd>{draft.catalogPhone || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Adresse</dt>
                  <dd>{draft.catalogAddress || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Mots-clés</dt>
                  <dd>{draft.catalogKeywords || '—'}</dd>
                </div>
                {draft.catalogPromoCode && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Code promo</dt>
                    <dd>{draft.catalogPromoCode}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Targeting — Diffusion */}
        {hasAdSpot && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-medium">
                  <Tv className="h-4 w-4 text-primary" /> Diffusion TV
                </h3>
                <button onClick={() => setStep(2)} className="text-xs text-primary hover:underline">
                  <Pencil className="mr-1 inline h-3 w-3" /> Modifier
                </button>
              </div>
              <p className="text-sm font-medium">{draft.selectedScreenIds.length} écrans</p>
              {quote?.diffusionMonthly != null && (
                <p className="text-sm text-primary font-semibold mt-1">
                  {quote.diffusionMonthly.toFixed(2)} €/mois
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {cityCounts.slice(0, 4).map(([city, count]) => (
                  <span key={city} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {city} ({count})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Targeting — Catalogue */}
        {hasCatalog && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-medium">
                  <BookOpen className="h-4 w-4 text-blue-500" /> Catalogue TV
                </h3>
                <button onClick={() => setStep(2)} className="text-xs text-primary hover:underline">
                  <Pencil className="mr-1 inline h-3 w-3" /> Modifier
                </button>
              </div>
              <p className="text-sm font-medium">{draft.catalogSelectedScreenIds.length} écrans</p>
              {quote?.catalogueMonthly != null && (
                <p className="text-sm text-blue-600 font-semibold mt-1">
                  {quote.catalogueMonthly.toFixed(2)} €/mois
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {catalogCityCounts.slice(0, 4).map(([city, count]) => (
                  <span key={city} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {city} ({count})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Price summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Abonnement mensuel</p>
                <p className="text-sm text-muted-foreground">
                  Engagement {durationMonths} mois — Renouvellement automatique
                </p>
              </div>
            </div>
            <div className="text-right">
              {quote ? (
                <>
                  <p className="text-2xl font-bold text-primary">
                    {quote.totalMonthly.toFixed(2)} €/mois
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total : {quote.totalEngagement.toFixed(2)} €
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Calcul en cours...</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms */}
      {!isEditing && (
        <label className="flex items-start gap-3">
          <Checkbox
            checked={draft.agreedToTerms}
            onCheckedChange={(checked) => updateDraft({ agreedToTerms: !!checked })}
            className="mt-0.5"
          />
          <span className="text-sm text-muted-foreground">
            J&apos;accepte les{' '}
            <a href="#" className="text-primary underline">conditions générales de vente</a>{' '}
            et la{' '}
            <a href="#" className="text-primary underline">politique de confidentialité</a>.
          </span>
        </label>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>Précédent</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={isSubmitting}>
            {isEditing ? 'Enregistrer les modifications' : 'Enregistrer en brouillon'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isEditing ? isSubmitting : (!allChecksPass || !draft.agreedToTerms || isSubmitting)}
          >
            {isSubmitting
              ? (isEditing ? 'Enregistrement...' : 'Soumission...')
              : (isEditing ? 'Sauvegarder' : 'Soumettre pour validation')}
          </Button>
        </div>
      </div>
    </div>
  );
}
