'use client';

import { useDevice } from '@/providers/device-provider';
import { MainContentZone } from '@/components/layout/main-content-zone';
import { AdZone } from '@/components/layout/ad-zone';
import { TickerBar } from '@/components/layout/ticker-bar';
import type { AdaptiveLayout } from '@/hooks/use-adaptive-layout';

interface OfflineScreenProps {
  layout: AdaptiveLayout;
}

export function OfflineScreen({ layout }: OfflineScreenProps) {
  const { schedule, isConnected } = useDevice();

  const entries = schedule?.entries ?? [];
  const houseAds = schedule?.houseAds ?? [];
  const manifest = schedule?.creativeManifest ?? {};

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* Same split-screen as active, but with offline indicator */}
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ flexDirection: layout.flexDirection }}
      >
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ flex: layout.mainFlex }}
        >
          <MainContentZone entries={entries} creativeManifest={manifest} />
        </div>
        <div
          className="flex-shrink-0 bg-border"
          style={{
            width: layout.orientation === 'horizontal' ? '1px' : '100%',
            height: layout.orientation === 'horizontal' ? '100%' : '1px',
          }}
        />
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ flex: layout.adFlex }}
        >
          <AdZone houseAds={houseAds} />
        </div>
      </div>

      <TickerBar
        isConnected={isConnected}
        isOffline
        lastSyncAt={schedule?.generatedAt}
        tickerHeight={layout.tickerHeight}
      />
    </div>
  );
}
