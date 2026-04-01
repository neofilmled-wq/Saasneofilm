'use client';

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from '@neofilm/ui';
import { cn } from '@neofilm/ui';
import { ExternalLink, Wifi, WifiOff } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatRelative, formatCurrency, getHealthScoreColor, type ScreenStatusColor } from '@/lib/utils';
import type { ScreenWithStatus } from '@/types/screen.types';

interface ScreenListProps {
  screens: ScreenWithStatus[];
}

function getScreenStatus(screen: ScreenWithStatus): ScreenStatusColor {
  if (screen.status === 'MAINTENANCE') return 'maintenance';
  if (screen.status === 'INACTIVE' || screen.status === 'DECOMMISSIONED') return 'inactive';
  if (!screen.liveStatus) return 'offline';
  if (screen.liveStatus.isOnline && screen.liveStatus.errorCount24h > 5) return 'degraded';
  return screen.liveStatus.isOnline ? 'online' : 'offline';
}

export function ScreenList({ screens }: ScreenListProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Écran</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Appareil</TableHead>
            <TableHead className="text-center">Santé</TableHead>
            <TableHead>Revenu/mois</TableHead>
            <TableHead>Vu il y a</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {screens.map((screen) => {
            const status = getScreenStatus(screen);
            return (
              <TableRow key={screen.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{screen.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {screen.type === 'smartTV' ? 'Smart TV' : 'Android Stick'}
                      {screen.brand && ` · ${screen.brand}`}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{screen.siteName}</TableCell>
                <TableCell>
                  <StatusBadge status={status} />
                </TableCell>
                <TableCell>
                  {screen.activeDeviceId ? (
                    <div className="flex items-center gap-1.5">
                      <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Appairé</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs text-muted-foreground">Non appairé</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {screen.healthScore !== undefined ? (
                    <span className={cn('font-semibold text-sm', getHealthScoreColor(screen.healthScore))}>
                      {screen.healthScore}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {formatCurrency(screen.monthlyPriceCents)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {screen.liveStatus?.lastHeartbeatAt
                    ? formatRelative(screen.liveStatus.lastHeartbeatAt)
                    : '—'}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link href={`/partner/screens/${screen.id}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
