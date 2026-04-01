'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchAdminConversations,
  fetchAdminConversation,
  adminSendMessage,
  adminMarkRead,
  adminCloseConversation,
  adminArchiveConversation,
  adminReopenConversation,
} from '@/lib/api/messaging';
import { useMessagingSocket } from '@/hooks/use-messaging-socket';
import { ConversationList } from '@/components/messaging/conversation-list';
import { MessageThread } from '@/components/messaging/message-thread';
import { ConversationInfo } from '@/components/messaging/conversation-info';

export default function AdminMessagesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { joinConversation, leaveConversation, isConnected } = useMessagingSocket();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    orgType: '',
    q: '',
    unreadOnly: false,
  });

  // Fetch conversation list
  const { data: listData, isLoading: listLoading, error: listError } = useQuery({
    queryKey: [...queryKeys.conversations.all, filters],
    queryFn: () =>
      fetchAdminConversations({
        status: filters.status || undefined,
        unreadOnly: filters.unreadOnly || undefined,
        q: filters.q || undefined,
        orgType: filters.orgType || undefined,
      }),
    refetchInterval: 30000,
    retry: 1,
  });

  // Show error if conversation list fails to load
  useEffect(() => {
    if (listError) {
      toast.error(`Erreur chargement: ${listError.message}`);
    }
  }, [listError]);

  // Fetch selected conversation detail
  const { data: conversationDetail } = useQuery({
    queryKey: queryKeys.conversations.detail(selectedId ?? ''),
    queryFn: () => fetchAdminConversation(selectedId!),
    enabled: !!selectedId,
  });

  // WS: join/leave conversation room
  useEffect(() => {
    if (selectedId && isConnected) {
      joinConversation(selectedId);
      return () => {
        leaveConversation(selectedId);
      };
    }
  }, [selectedId, isConnected, joinConversation, leaveConversation]);

  // Auto-mark-read when opening a conversation (debounce 1s)
  useEffect(() => {
    if (!selectedId || !user?.id) return;
    const timer = setTimeout(() => {
      adminMarkRead(selectedId).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedId, user?.id, queryClient]);

  // Refetch detail when conversation list changes (new messages)
  useEffect(() => {
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(selectedId) });
    }
  }, [listData, selectedId, queryClient]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: ({ body }: { body: string }) =>
      adminSendMessage(selectedId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(selectedId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`);
    },
  });

  // Status mutations
  const closeMutation = useMutation({
    mutationFn: () => adminCloseConversation(selectedId!),
    onSuccess: () => {
      toast.success('Conversation fermée');
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(selectedId!) });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => adminArchiveConversation(selectedId!),
    onSuccess: () => {
      toast.success('Conversation archivée');
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(selectedId!) });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => adminReopenConversation(selectedId!),
    onSuccess: () => {
      toast.success('Conversation rouverte');
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(selectedId!) });
    },
  });

  const handleSend = useCallback(
    (body: string) => {
      if (selectedId) sendMutation.mutate({ body });
    },
    [selectedId, sendMutation],
  );

  const conversations = listData?.data ?? [];

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left panel: conversation list */}
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        isLoading={listLoading}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Center panel: message thread */}
      {selectedId && conversationDetail ? (
        <>
          <div className="flex flex-1 flex-col">
            {/* Thread header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {conversationDetail.subject || 'Sans objet'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {conversationDetail.organization.name} &middot;{' '}
                  {conversationDetail.messages?.length ?? 0} messages
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isConnected && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Connecté
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <MessageThread
              messages={conversationDetail.messages ?? []}
              currentUserId={user?.id ?? ''}
              conversationStatus={conversationDetail.status}
              onSend={handleSend}
              isSending={sendMutation.isPending}
            />
          </div>

          {/* Right panel: info */}
          <ConversationInfo
            conversation={conversationDetail}
            onClose={() => closeMutation.mutate()}
            onArchive={() => archiveMutation.mutate()}
            onReopen={() => reopenMutation.mutate()}
            isActioning={
              closeMutation.isPending ||
              archiveMutation.isPending ||
              reopenMutation.isPending
            }
          />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <MessageSquare className="h-16 w-16" />
          <p className="text-lg font-medium">Messages</p>
          <p className="text-sm">Sélectionnez une conversation pour voir les messages</p>
        </div>
      )}
    </div>
  );
}
