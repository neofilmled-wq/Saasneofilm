'use client';

import { useRef } from 'react';
import { Home, Tv, Film, MapPin, Compass, Grid3x3, Settings } from 'lucide-react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';

export type TabKey = 'HOME' | 'TNT' | 'STREAMING' | 'ADDRESSES' | 'ACTIVITIES' | 'APPS' | 'SETTINGS';

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  module?: string;
}

const ALL_TABS: TabItem[] = [
  { key: 'HOME',       label: 'Accueil',         icon: Home },
  { key: 'TNT',        label: 'TV / TNT',        icon: Tv,         module: 'TNT' },
  { key: 'STREAMING',  label: 'Streaming',       icon: Film,       module: 'STREAMING' },
  { key: 'ADDRESSES',  label: 'Bonnes adresses', icon: MapPin,     module: 'ACTIVITIES' },
  { key: 'ACTIVITIES', label: 'Activités',       icon: Compass,    module: 'ACTIVITIES' },
  { key: 'APPS',       label: 'Applications',    icon: Grid3x3 },
  { key: 'SETTINGS',   label: 'Paramètres',      icon: Settings },
];

interface TabNavigationProps {
  enabledModules: string[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

/**
 * NEOFILM nav bar — pill buttons with red focus glow, D-pad navigable.
 *
 * Visible tabs: HOME / SETTINGS / APPS always shown. Module-gated tabs
 * (TNT, STREAMING, ADDRESSES, ACTIVITIES) appear when the partner has
 * the matching module enabled.
 */
export function TabNavigation({ enabledModules, activeTab, onTabChange }: TabNavigationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useDpadNavigation({ containerRef, wrap: true });

  const visibleTabs = ALL_TABS.filter((t) => !t.module || enabledModules.includes(t.module));

  return (
    <div ref={containerRef} data-tv-nav-group="tabs" className="neo-nav">
      {visibleTabs.map((tab, tabIdx) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            data-tv-focusable
            data-tv-row={0}
            data-tv-col={tabIdx}
            onClick={() => onTabChange(tab.key)}
            className={isActive ? 'neo-active' : ''}
          >
            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
