'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Label, Textarea, Button } from '@neofilm/ui';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@neofilm/ui';
import { useCampaignWizard } from '@/stores/campaign-wizard.store';
import { safeString } from '@/lib/validation';
import type { CampaignType } from '@/lib/mock-data';

const CAMPAIGN_TYPES = [
  { value: 'AD_SPOT' as CampaignType, label: 'Spot publicitaire', desc: 'Vidéo 15-30s diffusée sur les écrans TV' },
  { value: 'CATALOG_LISTING' as CampaignType, label: 'Fiche catalogue', desc: 'Présence dans le catalogue "Découvrir la ville"' },
];

const SUBSCRIPTION_DURATIONS = [
  { value: '6' as const, label: '6 mois', desc: 'Abonnement semi-annuel' },
  { value: '12' as const, label: '12 mois', desc: 'Abonnement annuel' },
];

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}


const basicsSchema = z.object({
  name: safeString(z.string().min(3, 'Le nom doit contenir au moins 3 caractères').max(200)),
  description: safeString(z.string().min(10, 'La description doit contenir au moins 10 caractères').max(2000)),
  objective: z.string().min(1, 'Sélectionnez un objectif'),
  category: z.string().min(1, 'Sélectionnez une catégorie'),
  types: z
    .array(z.enum(['AD_SPOT', 'CATALOG_LISTING']))
    .min(1, 'Sélectionnez au moins un type de campagne'),
  startDate: z.string().default(''),
  subscriptionMonths: z.enum(['6', '12'], { required_error: 'Sélectionnez une durée' }),
});

type BasicsForm = z.infer<typeof basicsSchema>;

const OBJECTIVES = [
  { value: 'awareness', label: 'Notoriété' },
  { value: 'traffic', label: 'Trafic en magasin' },
  { value: 'promo', label: 'Promotion / Offre' },
  { value: 'launch', label: 'Lancement produit' },
  { value: 'event', label: 'Événement' },
];

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant / Café' },
  { value: 'retail', label: 'Commerce / Boutique' },
  { value: 'beauty', label: 'Beauté / Bien-être' },
  { value: 'hotel', label: 'Hôtellerie' },
  { value: 'culture', label: 'Culture / Loisirs' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Autre' },
];

export function StepBasics() {
  const { draft, updateDraft, nextStep, editingCampaignId } = useCampaignWizard();
  const isEditing = !!editingCampaignId;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema),
    defaultValues: {
      name: draft.name,
      description: draft.description,
      objective: draft.objective,
      category: draft.category,
      types: draft.types as ('AD_SPOT' | 'CATALOG_LISTING')[],
      startDate: draft.startDate || getTodayString(),
      subscriptionMonths: String(draft.subscriptionMonths || 6) as '6' | '12',
    },
  });

  const selectedTypes = watch('types') ?? [];
  const subscriptionMonths = watch('subscriptionMonths');

  function toggleType(value: 'AD_SPOT' | 'CATALOG_LISTING') {
    const current = selectedTypes;
    const next = current.includes(value)
      ? current.filter((t) => t !== value)
      : [...current, value];
    setValue('types', next, { shouldValidate: true });
  }

  function onSubmit(data: BasicsForm) {
    const computedEndDate = addMonths(data.startDate, parseInt(data.subscriptionMonths));
    updateDraft({
      ...data,
      types: data.types as CampaignType[],
      subscriptionMonths: parseInt(data.subscriptionMonths) as 6 | 12,
      endDate: computedEndDate,
    });
    nextStep();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <h2 className="text-xl font-semibold">Informations de la campagne</h2>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Nom de la campagne *</Label>
        <Input id="name" placeholder="Ex: Promo été boulangerie" disabled={isEditing} {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea id="description" placeholder="Décrivez votre campagne..." rows={3} disabled={isEditing} {...register('description')} />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>

      {/* Objective + Category row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Objectif *</Label>
          <Select value={watch('objective')} onValueChange={(v) => setValue('objective', v, { shouldValidate: true })} disabled={isEditing}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner..." />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVES.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.objective && <p className="text-sm text-destructive">{errors.objective.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Catégorie *</Label>
          <Select value={watch('category')} onValueChange={(v) => setValue('category', v, { shouldValidate: true })} disabled={isEditing}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner..." />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
        </div>
      </div>

      {/* Campaign Types — multi-select toggle cards */}
      <div className="space-y-2">
        <Label>Type de campagne * <span className="text-muted-foreground font-normal text-xs">(1 ou 2)</span></Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPAIGN_TYPES.map((opt) => {
            const isSelected = selectedTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isEditing}
                onClick={() => toggleType(opt.value)}
                className={`text-left rounded-lg border-2 p-4 transition-colors ${
                  isEditing ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : errors.types
                      ? 'border-destructive/50 hover:border-destructive/70'
                      : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <p className="font-medium">{opt.label}</p>
                <p className="text-sm text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>
        {errors.types && (
          <p className="text-sm text-destructive">{errors.types.message}</p>
        )}
      </div>

      {/* Durée d'abonnement */}
      <input type="hidden" {...register('startDate')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Durée de l'abonnement *</Label>
          <div className="grid grid-cols-2 gap-2">
            {SUBSCRIPTION_DURATIONS.map((opt) => {
              const isSelected = subscriptionMonths === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isEditing}
                  onClick={() => setValue('subscriptionMonths', opt.value, { shouldValidate: true })}
                  className={`text-left rounded-lg border-2 p-3 transition-colors ${
                    isEditing ? 'opacity-60 cursor-not-allowed' : ''
                  } ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : errors.subscriptionMonths
                        ? 'border-destructive/50 hover:border-destructive/70'
                        : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              );
            })}
          </div>
          {errors.subscriptionMonths && (
            <p className="text-sm text-destructive">{errors.subscriptionMonths.message}</p>
          )}
        </div>
      </div>


      <div className="flex justify-end">
        <Button type="submit">Suivant</Button>
      </div>
    </form>
  );
}
