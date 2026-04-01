'use client';

import { useDevice } from '@/providers/device-provider';
import { MainContentZone } from '@/components/layout/main-content-zone';
import { AdZone } from '@/components/layout/ad-zone';
import { TickerBar } from '@/components/layout/ticker-bar';
import type { AdaptiveLayout } from '@/hooks/use-adaptive-layout';

interface MainDisplayProps {
  layout: AdaptiveLayout;
}

/**
 * Main active display — split-screen content + ads + ticker.
 *
 * Horizontal (16:9, 21:9):
 *   ┌──────────────────────┬──────────┐
 *   │   MAIN (flex: 7)     │ AD (3)   │  ← flex-direction: row
 *   └──────────────────────┴──────────┘
 *   └──────── TICKER ────────────────┘
 *
 * Vertical (4:3, narrow):
 *   ┌────────────────────────────────┐
 *   │         MAIN (75%)             │  ← flex-direction: column
 *   ├────────────────────────────────┤
 *   │         ADS  (25%)             │
 *   └────────────────────────────────┘
 *   └──────── TICKER ──────────────┘
 */
export function MainDisplay({ layout }: MainDisplayProps) {
  const { schedule, isConnected } = useDevice();

  const entries = schedule?.entries ?? [];
  const houseAds = schedule?.houseAds ?? [];
  const manifest = schedule?.creativeManifest ?? {};

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* Split-screen content area — fills all space above ticker */}
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ flexDirection: layout.flexDirection }}
      >
        {/* Main content zone */}
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ flex: layout.mainFlex }}
        >
          <MainContentZone entries={entries} creativeManifest={manifest} />
        </div>

        {/* Separator — 1px line between zones */}
        <div
          className="flex-shrink-0 bg-border"
          style={{
            width: layout.orientation === 'horizontal' ? '1px' : '100%',
            height: layout.orientation === 'horizontal' ? '100%' : '1px',
          }}
        />

        {/* Ad zone */}
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ flex: layout.adFlex }}
        >
          <AdZone houseAds={houseAds} />
        </div>
      </div>

      {/* Ticker bar — fixed height, scales with resolution */}
      <TickerBar
        isConnected={isConnected}
        tickerHeight={layout.tickerHeight}
      />
    </div>
  );
}
