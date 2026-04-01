'use client';

import Link from 'next/link';
import { Plus, BookOpen, Eye, Pencil, Star, Play, Pause, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, Badge, Skeleton } from '@neofilm/ui';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import {
  useCatalogueListings,
  usePublishCatalogueItem,
  useUnpublishCatalogueItem,
  useDeleteCatalogueItem,
  type CatalogueListing,
} from '@/lib/api/hooks/use-catalogue';
import { useRouter } from 'next/navigation';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  DRAFT: 'Brouillon',
  PAUSED: 'En pause',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  ACTIVE: 'default',
  DRAFT: 'secondary',
  PAUSED: 'outline',
};

interface MergedListing {
  primary: CatalogueListing;
  allIds: string[];
  totalScreens: number;
  allScreens: CatalogueListing['screens'];
}

function mergeListings(listings: CatalogueListing[]): MergedListing[] {
  const groups = new Map<string, CatalogueListing[]>();
  for (const listing of listings) {
    const key = listing.title;
    const group = groups.get(key);
    if (group) {
      group.push(listing);
    } else {
      groups.set(key, [listing]);
    }
  }
  return Array.from(groups.values()).map((group) => {
    const allScreens = group.flatMap((l) => l.screens);
    // Deduplicate screens by screen id
    const uniqueScreens = Array.from(
      new Map(allScreens.map((s) => [s.screen.id, s])).values()
    );
    return {
      primary: group[0],
      allIds: group.map((l) => l.id),
      totalScreens: uniqueScreens.length,
      allScreens: uniqueScreens,
    };
  });
}

function CatalogueCard({ merged }: { merged: MergedListing }) {
  const { primary: listing, totalScreens, allIds } = merged;
  const publish = usePublishCatalogueItem();
  const unpublish = useUnpublishCatalogueItem();
  const remove = useDeleteCatalogueItem();

  async function handlePublish() {
    try {
      for (const id of allIds) {
        await publish.mutateAsync(id);
      }
      toast.success('Fiche publiée — diffusion en cours sur les écrans ciblés');
    } catch {
      toast.error('Erreur lors de la publication');
    }
  }

  async function handleUnpublish() {
    try {
      for (const id of allIds) {
        await unpublish.mutateAsync(id);
      }
      toast.success('Fiche mise en pause');
    } catch {
      toast.error('Erreur lors de la mise en pause');
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette fiche catalogue ?')) return;
    try {
      for (const id of allIds) {
        await remove.mutateAsync(id);
      }
      toast.success('Fiche supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  const isBusy = publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      {listing.imageUrl ? (
        <div className="aspect-[2/1] overflow-hidden bg-muted">
          <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[2/1] bg-muted flex items-center justify-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/30" />
        </div>
      )}
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <Badge variant={STATUS_VARIANTS[listing.status] ?? 'secondary'}>
            {STATUS_LABELS[listing.status] ?? listing.status}
          </Badge>
          {totalScreens > 0 && (
            <Badge variant="outline" className="gap-1">
              <Star className="h-3 w-3" /> {totalScreens} écran{totalScreens > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <h3 className="mb-1 font-semibold line-clamp-1">{listing.title}</h3>
        <p className="mb-2 text-sm text-muted-foreground line-clamp-2">{listing.description}</p>

        {listing.keywords.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {listing.keywords.slice(0, 4).map((kw) => (
              <span key={kw} className="rounded bg-muted px-2 py-0.5 text-xs">{kw}</span>
            ))}
          </div>
        )}

        {listing.promoCode && (
          <div className="mb-3 rounded bg-green-50 p-2 text-center text-sm">
            Code promo: <span className="font-mono font-bold text-green-700">{listing.promoCode}</span>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Link href={`/catalog/${listing.id}/edit`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1" disabled={isBusy}>
              <Pencil className="h-3.5 w-3.5" /> Modifier
            </Button>
          </Link>

          {listing.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={handleUnpublish}
              disabled={isBusy}
            >
              <Pause className="h-3.5 w-3.5" /> Suspendre
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={handlePublish}
              disabled={isBusy}
            >
              <Play className="h-3.5 w-3.5" /> Publier
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isBusy}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CatalogPage() {
  const { data: listings = [], isLoading } = useCatalogueListings();
  const merged = mergeListings(listings);
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Catalogue «Découvrir la ville»"
        description="Créez votre fiche dans le catalogue interactif affiché sur les écrans TV"
        actions={
          <Link href="/campaigns/new">
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> Créer une campagne
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="aspect-[2/1] w-full" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : merged.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucune fiche catalogue"
          description="Créez votre fiche pour apparaître dans le catalogue «Découvrir la ville» sur les écrans TV."
          actionLabel="Créer une campagne catalogue"
          onAction={() => (window.location.href = '/campaigns/new')}
          onAction={() => router.push('/campaigns/new')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {merged.map((m) => (
            <CatalogueCard key={m.primary.id} merged={m} />
          ))}
        </div>
      )}

      {/* TV Preview simulation — shows first active listing */}
      {listings.some((l) => l.status === 'ACTIVE') && (
        <Card className="mt-8">
          <CardContent className="p-6">
            <h3 className="mb-4 font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" /> Aperçu sur écran TV
            </h3>
            <div className="mx-auto max-w-2xl">
              <div className="rounded-xl border-4 border-gray-800 bg-black p-4">
                <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 p-6">
                  <p className="mb-4 text-lg font-bold text-white">Découvrir la ville</p>
                  {listings
                    .filter((l) => l.status === 'ACTIVE')
                    .slice(0, 1)
                    .map((listing) => (
                      <div key={listing.id} className="rounded-lg bg-white/90 p-4">
                        <div className="flex gap-4">
                          {listing.imageUrl && (
                            <div className="h-20 w-32 overflow-hidden rounded bg-muted flex-shrink-0">
                              <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold">{listing.title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">{listing.description}</p>
                            {listing.promoCode && (
                              <p className="mt-1 text-sm font-bold text-green-600">
                                Code promo: {listing.promoCode}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">Simulation de l'affichage sur écran TV</p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
