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

      {/* TV Preview simulation — replicates the real TV ListingDetailPage */}
      {listings.some((l) => l.status === 'ACTIVE') && (
        <Card className="mt-8">
          <CardContent className="p-6">
            <h3 className="mb-4 font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" /> Aperçu sur écran TV
            </h3>
            <div className="mx-auto max-w-4xl">
              {/* TV frame */}
              <div className="rounded-2xl border-[6px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
                {listings
                  .filter((l) => l.status === 'ACTIVE')
                  .slice(0, 1)
                  .map((listing) => (
                    <TvListingDetailPreview key={listing.id} listing={listing} />
                  ))}
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">Simulation de l'affichage sur écran TV (aperçu statique)</p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/* ══════════════════════════════ TV PREVIEW ══════════════════════════════
 * Mirrors apps/tv-app/src/components/pages/listing-detail-page.tsx
 * Kept in sync manually — if the TV version changes, update here too.
 * ═══════════════════════════════════════════════════════════════════════ */

const TV_CATEGORY_ICONS: Record<string, string> = {
  RESTAURANT: '🍽', SPA: '💆', SPORT: '⚽', CULTURE: '🎭',
  NIGHTLIFE: '🌙', SHOPPING: '🛍', TRANSPORT: '🚌', OTHER: '📍',
};

function TvListingDetailPreview({ listing }: { listing: CatalogueListing }) {
  const category = listing.category || 'OTHER';
  const icon = TV_CATEGORY_ICONS[category] ?? '📍';

  return (
    <div
      className="relative flex aspect-video w-full items-start gap-[3%] overflow-hidden p-[3.5%]"
      style={{
        background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 100%)',
        color: '#e5e7eb',
      }}
    >
      {/* Image / thumbnail */}
      <div
        className="relative shrink-0 overflow-hidden rounded-2xl bg-gray-800"
        style={{ width: '38%', aspectRatio: '4/3' }}
      >
        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <span style={{ fontSize: '3em' }}>{icon}</span>
            <span className="text-gray-400" style={{ fontSize: '0.75em' }}>{category}</span>
          </div>
        )}
      </div>

      {/* Info panel */}
      <div className="flex min-w-0 flex-1 flex-col gap-[1.1em]">
        {/* Category label */}
        <span
          className="text-orange-400"
          style={{ fontSize: '0.75em', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
        >
          {icon} {category}
        </span>

        {/* Title */}
        <h1
          className="font-bold"
          style={{ fontSize: '1.75em', lineHeight: 1.15, margin: 0, color: '#f9fafb' }}
        >
          {listing.title}
        </h1>

        {/* Description */}
        {listing.description && (
          <p
            className="text-gray-300"
            style={{ fontSize: '0.85em', lineHeight: 1.5, maxWidth: '55ch' }}
          >
            {listing.description}
          </p>
        )}

        {/* Meta info */}
        <div className="flex flex-col gap-[0.4em]">
          {listing.address && (
            <span className="text-gray-400" style={{ fontSize: '0.8em' }}>
              📍 {listing.address}
            </span>
          )}
          {listing.phone && (
            <span className="text-gray-400" style={{ fontSize: '0.8em' }}>
              📞 {listing.phone}
            </span>
          )}
          {listing.promoCode && (
            <div className="flex items-center gap-2" style={{ marginTop: '0.25em' }}>
              <span className="text-gray-400" style={{ fontSize: '0.75em' }}>Code promo :</span>
              <span
                className="rounded-lg bg-green-500/20 px-3 py-1 font-mono font-bold text-green-400"
                style={{ fontSize: '0.85em', letterSpacing: '0.1em' }}
              >
                {listing.promoCode}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-auto flex flex-col gap-[0.6em]" style={{ paddingTop: '0.8em' }}>
          {listing.ctaUrl && (
            <button
              type="button"
              disabled
              className="flex items-center gap-2 rounded-xl border-2 border-cyan-400 bg-cyan-400/10 px-6 py-2.5 font-semibold text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
              style={{ fontSize: '0.9em', maxWidth: '22em' }}
            >
              <span>🌐</span>
              <span>Visiter le site</span>
            </button>
          )}
          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-800/60 px-6 py-2.5 font-semibold text-gray-300"
            style={{ fontSize: '0.9em', maxWidth: '22em' }}
          >
            <span>←</span>
            <span>Retour</span>
          </button>
        </div>
      </div>
    </div>
  );
}
