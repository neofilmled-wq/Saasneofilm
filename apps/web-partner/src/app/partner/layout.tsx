'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@neofilm/ui';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuth } from '@/providers/auth-provider';
import { usePartnerOrg } from '@/hooks/use-partner-org';

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const { orgId } = usePartnerOrg();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <SocketProvider partnerOrgId={orgId}>
      {/* Warm gray canvas with floating panels */}
      <div className="min-h-screen bg-background p-0 lg:p-4 lg:flex lg:gap-4">
        {/* Floating sidebar panel (desktop only) */}
        <div className="hidden lg:block shrink-0">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Floating main content panel */}
        <div
          className={cn(
            'flex-1 min-w-0 bg-card rounded-none lg:rounded-2xl card-elevated pb-16 lg:pb-0',
            'lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto',
          )}
        >
          <Header onMenuToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          <main className="p-5 lg:p-7">{children}</main>
        </div>

        {/* Mobile nav */}
        <MobileNav />
      </div>
    </SocketProvider>
  );
}
