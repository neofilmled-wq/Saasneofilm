'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActivityPlace, CatalogueListing, TvAdItem, TvMacroResponse } from '@/lib/device-api';
import { resolveMediaUrl } from '@/lib/device-api';
import { AdZone } from '@/components/layout/ad-zone';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { ListingDetailPage } from '@/components/pages/listing-detail-page';

interface ActivitiesPageProps {
  activities: ActivityPlace[];
  catalogue?: CatalogueListing[];
  macros?: TvMacroResponse | null;
  targetedAds?: TvAdItem[];
  onImpression?: (ad: TvAdItem, startTime: Date, endTime: Date, skipped: boolean) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurant / Café',
  SHOPPING: 'Commerce / Boutique',
  SPA: 'Beauté / Bien-être',
  CULTURE: 'Culture / Loisirs',
  SPORT: 'Sport',
  NIGHTLIFE: 'Vie nocturne',
  TRANSPORT: 'Transport',
  OTHER: 'Autre',
};

const CATEGORY_ICONS: Record<string, string> = {
  RESTAURANT: '🍽', SPA: '💆', SPORT: '⚽', CULTURE: '🎭',
  NIGHTLIFE: '🌙', SHOPPING: '🛍', TRANSPORT: '🚌', OTHER: '📍',
};

/** Unified card item for rendering */
type CardItem = {
  type: 'activity';
  data: ActivityPlace;
} | {
  type: 'catalogue';
  data: CatalogueListing;
};

export function ActivitiesPage({ activities, catalogue = [], macros, targetedAds = [], onImpression }: ActivitiesPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<ActivityPlace | CatalogueListing | null>(null);
  const { focusFirst } = useDpadNavigation({ containerRef, autoFocus: true, enabled: !selectedItem });

  useEffect(() => {
    if (!selectedItem) { const t = setTimeout(focusFirst, 100); return () => clearTimeout(t); }
  }, [selectedItem, focusFirst]);

  const splitMode = macros?.activitiesSplit ?? false;
  const splitRatio = macros?.splitRatio ?? 70;
  const hasAds = targetedAds.length > 0;

  if (activities.length === 0 && catalogue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground" style={{ fontSize: '1.25em' }}>Aucune activite disponible</p>
      </div>
    );
  }

  // Merge activities and catalogue listings into unified category groups
  const grouped: Record<string, CardItem[]> = {};

  // Add activities (sorted: sponsored first, then by sortOrder)
  const sortedActivities = [...activities].sort((a, b) => {
    if (a.isSponsored && !b.isSponsored) return -1;
    if (!a.isSponsored && b.isSponsored) return 1;
    return a.sortOrder - b.sortOrder;
  });

  for (const activity of sortedActivities) {
    const cat = activity.category || 'OTHER';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ type: 'activity', data: activity });
  }

  // Add catalogue listings into their category groups
  for (const listing of catalogue) {
    const cat = (listing.category || 'OTHER').toUpperCase();
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ type: 'catalogue', data: listing });
  }

  // Order categories: same order as advertiser app, then any extras
  const ORDERED_CATEGORIES = ['RESTAURANT', 'SHOPPING', 'SPA', 'CULTURE', 'SPORT', 'NIGHTLIFE', 'TRANSPORT', 'OTHER'];
  const categoryOrder = [
    ...ORDERED_CATEGORIES.filter((k) => grouped[k]?.length),
    ...Object.keys(grouped).filter((k) => !CATEGORY_LABELS[k]),
  ];

  const content = (
    <div ref={containerRef} className="h-full overflow-y-auto tv-page-enter" style={{ padding: 'var(--tv-safe-x, 1.5rem)' }}>
      {categoryOrder.map((cat) => {
        const items = grouped[cat];
        if (!items?.length) return null;
        return (
          <div key={cat} className="mb-[1.5em]">
            <h2 className="mb-[0.5em] font-semibold text-muted-foreground" style={{ fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {CATEGORY_ICONS[cat] || '📍'} {CATEGORY_LABELS[cat] || cat}
            </h2>
            <div className="grid gap-[0.75em]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {items.map((item) => {
                if (item.type === 'activity') {
                  const activity = item.data;
                  return (
                    <div key={`act-${activity.id}`} data-tv-focusable role="button" tabIndex={0}
                      className="tv-card relative flex w-full gap-[0.75em] text-left"
                      style={{ padding: '0.75em', borderRadius: '0.75rem', cursor: 'pointer' }}
                      onClick={() => setSelectedItem(activity)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelectedItem(activity); }}
                    >
                      {activity.isSponsored && (
                        <div className="absolute right-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-white" style={{ fontSize: '0.6em' }}>Sponsorise</div>
                      )}
                      {activity.imageUrl ? (
                        <img src={resolveMediaUrl(activity.imageUrl)} alt={activity.name} className="shrink-0 rounded-lg object-cover" style={{ width: '5em', height: '5em' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="flex shrink-0 items-center justify-center rounded-lg bg-primary/10" style={{ width: '5em', height: '5em', fontSize: '2em' }}>
                          {CATEGORY_ICONS[activity.category] || '📍'}
                        </div>
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="font-semibold text-foreground" style={{ fontSize: '0.9em' }}>{activity.name}</span>
                        {activity.description && <span className="line-clamp-2 text-muted-foreground" style={{ fontSize: '0.75em' }}>{activity.description}</span>}
                        {activity.address && <span className="mt-auto text-muted-foreground" style={{ fontSize: '0.7em' }}>{activity.address}</span>}
                      </div>
                    </div>
                  );
                }

                // Catalogue listing card
                const listing = item.data;
                return (
                  <div key={`cat-${listing.id}`} data-tv-focusable role="button" tabIndex={0}
                    className="tv-card relative flex w-full gap-[0.75em] text-left"
                    style={{ padding: '0.75em', borderRadius: '0.75rem', cursor: 'pointer' }}
                    onClick={() => setSelectedItem(listing)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedItem(listing); }}
                  >
                    {listing.imageUrl ? (
                      <img src={resolveMediaUrl(listing.imageUrl)} alt={listing.title} className="shrink-0 rounded-lg object-cover" style={{ width: '5em', height: '5em' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="flex shrink-0 items-center justify-center rounded-lg bg-primary/10" style={{ width: '5em', height: '5em', fontSize: '2em' }}>
                        {CATEGORY_ICONS[cat] || '🏪'}
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col gap-[0.15em]">
                      <span className="font-semibold text-foreground" style={{ fontSize: '0.9em' }}>{listing.title}</span>
                      {listing.description && <span className="line-clamp-2 text-muted-foreground" style={{ fontSize: '0.75em' }}>{listing.description}</span>}
                      {listing.address && <span className="line-clamp-1 text-muted-foreground" style={{ fontSize: '0.7em' }}>{listing.address}</span>}
                      {listing.promoCode && <span className="mt-auto rounded bg-green-500/20 px-1.5 py-0.5 font-mono font-bold text-green-400" style={{ fontSize: '0.65em', alignSelf: 'flex-start' }}>{listing.promoCode}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const detailOverlay = selectedItem ? (
    <ListingDetailPage item={selectedItem} onBack={() => setSelectedItem(null)} />
  ) : null;

  if (splitMode && hasAds) {
    return (
      <>
        {detailOverlay}
        <div className="flex h-full overflow-hidden">
          <div className="min-w-0 overflow-hidden" style={{ flex: splitRatio }}>{content}</div>
          <div className="tv-glass-divider shrink-0" style={{ width: '1px', height: '100%' }} />
          <div className="min-w-0 overflow-hidden" style={{ flex: 100 - splitRatio }}>
            <AdZone houseAds={[]} targetedAds={targetedAds} rotationMs={macros?.adRotationMs} onImpression={onImpression} />
          </div>
        </div>
      </>
    );
  }

  return <>{detailOverlay}{content}</>;
}
