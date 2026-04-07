'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { adminApi } from '@/lib/admin-api';
import { toast } from 'sonner';

const screenSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  siteId: z.string().optional(),
  address: z.string().min(1, "L'adresse est requise").max(500),
  city: z.string().min(1, 'La ville est requise').max(100),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  environment: z.string().optional(),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  resolution: z.string().min(1),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']),
});

type ScreenFormValues = z.infer<typeof screenSchema>;

const ENVIRONMENTS = [
  { value: 'HOTEL_LOBBY', label: 'Hall d\'hôtel' },
  { value: 'HOTEL_ROOM', label: 'Chambre d\'hôtel' },
  { value: 'CINEMA', label: 'Cinéma' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'AIRBNB', label: 'Airbnb' },
  { value: 'RETAIL', label: 'Commerce' },
  { value: 'OFFICE', label: 'Bureau' },
  { value: 'OTHER', label: 'Autre' },
];

export default function AdminNewScreenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: partnerData } = useQuery({
    queryKey: ['admin', 'partner-detail', id],
    queryFn: () => adminApi.getAdminPartnerDetail(id),
    enabled: !!id,
  });
  const partner = (partnerData as any)?.data;

  const venuesQuery = useQuery({
    queryKey: ['admin', 'partner-venues', id],
    queryFn: () => adminApi.getPartnerVenues(id),
    enabled: !!id,
  });
  const venues: any[] = (venuesQuery.data as any)?.data ?? [];

  const form = useForm<ScreenFormValues>({
    resolver: zodResolver(screenSchema),
    defaultValues: {
      name: '',
      siteId: '',
      address: '',
      city: '',
      environment: 'OTHER',
      resolution: '1920x1080',
      orientation: 'LANDSCAPE',
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: ScreenFormValues) =>
      adminApi.createScreenForPartner({
        partnerOrgId: id,
        name: values.name,
        siteId: values.siteId || undefined,
        address: values.address || undefined,
        city: values.city || undefined,
        environment: values.environment || undefined,
        latitude: values.latitude || undefined,
        longitude: values.longitude || undefined,
        resolution: values.resolution || undefined,
        orientation: values.orientation || undefined,
      }),
    onSuccess: () => {
      toast.success('Écran créé avec succès');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partner-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
      router.push(`/admin/partners/${id}`);
    },
    onError: () => toast.error("Erreur lors de la création de l'écran"),
  });

  const onSubmit = (values: ScreenFormValues) => {
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/partners/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Ajouter un écran</h1>
          {partner && <p className="text-muted-foreground">{partner.name}</p>}
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom de l'écran *</Label>
              <Input id="name" placeholder="Ex: Lobby Principal" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Site</Label>
              <Select
                value={form.watch('siteId')}
                onValueChange={(v) => {
                  form.setValue('siteId', v);
                  const site = venues.find((s: any) => s.id === v);
                  if (site) {
                    if (site.address) form.setValue('address', `${site.address}${site.city ? ', ' + site.city : ''}`, { shouldValidate: true });
                    if (site.city) form.setValue('city', site.city, { shouldValidate: true });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un site (optionnel)" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} — {v.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Environnement</Label>
              <Select
                value={form.watch('environment')}
                onValueChange={(v) => form.setValue('environment', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emplacement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Adresse complète *</Label>
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
                <Label>Ville *</Label>
                <Input {...form.register('city')} />
                {form.formState.errors.city && (
                  <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input type="number" step="any" {...form.register('latitude')} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input type="number" step="any" {...form.register('longitude')} readOnly className="bg-muted/50" />
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
                <Label>Marque</Label>
                <Input placeholder="Samsung, LG, Sony..." {...form.register('brand')} />
              </div>
              <div className="space-y-2">
                <Label>Modèle</Label>
                <Input placeholder="QE55Q80B" {...form.register('model')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Résolution</Label>
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
            <Link href={`/admin/partners/${id}`}>Annuler</Link>
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Création...' : "Créer l'écran"}
          </Button>
        </div>
      </form>
    </div>
  );
}
