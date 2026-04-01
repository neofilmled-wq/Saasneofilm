'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn, Button, Textarea } from '@neofilm/ui';

interface Message {
  id: string;
  body: string;
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

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

export function MessageThread({
  messages,
  currentUserId,
  conversationStatus,
  onSend,
  isSending,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setBody('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isClosed = conversationStatus !== 'OPEN';

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isCurrentUser = msg.sender.id === currentUserId;
          const isAdmin = !!msg.sender.platformRole && ADMIN_ROLES.includes(msg.sender.platformRole);
          const time = new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col gap-1 max-w-[75%]',
                isCurrentUser ? 'ml-auto items-end' : 'mr-auto items-start',
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">
                  {msg.sender.firstName} {msg.sender.lastName}
                  {isAdmin && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Support
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
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t bg-card p-4">
        {isClosed ? (
          <p className="text-sm text-muted-foreground">
            Cette conversation est fermée.
          </p>
        ) : (
          <>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tapez votre message..."
              disabled={isSending}
              rows={1}
              className="min-h-[40px] max-h-[120px] resize-none"
            />
            <Button size="icon" onClick={handleSend} disabled={isSending || !body.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
