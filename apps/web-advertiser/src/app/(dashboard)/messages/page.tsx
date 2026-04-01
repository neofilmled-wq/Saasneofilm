'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@neofilm/ui';
import { queryKeys } from '@/lib/api/query-keys';
import { fetchMyConversations, createConversation } from '@/lib/api/messaging';
import { useMessagingSocket } from '@/hooks/use-messaging-socket';
import { ConversationList } from '@/components/messaging/conversation-list';
import { NewConversationDialog } from '@/components/messaging/new-conversation-dialog';

export default function AdvertiserMessagesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  useMessagingSocket();

  const { data, isLoading, error: listError } = useQuery({
    queryKey: queryKeys.conversations.all,
    queryFn: () => fetchMyConversations(),
    refetchInterval: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (listError) {
      toast.error(`Erreur chargement: ${listError.message}`);
    }
  }, [listError]);

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conversation: { id: string }) => {
      toast.success('Message envoyé');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      router.push(`/messages/${conversation.id}`);
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`);
    },
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-sm text-muted-foreground">Vos conversations avec le support NeoFilm</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau message
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <ConversationList
          conversations={data?.data ?? []}
          isLoading={isLoading}
        />
      </div>

      <NewConversationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(d) => createMutation.mutate(d)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
