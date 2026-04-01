'use client';

import { useState, useEffect } from 'react';
import {
  ExternalLink,
  Loader2,
  RefreshCw,
  Plus,
  Download,
  Check,
  AlertCircle,
  LogOut,
  Link2,
  Paintbrush,
  Film,
  Image,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Badge,
} from '@neofilm/ui';
import { toast } from 'sonner';
import {
  useCanvaStatus,
  useCanvaConnect,
  useCanvaDisconnect,
  useCanvaDesigns,
  useCreateCanvaDesign,
  useSyncCanvaDesigns,
  useExportCanvaDesign,
  useImportCanvaExport,
  type CanvaDesign,
} from '@/lib/api/hooks/use-canva';

const DESIGN_PRESETS = [
  { label: 'Paysage Full HD (1920x1080)', width: 1920, height: 1080 },
  { label: 'Portrait Full HD (1080x1920)', width: 1080, height: 1920 },
  { label: 'Paysage HD (1280x720)', width: 1280, height: 720 },
] as const;

const EXPORT_FORMATS = [
  { value: 'png' as const, label: 'Image PNG', icon: Image },
  { value: 'jpg' as const, label: 'Image JPG', icon: Image },
  { value: 'mp4' as const, label: 'Vidéo MP4', icon: Film },
];

export function CanvaCreatorTab() {
  const { data: canvaStatus, isLoading: statusLoading, isError: statusError } = useCanvaStatus();
  const { connect, isLoading: connectLoading, error: connectError } = useCanvaConnect();
  const disconnectMutation = useCanvaDisconnect();
  const { data: designs, isLoading: designsLoading } = useCanvaDesigns();
  const createDesignMutation = useCreateCanvaDesign();
  const syncDesignsMutation = useSyncCanvaDesigns();
  const exportMutation = useExportCanvaDesign();
  const importMutation = useImportCanvaExport();

  const [exportingDesignId, setExportingDesignId] = useState<string | null>(null);
  const [showNewDesign, setShowNewDesign] = useState(false);
  const [newDesignTitle, setNewDesignTitle] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg' | 'mp4'>('png');

  // Check for ?canva=connected in URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('canva') === 'connected') {
        toast.success('Compte Canva connecté avec succès !');
        const url = new URL(window.location.href);
        url.searchParams.delete('canva');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, []);

  const isConnected = canvaStatus?.connected ?? false;

  async function handleCreateDesign() {
    if (!newDesignTitle.trim()) {
      toast.error('Veuillez saisir un nom pour votre design');
      return;
    }
    const preset = DESIGN_PRESETS[selectedPreset];
    try {
      const design = await createDesignMutation.mutateAsync({
        title: newDesignTitle,
        width: preset.width,
        height: preset.height,
      });
      setShowNewDesign(false);
      setNewDesignTitle('');
      if (design.editUrl) {
        window.open(design.editUrl, '_blank', 'noopener,noreferrer');
        toast.success('L\'éditeur Canva s\'est ouvert dans un nouvel onglet');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création du design');
    }
  }

  async function handleExportAndImport(design: CanvaDesign) {
    setExportingDesignId(design.canvaDesignId);
    try {
      const { exportId } = await exportMutation.mutateAsync({
        canvaDesignId: design.canvaDesignId,
        format: exportFormat,
        width: 1920,
        height: 1080,
      });
      await importMutation.mutateAsync({
        canvaDesignId: design.canvaDesignId,
        exportId,
        format: exportFormat,
      });
      toast.success('Design importé dans votre médiathèque NeoFilm !');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'import');
    } finally {
      setExportingDesignId(null);
    }
  }

  function handleSync() {
    syncDesignsMutation.mutate(undefined, {
      onSuccess: () => toast.success('Designs synchronisés depuis Canva'),
      onError: (err: any) => toast.error(err.message || 'Erreur de synchronisation'),
    });
  }

  // Loading state (only while actually fetching, not on error)
  if (statusLoading && !statusError) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-16">
          <div className="rounded-full bg-primary/10 p-6">
            <Paintbrush className="h-12 w-12 text-primary" />
          </div>
          <div className="max-w-md text-center">
            <h3 className="text-lg font-semibold">Créez vos publicités avec Canva</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Connectez votre compte Canva pour créer des visuels professionnels directement depuis NeoFilm.
              Concevez vos affiches, bannières et spots vidéo avec l'éditeur Canva, puis importez-les en un clic.
            </p>
          </div>
          <div className="space-y-3 text-center">
            <Button onClick={connect} disabled={connectLoading} className="gap-2">
              {connectLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Connecter mon compte Canva
            </Button>
            <p className="text-xs text-muted-foreground">
              Vous serez redirigé vers Canva pour autoriser l'accès
            </p>
          </div>

          {/* Error messages */}
          {(connectError || statusError) && (
            <div className="flex max-w-md items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-sm text-destructive">
                <p className="font-medium">
                  {connectError || 'Impossible de vérifier le statut Canva'}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  Vérifiez que le serveur API est lancé (port 3001) et que les variables CANVA_CLIENT_ID et CANVA_CLIENT_SECRET sont configurées dans le fichier .env.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Connected state
  return (
    <div className="space-y-6">
      {/* Connection status bar */}
      <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2.5 dark:bg-green-950/20">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            Compte Canva connecté
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="text-muted-foreground"
        >
          <LogOut className="mr-1 h-3 w-3" />
          Déconnecter
        </Button>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNewDesign(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nouveau design
          </Button>
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncDesignsMutation.isPending}
            className="gap-1.5"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncDesignsMutation.isPending ? 'animate-spin' : ''}`}
            />
            Synchroniser
          </Button>
        </div>

        {/* Export format selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Format d'export :</span>
          <div className="flex rounded-lg border p-0.5">
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt.value}
                onClick={() => setExportFormat(fmt.value)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  exportFormat === fmt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <fmt.icon className="h-3 w-3" />
                {fmt.value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* New design form */}
      {showNewDesign && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="font-semibold">Créer un nouveau design</h3>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Nom du design
              </label>
              <input
                type="text"
                value={newDesignTitle}
                onChange={(e) => setNewDesignTitle(e.target.value)}
                placeholder="Ex: Pub été cinéma 2026"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Format du design
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {DESIGN_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPreset(i)}
                    className={`rounded-lg border-2 px-4 py-3 text-left text-sm transition-colors ${
                      selectedPreset === i
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-muted hover:bg-muted/50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setShowNewDesign(false); setNewDesignTitle(''); }}
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateDesign}
                disabled={createDesignMutation.isPending}
                className="gap-1.5"
              >
                {createDesignMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Créer et ouvrir dans Canva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Designs grid */}
      {designsLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!designsLoading && designs && designs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="rounded-full bg-muted p-4">
              <Paintbrush className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Aucun design Canva</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Créez votre premier design en cliquant sur "Nouveau design" ci-dessus,
                ou synchronisez vos designs existants depuis Canva.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!designsLoading && designs && designs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((design) => (
            <Card key={design.id} className="overflow-hidden transition-shadow hover:shadow-md">
              {/* Thumbnail */}
              <div className="aspect-video bg-muted">
                {design.thumbnailUrl ? (
                  <img
                    src={design.thumbnailUrl}
                    alt={design.title || 'Design Canva'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Paintbrush className="h-8 w-8 opacity-30" />
                  </div>
                )}
              </div>

              <CardContent className="p-4">
                <p className="truncate font-medium">
                  {design.title || 'Sans titre'}
                </p>

                <div className="mt-1.5 flex items-center gap-2">
                  {design.lastExportedAt && (
                    <Badge variant="outline" className="text-xs">
                      Exporté
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(design.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  {design.editUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() =>
                        window.open(design.editUrl!, '_blank', 'noopener,noreferrer')
                      }
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Modifier
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => handleExportAndImport(design)}
                    disabled={exportingDesignId === design.canvaDesignId}
                  >
                    {exportingDesignId === design.canvaDesignId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Importer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error states */}
      {(exportMutation.isError || importMutation.isError) && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            {(exportMutation.error as Error)?.message ||
              (importMutation.error as Error)?.message ||
              'Une erreur est survenue'}
          </span>
        </div>
      )}
    </div>
  );
}
