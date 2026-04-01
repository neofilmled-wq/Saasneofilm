'use client';

import { useState } from 'react';
import { Upload, Film, Image, Search, Paintbrush, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { Button, Input, Card, CardContent, Badge } from '@neofilm/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingCards } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useMediaLibrary } from '@/lib/api/hooks/use-media';
import { formatFileSize, formatDuration, formatRelative } from '@/lib/utils';
import { CanvaDesignPicker } from '@/components/canva/canva-design-picker';
import { toast } from 'sonner';

export default function MediaLibraryPage() {
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'VIDEO' | 'IMAGE'>('ALL');
  const [canvaOpen, setCanvaOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useMediaLibrary({
    type: typeFilter === 'ALL' ? undefined : typeFilter,
  });

  function handleCanvaImport() {
    toast.success('Média importé depuis Canva dans votre médiathèque');
    refetch();
  }

  return (
    <>
      <PageHeader
        title="Médiathèque"
        description="Gérez vos vidéos et images publicitaires"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setCanvaOpen(true)}>
              <Paintbrush className="h-4 w-4" /> Créer avec Canva
            </Button>
            <Button className="gap-1.5">
              <Upload className="h-4 w-4" /> Uploader un média
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un média..." className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les types</SelectItem>
            <SelectItem value="VIDEO">Vidéos</SelectItem>
            <SelectItem value="IMAGE">Images</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <LoadingCards count={8} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Film}
          title="Aucun média"
          description="Uploadez votre première vidéo ou image pour vos campagnes publicitaires."
          actionLabel="Uploader un média"
        />
      )}

      {data && data.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.data.map((media) => (
            <Card key={media.id} className="cursor-pointer transition-shadow hover:shadow-md">
              <div className="aspect-video overflow-hidden rounded-t-lg bg-muted">
                {media.type === 'VIDEO' ? (
                  <video
                    src={`${media.fileUrl}#t=0.1`}
                    className="h-full w-full object-cover"
                    muted
                    preload="metadata"
                    onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                    onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  />
                ) : (
                  <img src={media.fileUrl} alt={media.name} className="h-full w-full object-cover" />
                )}
              </div>
              <CardContent className="p-3">
                <p className="truncate text-sm font-medium">{media.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  {media.type === 'VIDEO' ? (
                    <Film className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Image className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(media.durationMs)} — {formatFileSize(media.fileSizeBytes)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Badge variant={media.status === 'READY' ? 'default' : 'outline'} className="text-xs">
                    {media.status === 'READY' ? 'Prêt' : media.status === 'PROCESSING' ? 'Traitement...' : media.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatRelative(media.createdAt)}</span>
                </div>
                {media.status === 'READY' && media.campaignId && (
                  <Link href={`/campaigns/${media.campaignId}`} className="mt-2 block">
                    <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                      <Megaphone className="h-3 w-3" /> Diffuser ma campagne
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Canva Design Picker */}
      <CanvaDesignPicker
        open={canvaOpen}
        onOpenChange={setCanvaOpen}
        onAssetImported={handleCanvaImport}
      />
    </>
  );
}
