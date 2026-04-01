'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import { useCreateSite } from '@/hooks/use-sites';
import { usePartnerOrg } from '@/hooks/use-partner-org';

const siteSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  address: z.string().min(1, 'L\'adresse est requise').max(500),
  city: z.string().min(1, 'La ville est requise').max(100),
  postCode: z.string().min(1, 'Le code postal est requis').max(10),
  country: z.string().length(2),
  timezone: z.string().min(1),
  category: z.enum(['cinema', 'hotel', 'conciergerie', 'airbnb', 'restaurant', 'other']),
});

type SiteFormValues = z.infer<typeof siteSchema>;

const CATEGORIES = [
  { value: 'cinema', label: 'Cinéma' },
  { value: 'hotel', label: 'Hôtel' },
  { value: 'conciergerie', label: 'Conciergerie' },
  { value: 'airbnb', label: 'Airbnb / Location courte durée' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'other', label: 'Autre' },
] as const;

interface CreateSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSiteDialog({ open, onOpenChange }: CreateSiteDialogProps) {
  const { orgId } = usePartnerOrg();
  const createSite = useCreateSite(orgId ?? '');

  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: '',
      address: '',
      city: '',
      postCode: '',
      country: 'FR',
      timezone: 'Europe/Paris',
      category: 'hotel',
    },
  });

  const onSubmit = async (values: SiteFormValues) => {
    await createSite.mutateAsync(values);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un site</DialogTitle>
          <DialogDescription>Renseignez les informations de votre nouveau site.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom du site</Label>
            <Input id="name" placeholder="Ex: Hôtel Le Marais" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Catégorie</Label>
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
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" placeholder="15 Rue des Archives, 75004 Paris" {...form.register('address')} />
            {form.formState.errors.address && (
              <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" placeholder="Paris" {...form.register('city')} />
              {form.formState.errors.city && (
                <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="postCode">Code postal</Label>
              <Input id="postCode" placeholder="75004" {...form.register('postCode')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createSite.isPending}>
              {createSite.isPending ? 'Création...' : 'Créer le site'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
