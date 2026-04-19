'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@neofilm/ui';
import { CheckCircle2, Loader2, Pencil, Save, Tv2, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import {
  useCreateTvStream,
  useDeleteTvStream,
  useTvStreams,
  useUpdateTvStream,
  type TvStreamSource,
} from '@/hooks/use-tv-streams';

export default function TntPage() {
  const { orgId } = usePartnerOrg();
  const { data: sources, isLoading, isError, refetch } = useTvStreams(orgId!);

  const playlist = useMemo(
    () => (sources ?? []).find((s) => s.isGlobal) ?? null,
    [sources],
  );
  // const singles = useMemo(
  //   () => (sources ?? []).filter((s) => !s.isGlobal),
  //   [sources],
  // );

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chaînes TNT"
        description="Ajoutez votre playlist M3U8 — elle s'appliquera à tous vos écrans."
      />

      <PlaylistSection orgId={orgId!} playlist={playlist} />
      {/* <SingleChannelsSection orgId={orgId!} channels={singles} /> */}
    </div>
  );
}

// ─── Playlist (1 only) ──────────────────────────────────────────────────────

function PlaylistSection({
  orgId,
  playlist,
}: {
  orgId: string;
  playlist: TvStreamSource | null;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(playlist?.url ?? '');
  const [err, setErr] = useState<string | null>(null);

  const create = useCreateTvStream(orgId);
  const update = useUpdateTvStream(orgId);
  const remove = useDeleteTvStream(orgId);

  const busy = create.isPending || update.isPending || remove.isPending;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmed = url.trim();
    if (!isM3u8Url(trimmed)) {
      setErr('URL invalide — le lien doit pointer vers un fichier .m3u8 (ou .m3u).');
      return;
    }
    try {
      if (playlist) {
        await update.mutateAsync({ id: playlist.id, data: { url: trimmed } });
      } else {
        await create.mutateAsync({ url: trimmed, isGlobal: true });
      }
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message || 'Erreur.');
    }
  };

  const handleCancel = () => {
    setUrl(playlist?.url ?? '');
    setErr(null);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!playlist) return;
    await remove.mutateAsync(playlist.id);
    setUrl('');
  };

  // Display mode: existing playlist, not editing
  if (playlist && !editing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv2 className="h-5 w-5" />
            Votre playlist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Tv2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Playlist active</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              </div>
              <div className="truncate text-xs text-muted-foreground" title={playlist.url}>
                {playlist.url}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Modifier
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Form mode: adding OR editing
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv2 className="h-5 w-5" />
          {playlist ? 'Modifier la playlist' : 'Ajouter votre playlist'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="playlist-url">URL de la playlist M3U8/M3U</Label>
            <Input
              id="playlist-url"
              type="url"
              placeholder="https://votre-fournisseur.com/playlist.m3u8"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Une seule playlist par partenaire. Elle sera parsée et ses chaînes diffusées sur tous vos écrans.
            </p>
          </div>

          {err && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {err}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Enregistrer
                </>
              )}
            </Button>
            {playlist && (
              <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
                <X className="mr-2 h-4 w-4" />
                Annuler
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Single channels (multiple allowed) — disabled for now, see TntPage ─────
/* eslint-disable */
/*
function SingleChannelsSection({
  orgId,
  channels,
}: {
  orgId: string;
  channels: TvStreamSource[];
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = useCreateTvStream(orgId);
  const update = useUpdateTvStream(orgId);
  const remove = useDeleteTvStream(orgId);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedUrl = url.trim();
    if (!isM3u8Url(trimmedUrl)) {
      setErr('URL invalide — le lien doit pointer vers un fichier .m3u8 (ou .m3u).');
      return;
    }
    if (!name.trim()) {
      setErr('Le nom de la chaîne est requis.');
      return;
    }
    try {
      await create.mutateAsync({
        url: trimmedUrl,
        isGlobal: false,
        channelName: name.trim(),
      });
      setName('');
      setUrl('');
    } catch (e) {
      setErr((e as Error).message || 'Erreur.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Chaînes individuelles ({channels.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input
            placeholder="Nom (TF1, Canal+…)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="url"
            placeholder="https://…/live.m3u8"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !name.trim() || !url.trim()}>
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" />
                Ajouter
              </>
            )}
          </Button>
        </form>

        {err && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {err}
          </div>
        )}

        {channels.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Pour les chaînes non incluses dans votre playlist, ajoutez-les ici individuellement.
          </p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) =>
              editingId === ch.id ? (
                <SingleChannelEditor
                  key={ch.id}
                  channel={ch}
                  onCancel={() => setEditingId(null)}
                  onSave={async (data) => {
                    await update.mutateAsync({ id: ch.id, data });
                    setEditingId(null);
                  }}
                  busy={update.isPending}
                />
              ) : (
                <SingleChannelRow
                  key={ch.id}
                  channel={ch}
                  onEdit={() => setEditingId(ch.id)}
                  onDelete={() => remove.mutate(ch.id)}
                  busy={remove.isPending}
                />
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SingleChannelRow({
  channel,
  onEdit,
  onDelete,
  busy,
}: {
  channel: TvStreamSource;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Radio className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{channel.channelName}</div>
        <div className="truncate text-xs text-muted-foreground" title={channel.url}>
          {channel.url}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Modifier
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={busy}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SingleChannelEditor({
  channel,
  onCancel,
  onSave,
  busy,
}: {
  channel: TvStreamSource;
  onCancel: () => void;
  onSave: (data: { channelName: string; url: string }) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState(channel.channelName ?? '');
  const [url, setUrl] = useState(channel.url);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr('Le nom est requis.');
      return;
    }
    if (!isM3u8Url(url.trim())) {
      setErr('URL invalide — doit pointer vers un .m3u8 (ou .m3u).');
      return;
    }
    try {
      await onSave({ channelName: name.trim(), url: url.trim() });
    } catch (e) {
      setErr((e as Error).message || 'Erreur.');
    }
  };

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" />
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {err && (
        <p className="text-xs text-destructive">{err}</p>
      )}
    </div>
  );
}
*/
/* eslint-enable */

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
