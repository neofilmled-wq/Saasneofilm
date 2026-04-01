'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Eye } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Checkbox,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { useScreen } from '@/hooks/use-screens';
import { useSplitScreenConfig, useUpdateSplitScreenConfig } from '@/hooks/use-ux-config';

interface SplitFormValues {
  enabled: boolean;
  rightZoneWidthPercent: 25 | 30 | 35;
  power_on: boolean;
  open_app: boolean;
  change_app: boolean;
  catalog_open: boolean;
  adDurationSeconds: number;
}

export default function SplitScreenPage({
  params,
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = use(params);
  const { data: screen } = useScreen(screenId);
  const { data: config, isLoading } = useSplitScreenConfig(screenId);
  const updateConfig = useUpdateSplitScreenConfig();

  const form = useForm<SplitFormValues>({
    defaultValues: {
      enabled: false,
      rightZoneWidthPercent: 30,
      power_on: false,
      open_app: false,
      change_app: false,
      catalog_open: false,
      adDurationSeconds: 20,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        enabled: config.enabled,
        rightZoneWidthPercent: config.rightZoneWidthPercent,
        power_on: config.displayRules.power_on,
        open_app: config.displayRules.open_app,
        change_app: config.displayRules.change_app,
        catalog_open: config.displayRules.catalog_open,
        adDurationSeconds: config.adDurationSeconds,
      });
    }
  }, [config, form]);

  if (isLoading) return <LoadingState />;

  const enabled = form.watch('enabled');
  const widthPercent = form.watch('rightZoneWidthPercent');

  const onSubmit = async (values: SplitFormValues) => {
    await updateConfig.mutateAsync({
      screenId,
      enabled: values.enabled,
      rightZoneWidthPercent: values.rightZoneWidthPercent,
      displayRules: {
        power_on: values.power_on,
        open_app: values.open_app,
        change_app: values.change_app,
        catalog_open: values.catalog_open,
      },
      adDurationSeconds: values.adDurationSeconds,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Split-screen" description={screen?.name ?? ''}>
        <Button variant="outline" asChild>
          <Link href={`/partner/screens/${screenId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
      </PageHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Zone publicitaire</CardTitle>
                    <CardDescription>Activez le mode split-screen pour afficher des annonces</CardDescription>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => form.setValue('enabled', v)}
                  />
                </div>
              </CardHeader>
              {enabled && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Largeur de la zone pub</Label>
                    <Select
                      value={String(widthPercent)}
                      onValueChange={(v) => form.setValue('rightZoneWidthPercent', Number(v) as 25 | 30 | 35)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25% — Discret</SelectItem>
                        <SelectItem value="30">30% — Standard</SelectItem>
                        <SelectItem value="35">35% — Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adDuration">Durée de l'annonce (secondes)</Label>
                    <Input
                      id="adDuration"
                      type="number"
                      min={15}
                      max={30}
                      {...form.register('adDurationSeconds', { valueAsNumber: true })}
                    />
                    <p className="text-xs text-muted-foreground">Entre 15 et 30 secondes</p>
                  </div>
                </CardContent>
              )}
            </Card>

            {enabled && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Déclencheurs d'affichage</CardTitle>
                  <CardDescription>Quand afficher l'annonce en split-screen</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: 'power_on' as const, label: 'Allumage de la TV', desc: 'Au démarrage de l\'appareil' },
                    { key: 'open_app' as const, label: 'Ouverture d\'une app', desc: 'Quand l\'utilisateur ouvre une app' },
                    { key: 'change_app' as const, label: 'Changement d\'app', desc: 'Quand l\'utilisateur change d\'app' },
                    { key: 'catalog_open' as const, label: 'Ouverture du catalogue', desc: 'Quand le catalogue est consulté' },
                  ].map((trigger) => (
                    <div key={trigger.key} className="flex items-center gap-3">
                      <Checkbox
                        checked={form.watch(trigger.key)}
                        onCheckedChange={(v) => form.setValue(trigger.key, !!v)}
                      />
                      <div>
                        <p className="text-sm font-medium">{trigger.label}</p>
                        <p className="text-xs text-muted-foreground">{trigger.desc}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Aperçu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video rounded-lg border-2 border-dashed overflow-hidden flex">
                <div
                  className={cn(
                    'bg-gray-800 flex items-center justify-center transition-all',
                    enabled ? '' : 'w-full',
                  )}
                  style={enabled ? { width: `${100 - widthPercent}%` } : undefined}
                >
                  <div className="text-center text-white/60">
                    <p className="text-xs font-medium">Contenu principal</p>
                    <p className="text-[10px]">IPTV / Streaming / Catalogue</p>
                  </div>
                </div>
                {enabled && (
                  <div
                    className="bg-primary/20 border-l-2 border-primary flex items-center justify-center"
                    style={{ width: `${widthPercent}%` }}
                  >
                    <div className="text-center">
                      <p className="text-xs font-medium text-primary">Zone pub</p>
                      <p className="text-[10px] text-primary/70">{widthPercent}%</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {enabled
                  ? `Split-screen activé — zone pub à ${widthPercent}% à droite`
                  : 'Split-screen désactivé — contenu plein écran'}
              </p>
            </CardContent>
          </Card>
        </div>

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
