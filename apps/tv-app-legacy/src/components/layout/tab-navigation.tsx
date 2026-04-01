'use client';

import { useRef } from 'react';
import { Home, Tv, Film, MapPin, Settings } from 'lucide-react';
import { useDpadNavigation } from '@/hooks/use-dpad-navigation';

export type TabKey = 'HOME' | 'TNT' | 'STREAMING' | 'ACTIVITIES' | 'APPS' | 'SETTINGS';

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  module?: string;
}

const ALL_TABS: TabItem[] = [
  { key: 'HOME',       label: 'Accueil',    icon: Home },
  { key: 'TNT',        label: 'TV / TNT',   icon: Tv },
  { key: 'STREAMING',  label: 'Streaming',  icon: Film },
  { key: 'ACTIVITIES', label: 'Activites',  icon: MapPin },
  { key: 'SETTINGS',   label: 'Parametres', icon: Settings },
];

interface TabNavigationProps {
  enabledModules: string[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

/**
 * Horizontal tab bar — D-pad navigable.
 * HOME and SETTINGS are always visible.
 * Other tabs shown if included in enabledModules.
 */
export function TabNavigation({ enabledModules, activeTab, onTabChange }: TabNavigationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // D-pad LEFT/RIGHT navigation within tab bar
  useDpadNavigation({
    containerRef,
    // No BACK handler — tab bar has no parent to go back to
    wrap: true,
  });

  const visibleTabs = ALL_TABS.filter(
    (t) => t.key === 'HOME' || t.key === 'SETTINGS' || t.key === 'APPS' || enabledModules.includes(t.key),
  );

  return (
    <div
      ref={containerRef}
      data-tv-nav-group="tabs"
      className="tv-glass-panel flex w-full flex-shrink-0 items-center gap-[0.25em]"
      style={{
        height: 'var(--tv-tabbar-h, 52px)',
        paddingLeft: 'var(--tv-safe-x, 1.5rem)',
        paddingRight: 'var(--tv-safe-x, 1.5rem)',
      }}
    >
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
            className={`tv-tab-btn flex items-center gap-[0.5em] rounded-lg ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`}
            style={{
              padding: '0.4em 1em',
              fontSize: '0.95em',
              ...(isActive ? {
                background: 'rgba(14, 165, 233, 0.12)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 12px rgba(14, 165, 233, 0.2)',
                border: '1px solid rgba(14, 165, 233, 0.25)',
              } : {
                background: 'transparent',
                border: '1px solid transparent',
              }),
            }}
          >
            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="font-medium">{tab.label}</span>
            {isActive && (
              <span
                className="ml-1 h-1.5 w-1.5 rounded-full bg-primary"
                style={{ display: 'inline-block' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
