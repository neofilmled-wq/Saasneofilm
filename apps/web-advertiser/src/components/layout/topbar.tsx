'use client';

import { Bell, Search, Plus, Calendar } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@neofilm/ui';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';

function getFormattedDate() {
  const now = new Date();
  const day = now.getDate();
  const weekday = now.toLocaleDateString('fr-FR', { weekday: 'short' });
  const month = now.toLocaleDateString('fr-FR', { month: 'long' });
  return { day, weekday, month };
}

export function Topbar() {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const { day, weekday, month } = getFormattedDate();

  return (
    <header className="flex h-16 items-center justify-between px-6">
      {/* Left: date + greeting */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-lg font-semibold">
            {day}
          </div>
          <div className="text-sm">
            <span className="capitalize text-muted-foreground">{weekday},</span>{' '}
            <span className="capitalize font-medium">{month}</span>
          </div>
        </div>
        <Link href="/campaigns/new">
          <Button size="sm" className="gap-1.5 rounded-full px-4">
            <Plus className="h-4 w-4" />
            Nouvelle campagne
          </Button>
        </Link>
        <button className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:bg-accent">
          <Calendar className="h-4 w-4" />
        </button>
      </div>

      {/* Center: greeting */}
      <div className="hidden lg:block text-center">
        <h2 className="text-xl font-bold">
          Bonjour, {user?.firstName ?? 'Annonceur'}
        </h2>
        <p className="text-sm text-muted-foreground">Besoin d&apos;aide ? Demandez-nous !</p>
      </div>

      {/* Right: search + avatar */}
      <div className="flex items-center gap-3">
        {/* Connection indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
          />
          <span className="text-[11px] text-muted-foreground">
            {isConnected ? 'Connecté' : 'Hors ligne'}
          </span>
        </div>

        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="h-9 w-56 rounded-full border bg-card pl-9 pr-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Notifications */}
        <button className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent">
          <Bell className="h-5 w-5" />
          <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            3
          </span>
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-accent cursor-pointer">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="hidden md:block">
            <p className="text-[12px] font-semibold leading-tight">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">{user?.orgName}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
