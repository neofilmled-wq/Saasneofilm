'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Upload, CheckCircle2, Clock } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@neofilm/ui';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { useScreen } from '@/hooks/use-screens';
import { useUxConfig, useUpdateUxConfig, usePushConfig } from '@/hooks/use-ux-config';
import { formatRelative } from '@/lib/utils';

interface UxFormValues {
  catalogEnabled: boolean;
  defaultHomeSection: 'iptv' | 'streaming' | 'catalog';
  language: 'fr' | 'en';
  adFrequencyMinutes: number;
}

export default function UxSettingsPage({
  params,
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = use(params);
  const { data: screen } = useScreen(screenId);
  const { data: config, isLoading } = useUxConfig(screenId);
  const updateConfig = useUpdateUxConfig();
  const pushConfig = usePushConfig();

  const form = useForm<UxFormValues>({
    defaultValues: {
      catalogEnabled: true,
      defaultHomeSection: 'iptv',
      language: 'fr',
      adFrequencyMinutes: 5,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        catalogEnabled: config.catalogEnabled,
        defaultHomeSection: config.defaultHomeSection,
        language: config.language,
        adFrequencyMinutes: config.adFrequencyMinutes,
      });
    }
  }, [config, form]);

  if (isLoading) return <LoadingState />;

  const onSubmit = async (values: UxFormValues) => {
    await updateConfig.mutateAsync({ screenId, ...values });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Configuration UX TV" description={screen?.name ?? ''}>
        <Button variant="outline" asChild>
          <Link href={`/partner/screens/${screenId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
      </PageHeader>

      {config?.pendingVersion && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Mise à jour en attente</p>
              <p className="text-xs text-amber-700">
                Version actuelle : {config.currentVersionOnDevice} → Version en attente : {config.pendingVersion}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => pushConfig.mutate({ screenId, deviceId: screen?.activeDeviceId ?? '' })}
              disabled={pushConfig.isPending || !screen?.activeDeviceId}
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              {pushConfig.isPending ? 'Envoi...' : 'Pousser maintenant'}
            </Button>
          </CardContent>
        </Card>
      )}

      {config && !config.pendingVersion && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm text-emerald-900">
              L'appareil est à jour — {config.currentVersionOnDevice}
              {config.lastPushedAt && (
                <span className="text-emerald-700"> · Poussé {formatRelative(config.lastPushedAt)}</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contenu</CardTitle>
            <CardDescription>Contrôlez ce qui est affiché sur la TV</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Catalogue activé</Label>
                <p className="text-xs text-muted-foreground">Permet aux utilisateurs de parcourir le catalogue</p>
              </div>
              <Switch
                checked={form.watch('catalogEnabled')}
                onCheckedChange={(v) => form.setValue('catalogEnabled', v)}
              />
            </div>

            <div className="space-y-2">
              <Label>Section d'accueil par défaut</Label>
              <Select
                value={form.watch('defaultHomeSection')}
                onValueChange={(v) => form.setValue('defaultHomeSection', v as UxFormValues['defaultHomeSection'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iptv">IPTV</SelectItem>
                  <SelectItem value="streaming">Streaming</SelectItem>
                  <SelectItem value="catalog">Catalogue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Langue par défaut</Label>
              <Select
                value={form.watch('language')}
                onValueChange={(v) => form.setValue('language', v as 'fr' | 'en')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicité</CardTitle>
            <CardDescription>Paramètres de fréquence des annonces</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="adFrequency">Fréquence des annonces (minutes)</Label>
              <Input
                id="adFrequency"
                type="number"
                min={1}
                max={30}
                {...form.register('adFrequencyMinutes', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Une annonce sera affichée toutes les {form.watch('adFrequencyMinutes')} minutes
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={`/partner/screens/${screenId}`}>Annuler</Link>
          </Button>
          <Button type="submit" disabled={updateConfig.isPending}>
            {updateConfig.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </form>
    </div>
  );
}
