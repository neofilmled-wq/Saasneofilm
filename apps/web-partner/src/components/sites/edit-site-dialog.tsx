'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AddressAutocomplete,
} from '@neofilm/ui';
import type { AddressSelection } from '@neofilm/ui';
import { useUpdateSite } from '@/hooks/use-sites';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import type { Venue } from '@/hooks/use-sites';

const siteSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  address: z.string().min(1, "L'adresse est requise").max(500),
  city: z.string().min(1, 'La ville est requise').max(100),
  postCode: z.string().min(1, 'Le code postal est requis').max(10),
  country: z.string().length(2),
  timezone: z.string().min(1),
  category: z.enum(['HOTEL', 'CONCIERGERIE', 'AIRBNB', 'RESTAURANT', 'OTHER']),
});

type SiteFormValues = z.infer<typeof siteSchema>;

const CATEGORIES = [
  { value: 'HOTEL', label: 'Hôtel' },
  { value: 'CONCIERGERIE', label: 'Conciergerie' },
  { value: 'AIRBNB', label: 'Airbnb / Location courte durée' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'OTHER', label: 'Autre' },
] as const;

interface EditSiteDialogProps {
  site: Venue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditSiteDialog({ site, open, onOpenChange }: EditSiteDialogProps) {
  const { orgId } = usePartnerOrg();
  const updateSite = useUpdateSite(orgId!);

  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: '',
      address: '',
      city: '',
      postCode: '',
      country: 'FR',
      timezone: 'Europe/Paris',
      category: 'HOTEL',
    },
  });

  useEffect(() => {
    if (site && open) {
      form.reset({
        name: site.name,
        address: site.address ?? '',
        city: site.city ?? '',
        postCode: site.postCode ?? '',
        country: site.country ?? 'FR',
        timezone: site.timezone ?? 'Europe/Paris',
        category: site.category,
      });
    }
  }, [site, open, form]);

  const onSubmit = async (values: SiteFormValues) => {
    if (!site) return;
    await updateSite.mutateAsync({ id: site.id, data: values });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le site</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nom du site</Label>
            <Input id="edit-name" placeholder="Ex: Hôtel Le Marais" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category">Catégorie</Label>
            <Select
              value={form.watch('category')}
              onValueChange={(v) => form.setValue('category', v as SiteFormValues['category'])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Adresse</Label>
            <AddressAutocomplete
              value={form.watch('address')}
              onChange={(v) => form.setValue('address', v, { shouldValidate: true })}
              onSelect={(sel: AddressSelection) => {
                form.setValue('address', sel.label, { shouldValidate: true });
                if (sel.city) form.setValue('city', sel.city, { shouldValidate: true });
                if (sel.postcode) form.setValue('postCode', sel.postcode, { shouldValidate: true });
              }}
              placeholder="15 Rue des Archives, 75004 Paris"
            />
            {form.formState.errors.address && (
              <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-city">Ville</Label>
              <Input id="edit-city" placeholder="Paris" {...form.register('city')} />
              {form.formState.errors.city && (
                <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-postCode">Code postal</Label>
              <Input id="edit-postCode" placeholder="75004" {...form.register('postCode')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={updateSite.isPending}>
              {updateSite.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
