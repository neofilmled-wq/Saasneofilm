'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@neofilm/ui';
import { Monitor, Map, AlertTriangle, TrendingUp, Settings } from 'lucide-react';

const MOBILE_ITEMS = [
  { href: '/partner/screens', label: 'Écrans', icon: Monitor },
  { href: '/partner/map', label: 'Carte', icon: Map },
  { href: '/partner/alerts', label: 'Alertes', icon: AlertTriangle },
  { href: '/partner/revenue', label: 'Revenus', icon: TrendingUp },
  { href: '/partner/settings', label: 'Plus', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-sm lg:hidden">
      <div className="flex items-center justify-around py-1">
        {MOBILE_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-medium rounded-xl transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                isActive && 'bg-primary/10',
              )}>
                <item.icon className="h-[18px] w-[18px]" />
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
