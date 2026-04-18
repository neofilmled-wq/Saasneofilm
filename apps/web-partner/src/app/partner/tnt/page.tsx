'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@neofilm/ui';
import { CheckCircle2, Loader2, Plus, Tv2, Trash2, List, Radio } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import {
  useTvStreams,
  useCreateTvStream,
  useDeleteTvStream,
  type TvStreamSource,
} from '@/hooks/use-tv-streams';

type Mode = 'global' | 'single';

export default function TntPage() {
  const { orgId } = usePartnerOrg();
  const { data: sources, isLoading, isError, refetch } = useTvStreams(orgId!);
  const createStream = useCreateTvStream(orgId!);
  const deleteStream = useDeleteTvStream(orgId!);

  const [mode, setMode] = useState<Mode>('global');
  const [url, setUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const globalCount = useMemo(
    () => (sources ?? []).filter((s) => s.isGlobal).length,
    [sources],
  );
  const singleCount = useMemo(
    () => (sources ?? []).filter((s) => !s.isGlobal).length,
    [sources],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedUrl = url.trim();
    if (!isM3u8Url(trimmedUrl)) {
      setFormError('URL invalide — le lien doit pointer vers un fichier .m3u8 (ou .m3u).');
      return;
    }
    if (mode === 'single' && !channelName.trim()) {
      setFormError('Le nom de la chaîne est requis pour une chaîne unique.');
      return;
    }

    try {
      await createStream.mutateAsync({
        url: trimmedUrl,
        isGlobal: mode === 'global',
        channelName: mode === 'single' ? channelName.trim() : null,
      });
      setUrl('');
      setChannelName('');
    } catch (err) {
      setFormError((err as Error).message || "Erreur lors de l'ajout.");
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chaînes TNT"
        description="Ajoutez vos flux M3U8/HLS — playlists complètes ou chaînes individuelles. Elles s'appliquent à tous vos écrans."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv2 className="h-5 w-5" />
            Ajouter une source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('global')}
                className={`flex flex-1 items-center gap-2 rounded-xl border p-3 text-left transition ${
                  mode === 'global'
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/50'
                }`}
              >
                <List className="h-5 w-5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Playlist complète</div>
                  <div className="text-xs text-muted-foreground">
                    Un seul lien .m3u8 → plusieurs chaînes parsées
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`flex flex-1 items-center gap-2 rounded-xl border p-3 text-left transition ${
                  mode === 'single'
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/50'
                }`}
              >
                <Radio className="h-5 w-5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Chaîne unique</div>
                  <div className="text-xs text-muted-foreground">
                    Un lien = une chaîne (TF1, Canal+, …)
                  </div>
                </div>
              </button>
            </div>

            {mode === 'single' && (
              <div className="space-y-2">
                <Label htmlFor="channel-name">Nom de la chaîne</Label>
                <Input
                  id="channel-name"
                  type="text"
                  placeholder="Ex : TF1, Canal+, France 2…"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="stream-url">URL M3U8/HLS</Label>
              <Input
                id="stream-url"
                type="url"
                placeholder="https://votre-fournisseur.com/playlist.m3u8"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {formError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                NeoFilm ne fournit aucun lien IPTV. Utilisez votre propre abonnement.
              </p>
              <Button type="submit" disabled={createStream.isPending || !url.trim()}>
                {createStream.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ajout…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vos sources ({(sources ?? []).length})</CardTitle>
            {(sources ?? []).length > 0 && (
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                  {globalCount} playlist{globalCount > 1 ? 's' : ''}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
                  {singleCount} chaîne{singleCount > 1 ? 's' : ''} unique{singleCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(sources ?? []).length === 0 ? (
            <EmptyState
              icon={Tv2}
              title="Aucune source configurée"
              description="Ajoutez votre première playlist ou chaîne unique pour alimenter vos écrans."
            />
          ) : (
            <div className="space-y-2">
              {(sources ?? []).map((src) => (
                <StreamRow
                  key={src.id}
                  source={src}
                  onDelete={() => deleteStream.mutate(src.id)}
                  isDeleting={deleteStream.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StreamRow({
  source,
  onDelete,
  isDeleting,
}: {
  source: TvStreamSource;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          source.isGlobal ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
        }`}
      >
        {source.isGlobal ? <List className="h-5 w-5" /> : <Radio className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {source.isGlobal ? 'Playlist complète' : source.channelName ?? 'Chaîne'}
          </span>
          {source.isGlobal && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              M3U8
            </span>
          )}
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        </div>
        <div className="truncate text-xs text-muted-foreground" title={source.url}>
          {source.url}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={isDeleting}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function isM3u8Url(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const p = u.pathname.toLowerCase();
    return p.endsWith('.m3u8') || p.endsWith('.m3u');
  } catch {
    return false;
  }
}
