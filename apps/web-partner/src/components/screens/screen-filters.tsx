'use client';

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@neofilm/ui';
import { Search } from 'lucide-react';
import { useSites } from '@/hooks/use-sites';
import { usePartnerOrg } from '@/hooks/use-partner-org';
import type { ScreenFilters } from '@/types/screen.types';

interface ScreenFiltersBarProps {
  filters: ScreenFilters;
  onChange: (filters: ScreenFilters) => void;
}

export function ScreenFiltersBar({ filters, onChange }: ScreenFiltersBarProps) {
  const { orgId } = usePartnerOrg();
  const { data: sites } = useSites(orgId!);

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un écran..."
          value={filters.search ?? ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-10"
        />
      </div>

      <Select
        value={filters.siteId ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, siteId: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Tous les sites" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les sites</SelectItem>
          {sites?.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, status: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          <SelectItem value="online">En ligne</SelectItem>
          <SelectItem value="offline">Hors ligne</SelectItem>
          <SelectItem value="ACTIVE">Actif</SelectItem>
          <SelectItem value="INACTIVE">Inactif</SelectItem>
          <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
