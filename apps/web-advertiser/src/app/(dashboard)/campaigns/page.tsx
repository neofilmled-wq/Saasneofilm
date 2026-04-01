'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Megaphone, Tv, BookOpen } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Skeleton,
} from '@neofilm/ui';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('fr-FR').format(new Date(date));
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'En attente',
  APPROVED: 'Validée',
  ACTIVE: 'Actif',
  REJECTED: 'Rejeté',
  FINISHED: 'Terminé',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  PENDING_REVIEW: 'secondary',
  APPROVED: 'default',
  ACTIVE: 'default',
  REJECTED: 'destructive',
  FINISHED: 'secondary',
};

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  type: string;
  budgetCents: number;
  spentCents: number;
  startDate: string;
  endDate: string;
  groupId?: string | null;
}

interface CampaignRow {
  id: string; // primary campaign id (for navigation)
  name: string;
  description?: string;
  status: string;
  types: string[];
  budgetCents: number; // combined if grouped
  spentCents: number;
  startDate: string;
  endDate: string;
  isGroup: boolean;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', user?.orgId],
    queryFn: () => apiFetch(`/campaigns?${user?.orgId ? `advertiserOrgId=${user.orgId}&` : ''}limit=100`),
    enabled: !!user,
  });

  const campaigns: Campaign[] = Array.isArray(data?.data) ? data.data : [];

  // Group campaigns by groupId
  const rows = useMemo<CampaignRow[]>(() => {
    const grouped = new Map<string, Campaign[]>();
    const standalone: Campaign[] = [];

    for (const c of campaigns) {
      if (c.groupId) {
        const existing = grouped.get(c.groupId) ?? [];
        existing.push(c);
        grouped.set(c.groupId, existing);
      } else {
        standalone.push(c);
      }
    }

    const result: CampaignRow[] = [];

    // Add grouped rows (shown as one)
    for (const group of grouped.values()) {
      const primary = group[0];
      result.push({
        id: primary.id,
        name: primary.name,
        description: primary.description,
        status: primary.status,
        types: group.map((c) => c.type),
        budgetCents: group.reduce((sum, c) => sum + (c.budgetCents ?? 0), 0),
        spentCents: group.reduce((sum, c) => sum + (c.spentCents ?? 0), 0),
        startDate: primary.startDate,
        endDate: primary.endDate,
        isGroup: true,
      });
    }

    // Add standalone rows
    for (const c of standalone) {
      result.push({
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        types: [c.type],
        budgetCents: c.budgetCents ?? 0,
        spentCents: c.spentCents ?? 0,
        startDate: c.startDate,
        endDate: c.endDate,
        isGroup: false,
      });
    }

    // Sort by most recent first (grouped campaigns will appear at top since they're processed first)
    return result;
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes campagnes</h1>
          <p className="text-muted-foreground">Gérez vos campagnes publicitaires</p>
        </div>
        <Link href="/campaigns/new">
          <Button><Plus className="mr-2 h-4 w-4" /> Nouvelle campagne</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Megaphone className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Aucune campagne pour le moment</p>
              <Link href="/campaigns/new">
                <Button variant="outline" className="mt-4">Créer ma première campagne</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campagne</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Budget/mois</TableHead>
                  {/* Dépensé masqué */}
                  <TableHead>Période</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/campaigns/${row.id}`)}
                  >
                    <TableCell>
                      <span className="font-medium">{row.name}</span>
                      {row.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{row.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'}>
                        {STATUS_LABELS[row.status] || row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.types.includes('AD_SPOT') && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <Tv className="h-3 w-3" /> Spot TV
                          </span>
                        )}
                        {row.types.includes('CATALOG_LISTING') && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            <BookOpen className="h-3 w-3" /> Catalogue
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.budgetCents)}</TableCell>
                    {/* Dépensé masqué */}
                    <TableCell className="text-muted-foreground text-sm">
                      {row.startDate ? formatDate(row.startDate) : '-'} → {row.endDate ? formatDate(row.endDate) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
