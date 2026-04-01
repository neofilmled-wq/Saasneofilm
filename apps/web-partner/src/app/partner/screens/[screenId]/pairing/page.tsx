'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Smartphone, Tv, CheckCircle2, Loader2, ShieldOff, MonitorSmartphone } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { useScreen, useScreenDevice } from '@/hooks/use-screens';
import { useConfirmPairing, useRevokeDevice } from '@/hooks/use-device-pairing';
import { useAuth } from '@/providers/auth-provider';
import { formatRelative } from '@/lib/utils';

type PairingStep = 'select_type' | 'enter_pin' | 'success';

export default function PairingPage({
  params,
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = use(params);
  const { user } = useAuth();
  const { data: screen, isLoading } = useScreen(screenId);
  const { data: device } = useScreenDevice(screen?.activeDeviceId);
  const confirmPairing = useConfirmPairing();
  const revokeDevice = useRevokeDevice();

  const [step, setStep] = useState<PairingStep>('enter_pin');
  const [deviceType, setDeviceType] = useState<'android_stick' | 'smart_tv_app'>('android_stick');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [revokeOpen, setRevokeOpen] = useState(false);

  if (isLoading) return <LoadingState />;
  if (!screen) return <ErrorState />;

  const handleSelectType = (type: 'android_stick' | 'smart_tv_app') => {
    setDeviceType(type);
    setPin('');
    setPinError('');
    setStep('enter_pin');
  };

  const handleConfirm = async () => {
    if (!pin.match(/^\d{6}$/)) {
      setPinError('Le code PIN doit être composé de 6 chiffres.');
      return;
    }
    setPinError('');
    try {
      await confirmPairing.mutateAsync({ pin, screenId, partnerOrgId: user?.orgId ?? '' });
      setStep('success');
    } catch (err: any) {
      setPinError(err.message ?? 'Code PIN invalide ou expiré.');
    }
  };

  const hasDevice = !!device;
  const steps: PairingStep[] = ['select_type', 'enter_pin', 'success'];

  return (
    <div className="space-y-6">
      <PageHeader title="Appairage de l'appareil" description={screen.name}>
        <Button variant="outline" asChild>
          <Link href={`/partner/screens/${screenId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
      </PageHeader>

      {hasDevice && step === 'select_type' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appareil actuel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-mono text-sm">{device.serialNumber}</p>
                <p className="text-xs text-muted-foreground">
                  Appairé {device.pairedAt ? formatRelative(device.pairedAt) : ''}
                </p>
                <StatusBadge status={device.status === 'ONLINE' ? 'online' : 'offline'} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleSelectType(deviceType)}>
                  Remplacer l'appareil
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setRevokeOpen(true)}>
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Révoquer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step progress */}
      <div className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <div
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : steps.indexOf(step) > i
                  ? 'bg-primary/20 text-primary'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {i + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Step 1 — Select device type */}
      {step === 'select_type' && !hasDevice && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => handleSelectType('android_stick')}
          >
            <CardContent className="p-6 text-center">
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle className="text-base mb-2">Android Stick</CardTitle>
              <CardDescription>
                Branchez un stick Android (Xiaomi, Fire TV, etc.) sur votre TV
              </CardDescription>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => handleSelectType('smart_tv_app')}
          >
            <CardContent className="p-6 text-center">
              <Tv className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle className="text-base mb-2">Smart TV App</CardTitle>
              <CardDescription>
                Installez l'app NeoFilm directement sur votre Smart TV
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2 — Enter PIN shown on TV */}
      {step === 'enter_pin' && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MonitorSmartphone className="h-5 w-5" />
              {deviceType === 'android_stick' ? 'Android Stick' : 'Smart TV App'} — Entrez le code PIN
            </CardTitle>
            <CardDescription>
              Démarrez l'application NeoFilm sur votre appareil. Un code PIN à 6 chiffres s'affiche à l'écran.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
              <li>Allumez l'appareil et connectez-le au Wi-Fi</li>
              <li>Ouvrez l'application <strong className="text-foreground">NeoFilm</strong></li>
              <li>Un <strong className="text-foreground">code PIN à 6 chiffres</strong> s'affiche automatiquement</li>
              <li>Entrez ce code ci-dessous pour associer l'appareil à cet écran</li>
            </ol>

            <div className="space-y-2">
              <label className="text-sm font-medium">Code PIN affiché sur la TV</label>
              <Input
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setPinError('');
                }}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                className="text-center text-2xl font-mono tracking-[0.4em] h-14"
                autoFocus
              />
              {pinError && (
                <p className="text-sm text-destructive">{pinError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('select_type')}>
                Retour
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirm}
                disabled={pin.length !== 6 || confirmPairing.isPending}
              >
                {confirmPairing.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Appairage…</>
                  : 'Appairer l\'appareil'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Success */}
      {step === 'success' && (
        <Card className="max-w-md">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">Appairage réussi !</h3>
            <p className="text-muted-foreground text-sm mb-6">
              L'appareil est maintenant associé à l'écran <strong>"{screen.name}"</strong>
            </p>
            <div className="flex gap-3 justify-center">
              <Button asChild>
                <Link href={`/partner/screens/${screenId}`}>Voir l'écran</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/partner/screens/${screenId}/ux-settings`}>Configurer l'UX TV</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Révoquer l'appareil"
        description="L'appareil sera déconnecté et ne pourra plus diffuser de contenu. Cette action est irréversible."
        variant="destructive"
        confirmLabel="Révoquer"
        loading={revokeDevice.isPending}
        onConfirm={async () => {
          if (device) {
            await revokeDevice.mutateAsync({ screenId, deviceId: device.id });
            setRevokeOpen(false);
          }
        }}
      />
    </div>
  );
}
