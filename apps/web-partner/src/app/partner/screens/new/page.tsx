'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AddressAutocomplete,
} from '@neofilm/ui';
import type { AddressSelection } from '@neofilm/ui';
import { PageHeader } from '@/components/ui/page-header';
import { useCreateScreen } from '@/hooks/use-screens';
import { useSites } from '@/hooks/use-sites';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import type { ScreenFormValues } from '@/types/screen.types';

const screenSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  siteId: z.string().min(1, 'Le site est requis'),
  address: z.string().min(1, 'L\'adresse est requise').max(500),
  city: z.string().min(1, 'La ville est requise').max(100),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  type: z.enum(['smartTV', 'nonSmartTV']),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  resolution: z.string().min(1),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']),
  monthlyPriceCents: z.coerce.number().int().nonnegative(),
});

export default function NewScreenPage() {
  const router = useRouter();
  const { orgId } = usePartnerOrg();
  const { data: sites } = useSites(orgId!);
  const createScreen = useCreateScreen();

  const form = useForm<ScreenFormValues>({
    resolver: zodResolver(screenSchema),
    defaultValues: {
      name: '',
      siteId: '',
      address: '',
      city: '',
      type: 'smartTV',
      resolution: '1920x1080',
      orientation: 'LANDSCAPE',
      monthlyPriceCents: 0,
    },
  });

  const onSubmit = async (values: ScreenFormValues) => {
    if (!orgId) return;
    const screen = await createScreen.mutateAsync({ ...values, partnerOrgId: orgId });
    router.push(`/partner/screens/${screen.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Ajouter un écran">
        <Button variant="outline" asChild>
          <Link href="/partner/screens">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
      </PageHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom de l'écran</Label>
              <Input id="name" placeholder="Ex: Lobby Principal" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="siteId">Site</Label>
              <Select
                value={form.watch('siteId')}
                onValueChange={(v) => {
                  form.setValue('siteId', v);
                  const site = sites?.find((s) => s.id === v);
                  if (site) {
                    form.setValue('address', `${site.address}, ${site.postCode} ${site.city}`);
                    form.setValue('city', site.city);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un site" />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name} — {site.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.siteId && (
                <p className="text-sm text-destructive">{form.formState.errors.siteId.message}</p>
              )}
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emplacement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address">Adresse complète</Label>
              <AddressAutocomplete
                value={form.watch('address')}
                onChange={(v) => form.setValue('address', v, { shouldValidate: true })}
                onSelect={(sel: AddressSelection) => {
                  form.setValue('address', sel.label, { shouldValidate: true });
                  if (sel.city) form.setValue('city', sel.city, { shouldValidate: true });
                  form.setValue('latitude', sel.lat);
                  form.setValue('longitude', sel.lng);
                }}
                placeholder="15 Rue des Archives, 75004 Paris"
              />
              {form.formState.errors.address && (
                <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" {...form.register('city')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" type="number" step="any" {...form.register('latitude')} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" type="number" step="any" {...form.register('longitude')} readOnly className="bg-muted/50" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matériel (optionnel)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Marque</Label>
                <Input id="brand" placeholder="Samsung, LG, Sony..." {...form.register('brand')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Modèle</Label>
                <Input id="model" placeholder="QE55Q80B" {...form.register('model')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolution">Résolution</Label>
              <Select
                value={form.watch('resolution')}
                onValueChange={(v) => form.setValue('resolution', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1920x1080">Full HD (1920x1080)</SelectItem>
                  <SelectItem value="3840x2160">4K UHD (3840x2160)</SelectItem>
                  <SelectItem value="1280x720">HD (1280x720)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/partner/screens">Annuler</Link>
          </Button>
          <Button type="submit" disabled={createScreen.isPending}>
            {createScreen.isPending ? 'Création...' : 'Créer l\'écran'}
          </Button>
        </div>
      </form>
    </div>
  );
}
