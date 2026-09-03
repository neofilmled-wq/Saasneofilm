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
  // Site now optional — a partner may want to register an isolated screen
  // that isn't part of a site group yet.
  siteId: z.string().optional(),
  address: z.string().min(1, 'L\'adresse est requise').max(500),
  city: z.string().min(1, 'La ville est requise').max(100),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  // Which NeoFilm experience this TV runs — Airbnb (legacy app) vs Coworking.
  usage: z.enum(['AIRBNB', 'COWORKING']),
  // Hardware / commercial fields are set to sensible defaults on submit —
  // partners edit them later from the screen detail page. Keeps this form
  // to the two useful decisions: "which site?" + "where is it?".
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
      usage: 'AIRBNB',
      type: 'smartTV',
      resolution: '1920x1080',
      orientation: 'LANDSCAPE',
      monthlyPriceCents: 0,
    },
  });

  const onSubmit = async (values: ScreenFormValues) => {
    if (!orgId) return;
    const screen = await createScreen.mutateAsync({
      ...values,
      // Empty siteId → send undefined so the API doesn't try to resolve a
      // non-existent relation (screens can be orphaned by design).
      siteId: values.siteId?.trim() ? values.siteId : undefined,
      partnerOrgId: orgId,
    });
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
              <Label htmlFor="usage">Type d&apos;écran</Label>
              <Select
                value={form.watch('usage')}
                onValueChange={(v) =>
                  form.setValue('usage', v as 'AIRBNB' | 'COWORKING', { shouldValidate: true })
                }
              >
                <SelectTrigger id="usage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AIRBNB">Airbnb / Location courte durée</SelectItem>
                  <SelectItem value="COWORKING">Coworking</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Détermine l&apos;expérience NeoFilm diffusée sur cette TV.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="siteId">Site (optionnel)</Label>
              <Select
                value={form.watch('siteId') || '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    form.setValue('siteId', '');
                    // Wipe the location too — the fields the user sees below
                    // came from the previously-selected site, keeping them
                    // would carry over a wrong address.
                    form.setValue('address', '', { shouldValidate: true });
                    form.setValue('city', '', { shouldValidate: true });
                    form.setValue('latitude', undefined);
                    form.setValue('longitude', undefined);
                    return;
                  }
                  form.setValue('siteId', v);
                  const site = sites?.find((s) => s.id === v);
                  if (site) {
                    form.setValue(
                      'address',
                      [site.address, site.postCode, site.city].filter(Boolean).join(', '),
                      { shouldValidate: true },
                    );
                    form.setValue('city', site.city ?? '', { shouldValidate: true });
                    // Sites don't carry lat/lng — clear the geo coords so we
                    // don't leave a stale pin from a previous manual entry.
                    form.setValue('latitude', undefined);
                    form.setValue('longitude', undefined);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun site — écran isolé" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun site — écran isolé</SelectItem>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name} — {site.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.watch('siteId') && (
                <p className="text-xs text-muted-foreground">
                  L&apos;emplacement est repris du site sélectionné et non modifiable ici. Pour
                  changer l&apos;adresse, éditez la fiche du site.
                </p>
              )}
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emplacement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const hasSite = !!form.watch('siteId');
              return (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="address">Adresse complète</Label>
                    {hasSite ? (
                      <Input
                        id="address"
                        value={form.watch('address') ?? ''}
                        readOnly
                        className="bg-muted/50 cursor-not-allowed"
                      />
                    ) : (
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
                    )}
                    {form.formState.errors.address && (
                      <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Ville</Label>
                      <Input
                        id="city"
                        {...form.register('city')}
                        readOnly={hasSite}
                        className={hasSite ? 'bg-muted/50 cursor-not-allowed' : undefined}
                      />
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
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Section Matériel retirée — les champs (marque/modèle/résolution
             /orientation/prix mensuel) partent avec des valeurs par défaut à
             la création et se règlent depuis la fiche écran ensuite. */}

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
