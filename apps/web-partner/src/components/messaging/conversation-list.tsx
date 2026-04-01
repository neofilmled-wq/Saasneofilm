'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { cn, Badge } from '@neofilm/ui';

interface ConversationItem {
  id: string;
  subject: string | null;
  status: string;
  lastMessageAt: string;
  lastMessage: { body: string; createdAt: string; senderName: string } | null;
  unreadCount: number;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  isLoading: boolean;
}

export function ConversationList({ conversations, isLoading }: ConversationListProps) {
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
      default: return 'outline' as const;
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}j`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <MessageSquare className="h-12 w-12" />
        <p className="text-lg font-medium">Aucune conversation</p>
        <p className="text-sm">Cliquez sur "Nouveau message" pour contacter le support.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {conversations.map((conv) => (
        <Link
          key={conv.id}
          href={`/partner/messages/${conv.id}`}
          className="flex items-start gap-3 p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-sm truncate', conv.unreadCount > 0 ? 'font-bold' : 'font-medium')}>
                {conv.subject || 'Sans objet'}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {timeAgo(conv.lastMessageAt)}
              </span>
            </div>
            {conv.lastMessage && (
              <p className={cn(
                'text-xs mt-1 truncate',
                conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {conv.lastMessage.senderName}: {conv.lastMessage.body}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={statusVariant(conv.status)} className="text-[10px] px-1 py-0">
                {statusLabel(conv.status)}
              </Badge>
            </div>
          </div>
          {conv.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {conv.unreadCount}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
