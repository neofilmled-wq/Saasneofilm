'use client';

import { Search, LayoutGrid, List } from 'lucide-react';
import { Input } from '@neofilm/ui';
import type { CampaignStatus } from '@/lib/mock-data';

const STATUS_TABS: { label: string; value: CampaignStatus | 'ALL' }[] = [
  { label: 'Toutes', value: 'ALL' },
  { label: 'En attente', value: 'PENDING_REVIEW' },
  { label: 'Validées', value: 'APPROVED' },
  { label: 'Actives', value: 'ACTIVE' },
  { label: 'Rejetées', value: 'REJECTED' },
  { label: 'Terminées', value: 'FINISHED' },
];

interface CampaignFiltersProps {
  status: CampaignStatus | 'ALL';
  onStatusChange: (status: CampaignStatus | 'ALL') => void;
  search: string;
  onSearchChange: (search: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export function CampaignFilters({
  status,
  onStatusChange,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: CampaignFiltersProps) {
  return (
    <div className="mb-6 space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onStatusChange(tab.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              status === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une campagne..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`rounded-l-lg p-2 ${viewMode === 'grid' ? 'bg-muted' : ''}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`rounded-r-lg p-2 ${viewMode === 'list' ? 'bg-muted' : ''}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
