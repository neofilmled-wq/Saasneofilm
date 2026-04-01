'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './message-bubble';
import { MessageComposer } from './message-composer';
import { MessageSquare } from 'lucide-react';

interface Message {
  id: string;
  body: string;
  type: string;
  createdAt: string;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    platformRole: string | null;
    avatar?: string | null;
  };
}

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  conversationStatus: string;
  onSend: (body: string) => void;
  isSending: boolean;
}

export function MessageThread({
  messages,
  currentUserId,
  conversationStatus,
  onSend,
  isSending,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Group messages by date
  const groupedByDate: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const date = new Date(msg.createdAt).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const lastGroup = groupedByDate[groupedByDate.length - 1];
    if (lastGroup?.date === date) {
      lastGroup.messages.push(msg);
    } else {
      groupedByDate.push({ date, messages: [msg] });
    }
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <MessageSquare className="h-12 w-12" />
        <p>Aucun message dans cette conversation</p>
      </div>
    );
  }

  const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {groupedByDate.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">{group.date}</span>
              <div className="flex-1 border-t" />
            </div>
            <div className="space-y-3">
              {group.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  body={msg.body}
                  senderName={`${msg.sender.firstName} ${msg.sender.lastName}`}
                  senderRole={msg.sender.platformRole}
                  avatar={msg.sender.avatar}
                  createdAt={msg.createdAt}
                  isAdmin={!!msg.sender.platformRole && ADMIN_ROLES.includes(msg.sender.platformRole)}
                  isCurrentUser={msg.sender.id === currentUserId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <MessageComposer
        onSend={onSend}
        disabled={isSending}
        placeholder={
          conversationStatus !== 'OPEN'
            ? 'Répondre rouvrira automatiquement la conversation...'
            : 'Tapez votre message...'
        }
      />
    </div>
  );
}
