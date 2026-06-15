import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clearChatHistory, getChatHistory, sendChatMessage } from '../../api/client';
import type { ChatMessageItem } from '../../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ChatInput } from './ChatInput';
import { ChatMessageView } from './ChatMessageView';

export interface ChatWindowProps {
  positionId: string;
  /** Hide the internal title bar (e.g. when a parent provides its own header). */
  headerless?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-label="AI is thinking">
      <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatWindow({ positionId, headerless = false }: ChatWindowProps) {
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history, isLoading } = useQuery({
    queryKey: ['chat', positionId],
    queryFn: () => getChatHistory(positionId),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendChatMessage(positionId, message),
    onMutate: async (message) => {
      await queryClient.cancelQueries({ queryKey: ['chat', positionId] });
      const optimistic: ChatMessageItem = {
        message_id: `tmp-${Date.now()}`,
        role: 'user',
        text: message,
        response_type: null,
        data: {},
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessageItem[]>(['chat', positionId], (old) => [
        ...(old ?? []),
        optimistic,
      ]);
    },
    onSuccess: () => {
      localStorage.setItem('recruiterrag.usedChat', 'true'); // quick-start checklist milestone
      queryClient.invalidateQueries({ queryKey: ['chat', positionId] });
      // Stage moves can happen via chat — refresh the pipeline too.
      queryClient.invalidateQueries({ queryKey: ['pipeline', positionId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'The AI returned an unexpected response. Try again.');
      queryClient.invalidateQueries({ queryKey: ['chat', positionId] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearChatHistory(positionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat', positionId] }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, sendMutation.isPending]);

  return (
    <div className="flex h-full flex-col" data-tour="chat-panel">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        {headerless ? <span /> : <h3 className="text-sm font-semibold">Chat Assistant</h3>}
        <button
          onClick={() => clearMutation.mutate()}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Clear history
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && <LoadingSpinner label="Loading conversation…" />}
        {!isLoading && (history ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Ask me about your candidates in plain English. I'll show charts, lists, or summaries —
            whatever fits best.
          </p>
        )}
        {(history ?? []).map((m) => (
          <ChatMessageView key={m.message_id} message={m} />
        ))}
        {sendMutation.isPending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
      <ChatInput disabled={sendMutation.isPending} onSend={(msg) => sendMutation.mutate(msg)} />
    </div>
  );
}
