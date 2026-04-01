'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button, Badge } from '@neofilm/ui';
import { useAuth } from '@/providers/auth-provider';
import { queryKeys } from '@/lib/api/query-keys';
import {
  fetchConversation,
  sendMessage,
  markRead,
  reopenConversation,
} from '@/lib/api/messaging';
import { useMessagingSocket } from '@/hooks/use-messaging-socket';
import { MessageThread } from '@/components/messaging/message-thread';

export default function AdvertiserConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { joinConversation, leaveConversation, isConnected } = useMessagingSocket();

  const { data: conversation, isLoading } = useQuery({
    queryKey: queryKeys.conversations.detail(conversationId),
    queryFn: () => fetchConversation(conversationId),
    enabled: !!conversationId,
  });

  // Join WS room
  useEffect(() => {
    if (conversationId && isConnected) {
      joinConversation(conversationId);
      return () => leaveConversation(conversationId);
    }
  }, [conversationId, isConnected, joinConversation, leaveConversation]);

  // Auto mark read
  useEffect(() => {
    if (!conversationId) return;
    const timer = setTimeout(() => {
      markRead(conversationId).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [conversationId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMessage(conversationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
    onError: (err: Error) => toast.error(`Erreur: ${err.message}`),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenConversation(conversationId),
    onSuccess: () => {
      toast.success('Conversation rouverte');
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-6 text-center text-muted-foreground">Conversation introuvable</div>
    );
  }

  const statusLabel = conversation.status === 'OPEN' ? 'Ouvert' : conversation.status === 'CLOSED' ? 'Fermé' : 'Archivé';

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/messages')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{conversation.subject || 'Sans objet'}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={conversation.status === 'OPEN' ? 'default' : 'secondary'} className="text-[10px] px-1 py-0">
              {statusLabel}
            </Badge>
            {isConnected && (
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Connecté
              </span>
            )}
          </div>
        </div>
        {conversation.status === 'CLOSED' && (
          <Button size="sm" variant="outline" onClick={() => reopenMutation.mutate()}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Réouvrir
          </Button>
        )}
      </div>

      {/* Messages */}
      <MessageThread
        messages={conversation.messages ?? []}
        currentUserId={user?.id ?? ''}
        conversationStatus={conversation.status}
        onSend={(body) => sendMutation.mutate(body)}
        isSending={sendMutation.isPending}
      />
    </div>
  );
}
