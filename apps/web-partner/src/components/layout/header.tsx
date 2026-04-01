'use client';

import { Bell, Menu, Search, Mail, User } from 'lucide-react';
import {
  Button,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@neofilm/ui';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import { useAuth } from '@/providers/auth-provider';
import { useSocketContext } from '@/providers/socket-provider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { orgName, userName } = usePartnerOrg();
  const { logout } = useAuth();
  const { isConnected } = useSocketContext();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="flex h-16 items-center gap-4 px-7">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 hover:bg-accent lg:hidden transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search bar — Donezo style */}
      <div className="search-bar flex flex-1 items-center gap-2 rounded-xl px-4 py-2.5 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Rechercher..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>F
        </kbd>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Connection status */}
        <div className="hidden sm:flex items-center gap-1.5 mr-2">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-[hsl(var(--success))]' : 'bg-gray-400'}`}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Connecté' : 'Hors ligne'}
          </span>
        </div>

        {/* Mail icon */}
        <Link href="/partner/messages">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent">
            <Mail className="h-[18px] w-[18px]" />
          </Button>
        </Link>

        {/* Notifications */}
        <Link href="/partner/alerts">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent">
            <Bell className="h-[18px] w-[18px]" />
          </Button>
        </Link>

        {/* User avatar + name — Donezo style */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-accent transition-colors ml-1">
              <Avatar className="h-9 w-9 ring-2 ring-primary/10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-semibold leading-none">{userName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>
              <p className="text-sm font-semibold">{userName}</p>
              <p className="text-xs text-muted-foreground font-normal">{orgName}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/partner/profile" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Mon profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/partner/settings" className="cursor-pointer">
                <span className="mr-2">⚙️</span>
                Paramètres
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
              <span className="mr-2">🚪</span>
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
