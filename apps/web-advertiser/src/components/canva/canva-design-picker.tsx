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
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Badge,
} from '@neofilm/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

// Preset dimensions for cinema ads
const DESIGN_PRESETS = [
  { label: 'Paysage Full HD (1920×1080)', width: 1920, height: 1080 },
  { label: 'Portrait Full HD (1080×1920)', width: 1080, height: 1920 },
  { label: 'Paysage HD (1280×720)', width: 1280, height: 720 },
] as const;

interface CanvaDesignPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssetImported?: (result: {
    creativeId: string;
    fileUrl: string;
    mimeType: string;
    fileSizeBytes: number;
  }) => void;
  campaignId?: string;
}

export function CanvaDesignPicker({
  open,
  onOpenChange,
  onAssetImported,
  campaignId,
}: CanvaDesignPickerProps) {
  const { data: canvaStatus, isLoading: statusLoading } = useCanvaStatus();
  const { connect } = useCanvaConnect();
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

  // Check for ?canva=connected in URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('canva') === 'connected') {
        toast.success('Compte Canva connecté avec succès !');
        // Clean URL
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
      // Start export
      const { exportId } = await exportMutation.mutateAsync({
        canvaDesignId: design.canvaDesignId,
        format: 'png',
        width: 1920,
        height: 1080,
      });

      // Import (server will poll Canva and download)
      const result = await importMutation.mutateAsync({
        canvaDesignId: design.canvaDesignId,
        exportId,
        format: 'png',
        campaignId,
      });

      toast.success('Design importé dans NeoFilm !');
      onAssetImported?.(result);
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer avec Canva</DialogTitle>
          <DialogDescription>
            Créez ou importez des visuels depuis votre compte Canva
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {statusLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not connected */}
        {!statusLoading && !isConnected && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-muted p-4">
              <Link2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Connectez votre compte Canva</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Autorisez NeoFilm à accéder à vos designs Canva pour créer et importer vos visuels publicitaires.
              </p>
            </div>
            <Button onClick={connect} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Connecter Canva
            </Button>
          </div>
        )}

        {/* Connected */}
        {!statusLoading && isConnected && (
          <div className="space-y-4">
            {/* Connection status bar */}
            <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2 dark:bg-green-950/20">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  Canva connecté
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
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setShowNewDesign(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Nouveau design
              </Button>
              <Button
                variant="outline"
                size="sm"
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

            {/* New design form */}
            {showNewDesign && (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
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
                    <label className="mb-1 block text-sm font-medium">
                      Format
                    </label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {DESIGN_PRESETS.map((preset, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedPreset(i)}
                          className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                            selectedPreset === i
                              ? 'border-primary bg-primary/5 font-medium'
                              : 'hover:bg-muted'
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
                      size="sm"
                      onClick={() => setShowNewDesign(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateDesign}
                      disabled={createDesignMutation.isPending}
                    >
                      {createDesignMutation.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-1 h-4 w-4" />
                      )}
                      Créer et ouvrir dans Canva
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Designs list */}
            {designsLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!designsLoading && designs && designs.length === 0 && (
              <div className="rounded-lg border-2 border-dashed py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucun design Canva. Créez votre premier design ci-dessus.
                </p>
              </div>
            )}

            {!designsLoading && designs && designs.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {designs.map((design) => (
                  <Card key={design.id} className="overflow-hidden">
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
                          <span className="text-xs">Pas d'aperçu</span>
                        </div>
                      )}
                    </div>

                    <CardContent className="p-3">
                      <p className="truncate text-sm font-medium">
                        {design.title || 'Sans titre'}
                      </p>

                      <div className="mt-1 flex items-center gap-2">
                        {design.lastExportedAt && (
                          <Badge variant="outline" className="text-xs">
                            Exporté
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(design.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      </div>

                      <div className="mt-2 flex gap-2">
                        {design.editUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1 text-xs"
                            onClick={() =>
                              window.open(
                                design.editUrl!,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                          >
                            <ExternalLink className="h-3 w-3" />
                            Modifier
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => handleExportAndImport(design)}
                          disabled={exportingDesignId === design.canvaDesignId}
                        >
                          {exportingDesignId === design.canvaDesignId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
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
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">
                  {(exportMutation.error as Error)?.message ||
                    (importMutation.error as Error)?.message ||
                    'Une erreur est survenue'}
                </span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
