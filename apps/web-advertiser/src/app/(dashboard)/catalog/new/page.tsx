'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, Input, Label, Textarea } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { toast } from 'sonner';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCreateCatalogueItem } from '@/lib/api/hooks/use-catalogue';
import { CatalogueImageUpload } from '@/components/catalogue/catalogue-image-upload';
import { AddressAutocomplete } from '@/components/catalogue/address-autocomplete';

const catalogSchema = z.object({
  title: z.string().min(3, 'Minimum 3 caractères').max(100),
  description: z.string().min(10, 'Minimum 10 caractères').max(500),
  category: z.string().min(1, 'Sélectionnez une catégorie'),
  phone: z.string().min(1, 'Le numéro de téléphone est requis').max(20),
  address: z.string().min(1, "L'adresse est requise").max(200),
  ctaUrl: z.string().url('URL invalide').optional().or(z.literal('')),
  promoCode: z.string().max(20).optional(),
  promoDescription: z.string().max(200).optional(),
  keywords: z.string().optional(),
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

export default function NewCatalogPage() {
  const router = useRouter();
  const createListing = useCreateCatalogueItem();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<CatalogForm>({
    resolver: zodResolver(catalogSchema),
  });

  const addressValue = watch('address') || '';

  async function onSubmit(data: CatalogForm) {
    try {
      const result = await createListing.mutateAsync({
        title: data.title,
        description: data.description,
        category: data.category,
        imageUrl: imageUrl || undefined,
        phone: data.phone,
        address: data.address,
        ctaUrl: data.ctaUrl || undefined,
        promoCode: data.promoCode || undefined,
        promoDescription: data.promoDescription || undefined,
        keywords: data.keywords ? data.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
      });
      toast.success('Fiche catalogue créée !');
      router.push(result?.id ? `/catalog/${result.id}/edit` : '/catalog');
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la création');
    }
  }

  return (
    <>
      <PageHeader
        title="Nouvelle fiche catalogue"
        description="Créez votre fiche pour le catalogue «Découvrir la ville»"
        actions={
          <Link href="/catalog">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          </Link>
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
                <Select onValueChange={(v) => setValue('category', v, { shouldValidate: true })}>
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

              <div className="space-y-2">
                <Label>Image</Label>
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
                  placeholder="10 Rue Philippe Marcombes, 63000 Clermont-Ferrand"
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

              {(watch('promoCode') ?? '').trim() !== '' && (
                <div className="space-y-2">
                  <Label htmlFor="promoDescription">Description du code promo</Label>
                  <Input
                    id="promoDescription"
                    placeholder="-15% sur toute nos carte"
                    {...register('promoDescription')}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="keywords">Mots-clés (séparés par des virgules)</Label>
                <Input id="keywords" placeholder="pain, viennoiserie, artisan" {...register('keywords')} />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push('/catalog')}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting || createListing.isPending}>
                  {createListing.isPending ? 'Création...' : 'Créer la fiche'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
