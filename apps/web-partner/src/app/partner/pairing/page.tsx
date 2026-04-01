'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Badge,
} from '@neofilm/ui';
import { Link2, CheckCircle, XCircle, RefreshCw, List } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { usePairingRequests, useClaimPin, useClaimBatch, type PairingRequest } from '@/hooks/use-pairing-requests';
import { useScreens } from '@/hooks/use-screens';
import { useAuth } from '@/providers/auth-provider';

interface BatchEntry {
  pin: string;
  screenId: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  deviceId?: string;
}

export default function PairingPage() {
  const { user } = useAuth();
  const orgId = user?.orgId ?? '';

  // Pending pairing requests from devices
  const { data: pairingData, isLoading: loadingRequests } = usePairingRequests();
  const pairingRequests = (pairingData?.data?.data ?? pairingData?.data ?? []) as PairingRequest[];

  // Partner's screens for the "associate to screen" picker
  const { data: screensData } = useScreens({ partnerOrgId: orgId });
  const screens = screensData ?? [];

  const claimPin = useClaimPin();
  const claimBatch = useClaimBatch();

  // Single PIN claim
  const [singlePin, setSinglePin] = useState('');
  const [singleScreenId, setSingleScreenId] = useState('');
  const [singleResult, setSingleResult] = useState<{ success: boolean; message: string } | null>(null);

  // Batch claim (textarea: one line per "PIN,screenId" or just PIN)
  const [batchText, setBatchText] = useState('');
  const [defaultScreenId, setDefaultScreenId] = useState('');
  const [batchResults, setBatchResults] = useState<BatchEntry[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSingleClaim(e: React.FormEvent) {
    e.preventDefault();
    setSingleResult(null);
    try {
      await claimPin.mutateAsync({ pin: singlePin.trim(), screenId: singleScreenId });
      setSingleResult({ success: true, message: `Appareil appairé avec succès !` });
      setSinglePin('');
    } catch (err: any) {
      setSingleResult({ success: false, message: err.message ?? 'Erreur lors de l\'appairage' });
    }
  }

  async function handleBatchClaim() {
    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const claims: Array<{ pin: string; screenId: string }> = [];
    const invalid: string[] = [];

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      const pin = parts[0];
      const screenId = parts[1] ?? defaultScreenId;
      if (!pin || !screenId) {
        invalid.push(line);
        continue;
      }
      claims.push({ pin, screenId });
    }

    if (claims.length === 0) return;
    setBatchRunning(true);

    try {
      const result = await claimBatch.mutateAsync(claims);
      const entries: BatchEntry[] = result.results.map((r: any) => ({
        pin: r.pin,
        screenId: claims.find((c) => c.pin === r.pin)?.screenId ?? '',
        status: r.success ? 'success' : 'error',
        error: r.error,
        deviceId: r.deviceId,
      }));
      // Add invalid lines as errors
      for (const inv of invalid) {
        entries.unshift({ pin: inv, screenId: '', status: 'error', error: 'Ligne invalide (format: PIN ou PIN,screenId)' });
      }
      setBatchResults(entries);
    } catch (err: any) {
      setBatchResults([{ pin: '—', screenId: '', status: 'error', error: err.message }]);
    } finally {
      setBatchRunning(false);
    }
  }

  const handleQuickClaim = useCallback(async (pin: string) => {
    if (!defaultScreenId) {
      alert('Sélectionnez d\'abord un écran par défaut');
      return;
    }
    try {
      await claimPin.mutateAsync({ pin, screenId: defaultScreenId });
    } catch (err: any) {
      alert(err.message);
    }
  }, [claimPin, defaultScreenId]);

  const successCount = batchResults.filter((r) => r.status === 'success').length;
  const failCount = batchResults.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appairage des appareils"
        description="Associez vos TV et clés Android à vos écrans"
      />

      {/* Default screen selector (used by batch + quick claim) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Écran par défaut pour l'appairage rapide</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={defaultScreenId}
            onChange={(e) => setDefaultScreenId(e.target.value)}
          >
            <option value="">— Sélectionner un écran —</option>
            {screens.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.city ?? '—'}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Single PIN claim */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Appairage simple (1 appareil)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSingleClaim} className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Code PIN (6 chiffres)</label>
                <Input
                  value={singlePin}
                  onChange={(e) => setSinglePin(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  pattern="\d{6}"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Associer à l'écran</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={singleScreenId}
                  onChange={(e) => setSingleScreenId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner un écran —</option>
                  {screens.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.city ?? '—'}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={claimPin.isPending} className="w-full">
                {claimPin.isPending ? 'Appairage…' : 'Appairer'}
              </Button>
              {singleResult && (
                <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${singleResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {singleResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {singleResult.message}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Batch claim */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <List className="h-4 w-4" />
              Appairage en masse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Collez un PIN par ligne. Format : <code className="bg-muted px-1 rounded">PIN</code> (utilise l'écran par défaut) ou <code className="bg-muted px-1 rounded">PIN,screenId</code>
            </p>
            <textarea
              ref={textareaRef}
              className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={"123456\n789012\n345678,clz1a2b3c..."}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            <Button
              onClick={handleBatchClaim}
              disabled={batchRunning || !batchText.trim()}
              className="w-full"
            >
              {batchRunning ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Appairage en cours…</>
              ) : (
                'Appairer tout'
              )}
            </Button>

            {batchResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm font-medium">
                  <span className="text-green-600">{successCount} succès</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-red-600">{failCount} échec{failCount > 1 ? 's' : ''}</span>
                </div>
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {batchResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {r.status === 'success'
                        ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className="font-mono">{r.pin}</span>
                      {r.error && <span className="text-xs text-muted-foreground truncate">{r.error}</span>}
                      {r.deviceId && <Badge variant="outline" className="ml-auto text-xs">ID: {r.deviceId.slice(-8)}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending pairing requests from devices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Appareils en attente d'appairage
            {pairingRequests.length > 0 && (
              <Badge className="ml-2">{pairingRequests.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRequests ? (
            <LoadingState />
          ) : pairingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun appareil en attente. Les TV afficheront leur code PIN au démarrage.
            </p>
          ) : (
            <div className="rounded-md border divide-y">
              {pairingRequests.map((req: any) => {
                const expiresAt = new Date(req.pinExpiresAt);
                const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
                return (
                  <div key={req.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold tracking-widest">{req.pin}</span>
                        <Badge variant="outline">{req.deviceType}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        SN: {req.serialNumber} · expire dans {minutesLeft} min
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleQuickClaim(req.pin)}
                      disabled={claimPin.isPending || !defaultScreenId}
                    >
                      Associer
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
