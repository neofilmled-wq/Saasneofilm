'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings, Columns, Link2, RotateCcw, PlayCircle, Power } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@neofilm/ui';
import { toast } from 'sonner';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ScreenDetailOverview } from '@/components/screens/screen-detail-overview';
import { useScreen, useScreenDevice, usePublishScreen, useDisableScreen } from '@/hooks/use-screens';
import { useOrgPermissions } from '@/hooks/use-org-permissions';
import type { ScreenStatusColor } from '@/lib/utils';
import type { ScreenWithStatus } from '@/types/screen.types';

function getScreenStatus(screen: ScreenWithStatus): ScreenStatusColor {
  if (screen.status === 'MAINTENANCE') return 'maintenance';
  if (screen.status === 'INACTIVE') return 'inactive';
  if (!screen.liveStatus) return 'offline';
  if (screen.liveStatus.isOnline && screen.liveStatus.errorCount24h > 5) return 'degraded';
  return screen.liveStatus.isOnline ? 'online' : 'offline';
}

export default function ScreenDetailPage({
  params,
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = use(params);
  const { data: screen, isLoading, isError, refetch } = useScreen(screenId);
  const { data: device } = useScreenDevice(screen?.activeDeviceId);
  const permissions = useOrgPermissions();
  const publishScreen = usePublishScreen();
  const disableScreen = useDisableScreen();
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  if (isLoading) return <LoadingState />;
  if (isError || !screen) return <ErrorState onRetry={() => refetch()} />;

  const status = getScreenStatus(screen);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/partner/screens">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{screen.name}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground">{screen.siteName} · {screen.city}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {screen.status === 'INACTIVE' && permissions.canEditUxSettings && screen.activeDeviceId && (
            <Button
              size="sm"
              disabled={publishScreen.isPending}
              onClick={() => publishScreen.mutate(screenId)}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {publishScreen.isPending ? 'Activation...' : 'Activer l\'écran'}
            </Button>
          )}
          {screen.status === 'ACTIVE' && permissions.canEditUxSettings && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDisableDialog(true)}
            >
              <Power className="mr-2 h-4 w-4" />
              Désactiver l'écran
            </Button>
          )}
          {!screen.activeDeviceId && permissions.canPairDevices && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/partner/screens/${screenId}/pairing`}>
                <Link2 className="mr-2 h-4 w-4" />
                Appairer
              </Link>
            </Button>
          )}
          {permissions.canEditUxSettings && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/partner/screens/${screenId}/ux-settings`}>
                <Settings className="mr-2 h-4 w-4" />
                UX TV
              </Link>
            </Button>
          )}
          {permissions.canEditUxSettings && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/partner/screens/${screenId}/split-screen`}>
                <Columns className="mr-2 h-4 w-4" />
                Split-screen
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="health">Santé</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <ScreenDetailOverview screen={screen} device={device} />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <div className="text-center py-12 text-muted-foreground">
            <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Graphiques de santé détaillés — disponible avec les données temps réel</p>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="text-center py-12 text-muted-foreground">
            <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Historique des diffusions et changements de configuration</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de confirmation désactivation */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver l'écran ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            En désactivant cet écran, aucun annonceur ne pourra y diffuser de publicité.
            Les campagnes actuellement diffusées sur cet écran seront automatiquement transférées sur d'autres écrans disponibles.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisableDialog(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={disableScreen.isPending}
              onClick={async () => {
                try {
                  await disableScreen.mutateAsync(screenId);
                  toast.success('Écran désactivé');
                  setShowDisableDialog(false);
                  refetch();
                } catch {
                  toast.error('Erreur lors de la désactivation');
                }
              }}
            >
              {disableScreen.isPending ? 'Désactivation...' : 'Confirmer la désactivation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
