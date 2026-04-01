'use client';

import { useState } from 'react';
import { Search, Filter, MessageSquare } from 'lucide-react';
import { cn, Badge } from '@neofilm/ui';

interface ConversationItem {
  id: string;
  subject: string | null;
  status: string;
  lastMessageAt: string;
  organization: { id: string; name: string; type: string; contactEmail?: string };
  createdBy?: { firstName: string; lastName: string };
  lastMessage: { body: string; createdAt: string; senderName: string } | null;
  unreadCount: number;
  totalMessages: number;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  filters: {
    status: string;
    orgType: string;
    q: string;
    unreadOnly: boolean;
  };
  onFiltersChange: (filters: any) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  filters,
  onFiltersChange,
}: ConversationListProps) {
  const [showFilters, setShowFilters] = useState(false);

  const statusLabel = (s: string) => {
    switch (s) {
      case 'OPEN': return 'Ouvert';
      case 'CLOSED': return 'Fermé';
      case 'ARCHIVED': return 'Archivé';
      default: return s;
    }
  };

  const statusVariant = (s: string) => {
    switch (s) {
      case 'OPEN': return 'default' as const;
      case 'CLOSED': return 'secondary' as const;
      case 'ARCHIVED': return 'outline' as const;
      default: return 'secondary' as const;
    }
  };

  const orgTypeLabel = (t: string) => t === 'PARTNER' ? 'Partenaire' : 'Annonceur';

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}j`;
  };

  return (
    <div className="flex h-full w-80 flex-col border-r bg-card">
      {/* Search */}
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher (org, email, sujet)..."
            value={filters.q}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Filter className="h-3 w-3" />
          Filtres
        </button>

        {showFilters && (
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={filters.status}
              onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
              className="h-7 rounded border bg-background px-2 text-xs"
            >
              <option value="">Tous statuts</option>
              <option value="OPEN">Ouvert</option>
              <option value="CLOSED">Fermé</option>
              <option value="ARCHIVED">Archivé</option>
            </select>
            <select
              value={filters.orgType}
              onChange={(e) => onFiltersChange({ ...filters, orgType: e.target.value })}
              className="h-7 rounded border bg-background px-2 text-xs"
            >
              <option value="">Tous types</option>
              <option value="PARTNER">Partenaire</option>
              <option value="ADVERTISER">Annonceur</option>
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={filters.unreadOnly}
                onChange={(e) => onFiltersChange({ ...filters, unreadOnly: e.target.checked })}
                className="rounded"
              />
              Non lus
            </label>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Aucune conversation</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50',
                selectedId === conv.id && 'bg-accent',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className={cn('text-sm font-medium', conv.unreadCount > 0 && 'font-bold')}>
                    {conv.organization.name}
                  </span>
                  <Badge variant={conv.organization.type === 'PARTNER' ? 'secondary' : 'outline'} className="text-[10px] px-1 py-0">
                    {orgTypeLabel(conv.organization.type)}
                  </Badge>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {timeAgo(conv.lastMessageAt)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {conv.subject || 'Sans objet'}
                </span>
                <Badge variant={statusVariant(conv.status)} className="text-[10px] px-1 py-0">
                  {statusLabel(conv.status)}
                </Badge>
              </div>

              {conv.lastMessage && (
                <p className={cn(
                  'text-xs truncate',
                  conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}>
                  {conv.lastMessage.senderName}: {conv.lastMessage.body}
                </p>
              )}

              {conv.unreadCount > 0 && (
                <div className="flex justify-end">
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {conv.unreadCount}
                  </span>
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
