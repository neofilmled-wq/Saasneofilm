'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, Input, Label, Textarea, Skeleton } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { safeString } from '@/lib/validation';
import {
  useCatalogueListing,
  useUpdateCatalogueItem,
  usePublishCatalogueItem,
  useUnpublishCatalogueItem,
} from '@/lib/api/hooks/use-catalogue';
import { CatalogueImageUpload } from '@/components/catalogue/catalogue-image-upload';
import { AddressAutocomplete } from '@/components/catalogue/address-autocomplete';

const catalogSchema = z.object({
  title: safeString(z.string().min(3, 'Minimum 3 caractères').max(100)),
  description: safeString(z.string().min(10, 'Minimum 10 caractères').max(500)),
  category: z.string().min(1, 'Sélectionnez une catégorie'),
  phone: safeString(z.string().min(1, 'Le numéro de téléphone est requis').max(20)),
  address: safeString(z.string().min(1, "L'adresse est requise").max(200)),
  ctaUrl: z.string().url('URL invalide').optional().or(z.literal('')),
  promoCode: safeString(z.string().max(20)).optional().or(z.literal('')),
  keywords: safeString(z.string()).optional().or(z.literal('')),
});

type CatalogForm = z.infer<typeof catalogSchema>;

const CATEGORIES = [
  { value: 'RESTAURANT', label: 'Restaurant / Café' },
  { value: 'SHOPPING', label: 'Commerce / Boutique' },
  { value: 'SPA', label: 'Beauté / Bien-être' },
  { value: 'CULTURE', label: 'Culture / Loisirs' },
  { value: 'SPORT', label: 'Sport' },
  { value: 'NIGHTLIFE', label: 'Vie nocturne' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'OTHER', label: 'Autre' },
];

export default function EditCatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: listing, isLoading, isError } = useCatalogueListing(id);
  const updateListing = useUpdateCatalogueItem();
  const publish = usePublishCatalogueItem();
  const unpublish = useUnpublishCatalogueItem();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<CatalogForm>({
    resolver: zodResolver(catalogSchema),
  });

  const addressValue = watch('address') || '';
  const categoryValue = watch('category') || '';

  // Pre-fill form once listing is loaded
  useEffect(() => {
    if (listing && !initialized) {
      reset({
        title: listing.title,
        description: listing.description ?? '',
        category: listing.category,
        phone: listing.phone ?? '',
        address: listing.address ?? '',
        ctaUrl: listing.ctaUrl ?? '',
        promoCode: listing.promoCode ?? '',
        keywords: listing.keywords.join(', '),
      });
      setImageUrl(listing.imageUrl ?? null);
      setInitialized(true);
    }
  }, [listing, initialized, reset]);

  async function onSubmit(data: CatalogForm) {
    try {
      await updateListing.mutateAsync({
        id,
        data: {
          title: data.title,
          description: data.description,
          category: data.category,
          imageUrl: imageUrl ?? undefined,
          phone: data.phone,
          address: data.address,
          ctaUrl: data.ctaUrl || undefined,
          promoCode: data.promoCode || undefined,
          keywords: data.keywords ? data.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
        },
      });
      toast.success('Fiche modifiée avec succès');
      router.push('/catalog');
    } catch {
      toast.error('Erreur lors de la modification');
    }
  }

  async function handlePublish() {
    try {
      await publish.mutateAsync(id);
      toast.success('Fiche publiée — diffusion en cours sur les écrans ciblés');
    } catch {
      toast.error('Erreur lors de la publication');
    }
  }

  async function handleUnpublish() {
    try {
      await unpublish.mutateAsync(id);
      toast.success('Fiche mise en pause');
    } catch {
      toast.error('Erreur lors de la mise en pause');
    }
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Modifier la fiche" description="" />
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </>
    );
  }

  if (isError || !listing) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Impossible de charger cette fiche catalogue.</p>
        <Link href="/catalog">
          <Button variant="outline" className="mt-4">Retour au catalogue</Button>
        </Link>
      </div>
    );
  }

  const isBusy = updateListing.isPending || publish.isPending || unpublish.isPending;

  return (
    <>
      <PageHeader
        title={`Modifier : ${listing.title}`}
        description="Modifiez votre fiche catalogue"
        actions={
          <div className="flex gap-2">
            {listing.status === 'ACTIVE' ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-300 text-amber-700"
                onClick={handleUnpublish}
                disabled={isBusy}
              >
                <Pause className="h-4 w-4" /> Suspendre
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handlePublish}
                disabled={isBusy}
              >
                <Play className="h-4 w-4" /> Publier
              </Button>
            )}
            <Link href="/catalog">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Retour
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="space-y-6 p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

              <div className="space-y-2">
                <Label htmlFor="title">Titre de la fiche *</Label>
                <Input id="title" placeholder="Ex: Boulangerie Dupont — Artisan depuis 1982" {...register('title')} />
                {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea id="description" rows={4} placeholder="Décrivez votre activité..." {...register('description')} />
                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Catégorie *</Label>
                <Select
                  key={initialized ? categoryValue : 'loading'}
                  value={categoryValue}
                  onValueChange={(v) => setValue('category', v, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Image de la fiche *</Label>
                <CatalogueImageUpload value={imageUrl} onChange={setImageUrl} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone *</Label>
                <Input id="phone" placeholder="Ex: 01 23 45 67 89" {...register('phone')} />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Adresse *</Label>
                <AddressAutocomplete
                  id="address"
                  value={addressValue}
                  onChange={(val) => setValue('address', val, { shouldValidate: true })}
                  placeholder="10 Rue Philippe Marcombes 63000 Clermont-Ferrand"
                />
                {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ctaUrl">Lien CTA (optionnel)</Label>
                <Input id="ctaUrl" placeholder="https://votre-site.com" {...register('ctaUrl')} />
                {errors.ctaUrl && <p className="text-sm text-destructive">{errors.ctaUrl.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="promoCode">Code promo (optionnel)</Label>
                <Input id="promoCode" placeholder="Ex: NEOFILM10" {...register('promoCode')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">Mots-clés (séparés par des virgules) *</Label>
                <Input id="keywords" placeholder="pain, viennoiserie, artisan" {...register('keywords')} />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push('/catalog')}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting || isBusy}>
                  {updateListing.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
