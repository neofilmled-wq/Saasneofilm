'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityPlace, CatalogueListing } from '@/lib/device-api';
import { resolveMediaUrl, deviceApi } from '@/lib/device-api';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';
import { ListingDetailPage } from '@/components/pages/listing-detail-page';

interface ActivitiesPageProps {
  activities: ActivityPlace[];
  catalogue?: CatalogueListing[];
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

export function ActivitiesPage({ activities, catalogue = [] }: ActivitiesPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<ActivityPlace | CatalogueListing | null>(null);
  const { focusFirst } = useDpadNavigation({ containerRef, autoFocus: true, enabled: !selectedItem });

  useEffect(() => {
    if (!selectedItem) { const t = setTimeout(focusFirst, 100); return () => clearTimeout(t); }
  }, [selectedItem, focusFirst]);

  if (activities.length === 0 && catalogue.length === 0) {
    return (
      <div className="neo-subscreen-main neo-stage" style={{ height: '100%' }}>
        <div className="neo-sub-head">
          <div>
            <div className="neo-crumb">Accueil › Bonnes adresses</div>
            <h1>Bonnes adresses locales</h1>
          </div>
          <div className="neo-count">Aucune sélection</div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--neo-t-3)', fontSize: '1.1em' }}>
            Aucune adresse ni activité disponible pour le moment.
          </p>
        </div>
      </div>
    );
  }

  // Merge activities and catalogue listings into unified category groups (memoised)
  const { grouped, categoryOrder } = useMemo(() => {
    const grouped: Record<string, CardItem[]> = {};

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

    for (const listing of catalogue) {
      const cat = (listing.category || 'OTHER').toUpperCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ type: 'catalogue', data: listing });
    }

    const ORDERED_CATEGORIES = ['RESTAURANT', 'SHOPPING', 'SPA', 'CULTURE', 'SPORT', 'NIGHTLIFE', 'TRANSPORT', 'OTHER'];
    const categoryOrder = [
      ...ORDERED_CATEGORIES.filter((k) => grouped[k]?.length),
      ...Object.keys(grouped).filter((k) => !CATEGORY_LABELS[k]),
    ];

    return { grouped, categoryOrder };
  }, [activities, catalogue]);

  const totalCount =
    categoryOrder.reduce((sum, c) => sum + (grouped[c]?.length ?? 0), 0);

  const content = (
    <div className="neo-subscreen-main neo-stage" style={{ height: '100%' }}>
      <div className="neo-sub-head">
        <div>
          <div className="neo-crumb">Accueil › Bonnes adresses</div>
          <h1>Bonnes adresses & activités</h1>
        </div>
        <div className="neo-count">{totalCount} sélections</div>
      </div>

      <div
        ref={containerRef}
        data-tv-nav-group="activities"
        style={{ overflow: 'auto', paddingRight: 4 }}
      >
        {categoryOrder.map((cat) => {
          const items = grouped[cat];
          if (!items?.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 22 }}>
              <h3
                style={{
                  margin: '0 0 10px',
                  fontSize: 11,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--neo-t-3)',
                  fontWeight: 600,
                }}
              >
                {CATEGORY_ICONS[cat] || '📍'} {CATEGORY_LABELS[cat] || cat}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.map((item) => {
                  if (item.type === 'activity') {
                    const activity = item.data;
                    return (
                      <button
                        key={`act-${activity.id}`}
                        data-tv-focusable
                        className="neo-addr"
                        style={{
                          appearance: 'none',
                          color: 'inherit',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          width: '100%',
                        }}
                        onClick={() => setSelectedItem(activity)}
                      >
                        <div
                          className="neo-addr-thumb"
                          style={{
                            background: activity.imageUrl
                              ? `url(${resolveMediaUrl(activity.imageUrl)}) center/cover`
                              : 'linear-gradient(135deg, #1e293b, #0f172a)',
                            color: '#fff',
                          }}
                        >
                          {!activity.imageUrl && (CATEGORY_ICONS[activity.category] || '📍')}
                        </div>
                        <div className="neo-addr-body">
                          <div className="neo-name">
                            {activity.name}
                            {activity.isSponsored && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  letterSpacing: '0.16em',
                                  textTransform: 'uppercase',
                                  color: '#fbbf24',
                                }}
                              >
                                Sponsorisé
                              </span>
                            )}
                          </div>
                          {activity.description && (
                            <div className="neo-desc">{activity.description}</div>
                          )}
                          {activity.address && (
                            <div className="neo-meta">
                              <span>{activity.address}</span>
                            </div>
                          )}
                        </div>
                        <div className="neo-addr-cta">Voir →</div>
                      </button>
                    );
                  }
                  const listing = item.data;
                  return (
                    <button
                      key={`cat-${listing.id}`}
                      data-tv-focusable
                      className="neo-addr"
                      style={{
                        appearance: 'none',
                        color: 'inherit',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        width: '100%',
                      }}
                      onClick={() => {
                        deviceApi.registerCatalogueClick(listing.id).catch(() => {});
                        setSelectedItem(listing);
                      }}
                    >
                      <div
                        className="neo-addr-thumb"
                        style={{
                          background: listing.imageUrl
                            ? `url(${resolveMediaUrl(listing.imageUrl)}) center/cover`
                            : 'linear-gradient(135deg, #4a1e0a, #1a0a05)',
                          color: '#fff',
                        }}
                      >
                        {!listing.imageUrl && (CATEGORY_ICONS[cat] || '🏪')}
                      </div>
                      <div className="neo-addr-body">
                        <div className="neo-name">{listing.title}</div>
                        {listing.description && (
                          <div className="neo-desc">{listing.description}</div>
                        )}
                        <div className="neo-meta">
                          {listing.address && <span>{listing.address}</span>}
                          {listing.promoCode && (
                            <span
                              style={{
                                color: 'var(--neo-accent)',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                              }}
                            >
                              Code : {listing.promoCode}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="neo-addr-cta">Voir →</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const detailOverlay = selectedItem ? (
    <ListingDetailPage item={selectedItem} onBack={() => setSelectedItem(null)} />
  ) : null;

  // Internal AdZone removed — the global AdZone in smart-tv-display handles
  // ads for all tabs now (shared <video> instance, no restart on tab switch).
  return <>{detailOverlay}{content}</>;
}
