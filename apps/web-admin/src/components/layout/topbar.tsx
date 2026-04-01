'use client';

import Link from 'next/link';
import { Bell, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { fetchAdminUnreadCount } from '@/lib/api/messaging';
import { useAuth } from '@/providers/auth-provider';

export function Topbar() {
  const { isAuthenticated } = useAuth();

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.conversations.unreadCount,
    queryFn: fetchAdminUnreadCount,
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });
  const unreadCount = unreadData?.count ?? 0;

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-foreground">Administration</h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="search-bar h-9 w-64 rounded-lg pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        {/* Messages */}
        <Link
          href="/admin/messages"
          className="relative rounded-lg p-2 text-muted-foreground hover:bg-[hsl(240_4%_18%)] hover:text-white transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-[0_0_6px_hsl(24_95%_53%/0.4)]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
