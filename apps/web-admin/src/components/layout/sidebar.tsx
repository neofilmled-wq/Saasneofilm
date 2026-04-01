'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Building2,
  Megaphone,
  Monitor,
  Cpu,
  Calendar,
  Receipt,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  MapPin,
  Film,
  MessageSquare,
  DollarSign,
  Zap,
} from 'lucide-react';
import { cn } from '@neofilm/ui';
import { useAuth } from '@/providers/auth-provider';
import { queryKeys } from '@/lib/query-keys';
import { fetchAdminUnreadCount } from '@/lib/api/messaging';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: boolean;
  sub?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
      { href: '/admin/messages', label: 'Messages', icon: MessageSquare, badge: true },
    ],
  },
  {
    label: 'Réseau',
    items: [
      { href: '/admin/partners', label: 'Partenaires', icon: Building2 },
      { href: '/admin/advertisers', label: 'Annonceurs', icon: Megaphone },
      { href: '/admin/users', label: 'Utilisateurs', icon: Users },
      { href: '/admin/devices', label: 'Appareils', icon: Cpu },
      { href: '/admin/live-map', label: 'Carte live', icon: MapPin },
    ],
  },
  {
    label: 'Campagnes',
    items: [
      { href: '/admin/campaigns', label: 'Campagnes', icon: Monitor },
      { href: '/admin/moderation/videos', label: 'Modération', icon: Film },
      { href: '/admin/schedules', label: 'Programmation', icon: Calendar },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/admin/invoices', label: 'Factures', icon: Receipt },
      { href: '/admin/retrocessions', label: 'Rétrocessions', icon: DollarSign },
      { href: '/admin/analytics', label: 'Analytiques', icon: BarChart3 },
    ],
  },
];

const bottomItems: NavItem[] = [
  { href: '/admin/settings', label: 'Paramètres', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.conversations.unreadCount,
    queryFn: fetchAdminUnreadCount,
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });
  const unreadCount = unreadData?.count ?? 0;

  function renderNavItem(item: NavItem) {
    const isActive = item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);
    const showBadge = item.badge && unreadCount > 0;

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
            isActive
              ? 'sidebar-link-active'
              : 'text-sidebar-foreground hover:bg-[hsl(240_4%_18%)] hover:text-white',
            collapsed && 'justify-center px-2',
            item.sub && !collapsed && 'sidebar-sub-item',
          )}
          title={collapsed ? item.label : undefined}
        >
          <span className="relative">
            <item.icon className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-sidebar-foreground group-hover:text-white',
            )} />
            {showBadge && collapsed && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white shadow-[0_0_6px_hsl(24_95%_53%/0.4)]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between">
              <span>{item.label}</span>
              {showBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white shadow-[0_0_6px_hsl(24_95%_53%/0.3)]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_0_14px_hsl(24_95%_53%/0.35)]">
          <Shield className="h-[18px] w-[18px] text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground tracking-tight">NeoFilm</span>
            <span className="text-[10px] font-semibold text-primary uppercase tracking-[0.15em]">Admin</span>
          </div>
        )}
      </div>

      {/* Navigation sections */}
      <nav className="sidebar-nav-scroll flex-1 overflow-y-auto py-2 px-2">
        {navSections.map((section, idx) => (
          <div key={idx}>
            {section.label && !collapsed && (
              <div className="sidebar-section-label">{section.label}</div>
            )}
            {section.label && collapsed && idx > 0 && (
              <div className="mx-3 my-2 h-px bg-sidebar-border" />
            )}
            <ul className="space-y-0.5">
              {section.items.map(renderNavItem)}
            </ul>
          </div>
        ))}

        {/* Separator before bottom items */}
        {!collapsed && <div className="sidebar-section-label mt-2">Système</div>}
        {collapsed && <div className="mx-3 my-2 h-px bg-sidebar-border" />}
        <ul className="space-y-0.5">
          {bottomItems.map(renderNavItem)}
        </ul>
      </nav>

      {/* CTA button */}
      {!collapsed && (
        <Link href="/admin/live-map" className="sidebar-cta">
          <Zap className="h-4 w-4" />
          Carte réseau live
        </Link>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border px-2 py-1.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-sidebar-foreground hover:bg-[hsl(240_4%_18%)] hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* User profile */}
      <div className="sidebar-profile">
        <div className="flex items-center gap-3">
          <div className="sidebar-avatar">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.role}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-[hsl(240_4%_18%)] hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
