'use client';

import { use } from 'react';
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
import { useScreen, useUpdateScreen } from '@/hooks/use-screens';
import type { ScreenFormValues } from '@/types/screen.types';

// Seuls les champs qui persistent réellement côté API (sanitize) sont éditables :
// name, usage, address/city/lat/lng, resolution, orientation, monthlyPriceCents.
// Le prix est saisi en euros et converti en cents à l'envoi.
const editSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  usage: z.enum(['AIRBNB', 'COWORKING']),
  address: z.string().min(1, "L'adresse est requise").max(500),
  city: z.string().min(1, 'La ville est requise').max(100),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  resolution: z.string().min(1),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']),
  monthlyPriceEuros: z.coerce.number().nonnegative(),
});

type EditValues = z.infer<typeof editSchema>;

export default function EditScreenPage({
  params,
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = use(params);
  const router = useRouter();
  const { data: screen, isLoading, isError } = useScreen(screenId);
  const updateScreen = useUpdateScreen();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    // La valeur par défaut est réinjectée dès que l'écran est chargé (values=).
    values: screen
      ? {
          name: screen.name ?? '',
          usage: screen.usage ?? 'AIRBNB',
          address: screen.address ?? '',
          city: screen.city ?? '',
          latitude: screen.latitude ?? undefined,
          longitude: screen.longitude ?? undefined,
          resolution: screen.resolution ?? '1920x1080',
          orientation: screen.orientation ?? 'LANDSCAPE',
          monthlyPriceEuros: (screen.monthlyPriceCents ?? 0) / 100,
        }
      : undefined,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (isError || !screen) {
    return <p className="text-sm text-destructive">Écran introuvable.</p>;
  }

  // Garde défensive : un écran en service (activé ET appairé) n'est pas modifiable.
  const isLive = screen.status === 'ACTIVE' && !!screen.activeDeviceId;
  if (isLive) {
    return (
      <div className="space-y-4">
        <PageHeader title="Modification indisponible" description={screen.name}>
          <Button variant="outline" asChild>
            <Link href={`/partner/screens/${screenId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
        </PageHeader>
        <p className="text-sm text-muted-foreground">
          Cet écran est activé et appairé (en diffusion). Il n&apos;est plus modifiable ici.
        </p>
      </div>
    );
  }

  const onSubmit = async (values: EditValues) => {
    const { monthlyPriceEuros, ...rest } = values;
    const data: Partial<ScreenFormValues> = {
      ...rest,
      monthlyPriceCents: Math.round(monthlyPriceEuros * 100),
    };
    await updateScreen.mutateAsync({ id: screenId, data });
    router.push(`/partner/screens/${screenId}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Modifier l'écran" description={screen.name}>
        <Button variant="outline" asChild>
          <Link href={`/partner/screens/${screenId}`}>
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
              <Label htmlFor="name">Nom de l&apos;écran</Label>
              <Input id="name" {...form.register('name')} />
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
                Détermine l&apos;expérience NeoFilm diffusée — et l&apos;app autorisée à l&apos;appairage.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyPriceEuros">Prix mensuel (€)</Label>
              <Input
                id="monthlyPriceEuros"
                type="number"
                step="0.01"
                min="0"
                {...form.register('monthlyPriceEuros')}
              />
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
            <div className="space-y-2">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" {...form.register('city')} />
              {form.formState.errors.city && (
                <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Affichage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="resolution">Résolution</Label>
                <Input id="resolution" placeholder="1920x1080" {...form.register('resolution')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orientation">Orientation</Label>
                <Select
                  value={form.watch('orientation')}
                  onValueChange={(v) =>
                    form.setValue('orientation', v as 'LANDSCAPE' | 'PORTRAIT', {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="orientation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LANDSCAPE">Paysage</SelectItem>
                    <SelectItem value="PORTRAIT">Portrait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={`/partner/screens/${screenId}`}>Annuler</Link>
          </Button>
          <Button type="submit" disabled={updateScreen.isPending}>
            {updateScreen.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
