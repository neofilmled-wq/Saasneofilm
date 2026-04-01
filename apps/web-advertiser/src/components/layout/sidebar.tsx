'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Megaphone,
  Film,
  BarChart3,
  BookOpen,
  CreditCard,
  Receipt,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LayoutDashboard,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@neofilm/ui';
import { useAuth } from '@/providers/auth-provider';
import { queryKeys } from '@/lib/api/query-keys';
import { fetchUnreadCount } from '@/lib/api/messaging';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campagnes', icon: Megaphone },
  { href: '/media-library', label: 'Médiathèque', icon: Film },
  { href: '/analytics', label: 'Analytiques', icon: BarChart3 },
  { href: '/catalog', label: 'Catalogue', icon: BookOpen },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/billing', label: 'Abonnement', icon: CreditCard },
  { href: '/invoices', label: 'Factures', icon: Receipt },
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.conversations.unreadCount,
    queryFn: fetchUnreadCount,
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count ?? 0;

  return (
    <aside
      className={cn(
        'sticky top-4 ml-4 my-4 flex flex-col rounded-2xl bg-card card-elevated transition-all duration-200',
        'max-h-[calc(100vh-2rem)] overflow-hidden',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground">
          <span className="text-sm font-bold text-background">N°</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[15px] font-bold tracking-tight">NeoFilm</span>
            <span className="text-[11px] text-muted-foreground">Annonceurs</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav-scroll flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const showBadge = item.href === '/messages' && unreadCount > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                    isActive
                      ? 'sidebar-link-active'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="relative shrink-0">
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                    {showBadge && collapsed && (
                      <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground" />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {showBadge && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {unreadCount}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 py-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* User section */}
      <div className="border-t border-border/50 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-[13px] font-semibold">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.orgName}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
