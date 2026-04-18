'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@neofilm/ui';
import {
  Monitor,
  Map,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Settings,
  Building2,
  ChevronLeft,
  Tv,
  Tv2,
  MessageSquare,
  User,
  Link2,
  LogOut,
} from 'lucide-react';
import { useOrgPermissions } from '@/hooks/use-org-permissions';
import { queryKeys } from '@/lib/query-keys';
import { fetchUnreadCount } from '@/lib/api/messaging';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: keyof ReturnType<typeof useOrgPermissions>;
  badge?: boolean;
}

const MENU_ITEMS: NavItem[] = [
  { href: '/partner/screens', label: 'Écrans', icon: Monitor },
  { href: '/partner/sites', label: 'Sites', icon: Building2 },
  { href: '/partner/tnt', label: 'TNT', icon: Tv2 },
  { href: '/partner/map', label: 'Carte live', icon: Map },
  { href: '/partner/messages', label: 'Messages', icon: MessageSquare, badge: true },
  { href: '/partner/alerts', label: 'Alertes', icon: AlertTriangle },
  { href: '/partner/revenue', label: 'Revenus', icon: TrendingUp, permission: 'canViewRevenue' },
  { href: '/partner/payouts', label: 'Paiements', icon: Wallet, permission: 'canViewRevenue' },
];

const GENERAL_ITEMS: NavItem[] = [
  { href: '/partner/settings', label: 'Paramètres', icon: Settings },
  { href: '/partner/profile', label: 'Profil', icon: User },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const permissions = useOrgPermissions();
  const { logout } = useAuth();
  const router = useRouter();

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.conversations.unreadCount,
    queryFn: fetchUnreadCount,
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const filterByPermission = (items: NavItem[]) =>
    items.filter((item) => !item.permission || permissions[item.permission]);

  const visibleMenu = filterByPermission(MENU_ITEMS);
  const visibleGeneral = filterByPermission(GENERAL_ITEMS);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
          isActive
            ? 'sidebar-link-active'
            : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground',
          collapsed && 'justify-center px-2',
        )}
        title={collapsed ? item.label : undefined}
      >
        <span className="relative shrink-0">
          <item.icon className={cn('h-[18px] w-[18px]', isActive && 'text-primary')} />
          {item.badge && unreadCount > 0 && collapsed && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        {!collapsed && (
          <span className="flex flex-1 items-center justify-between">
            <span>{item.label}</span>
            {item.badge && unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'z-40 flex flex-col bg-[hsl(var(--sidebar))] transition-all duration-300 rounded-2xl card-elevated',
        'h-[calc(100vh-2rem)] sticky top-4',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/partner/screens" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Tv className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">NeoFilm</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/partner/screens" className="mx-auto">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Tv className="h-4 w-4 text-primary-foreground" />
            </div>
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 sidebar-nav-scroll">
        {/* MENU section */}
        {!collapsed && (
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Menu
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {visibleMenu.map(renderNavItem)}
        </div>

        {/* GENERAL section */}
        <div className="mt-6">
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Général
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {visibleGeneral.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* Promo card — Donezo style */}
      {!collapsed && (
        <div className="mx-3 mb-3 rounded-xl bg-primary/5 border border-primary/10 p-3">
          <p className="text-xs font-semibold text-foreground mb-1">Besoin d'aide ?</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            Consultez notre guide pour tirer le meilleur parti de NeoFilm.
          </p>
          <button className="w-full rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Voir le guide
          </button>
        </div>
      )}

      {/* Bottom section */}
      <div className="border-t px-3 py-3" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        {!collapsed ? (
          <div className="flex flex-col gap-0.5">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[hsl(var(--sidebar-foreground))] hover:bg-red-50 hover:text-red-600 transition-colors w-full text-left"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" />
              <span>Déconnexion</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={onToggle}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Ouvrir le menu"
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
