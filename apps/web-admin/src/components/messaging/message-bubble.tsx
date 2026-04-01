'use client';

import { cn } from '@neofilm/ui';

interface MessageBubbleProps {
  body: string;
  senderName: string;
  senderRole: string | null;
  avatar?: string | null;
  createdAt: string;
  isAdmin: boolean;
  isCurrentUser: boolean;
}

export function MessageBubble({
  body,
  senderName,
  senderRole: _senderRole,
  createdAt,
  isAdmin,
  isCurrentUser,
}: MessageBubbleProps) {
  const time = new Date(createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex flex-col gap-1 max-w-[75%]',
        isCurrentUser ? 'ml-auto items-end' : 'mr-auto items-start',
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">
          {senderName}
          {isAdmin && (
            <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Admin
            </span>
          )}
        </span>
        <span>{time}</span>
      </div>
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isCurrentUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md',
        )}
      >
        {body}
      </div>
    </div>
  );
}
