import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appendMessage,
  createSession,
  deleteSession,
  getLastCoachModel,
  getPendingNewChatModel,
  getMessages,
  listSessions,
  renameSession,
  saveCoachModelSelection,
} from "@/lib/db/coach";
import type { AppendCoachMessage, CoachMessage, CoachSession, CreateCoachSession } from "@/lib/db/coach";

export const coachQueryKeys = {
  sessions: ["coach", "sessions"] as const,
  messages: (sessionId: string) => ["coach", "messages", sessionId] as const,
  lastModel: ["coach", "last-model"] as const,
  pendingNewChat: ["coach", "pending-new-chat"] as const,
};

export function useCoachSessions() {
  return useQuery({ queryKey: coachQueryKeys.sessions, queryFn: listSessions });
}

export function useCoachMessages(sessionId: string | null) {
  return useQuery({
    queryKey: coachQueryKeys.messages(sessionId ?? ""),
    queryFn: () => getMessages(sessionId!),
    enabled: sessionId !== null,
  });
}

export function useLastCoachModel() {
  return useQuery({ queryKey: coachQueryKeys.lastModel, queryFn: getLastCoachModel });
}

export function usePendingNewChatModel() {
  return useQuery({ queryKey: coachQueryKeys.pendingNewChat, queryFn: getPendingNewChatModel });
}

export function useSelectCoachModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, modelId }: { sessionId: string | null; modelId: string }) =>
      saveCoachModelSelection(sessionId, modelId),
    onMutate: async ({ sessionId, modelId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: coachQueryKeys.sessions }),
        queryClient.cancelQueries({ queryKey: coachQueryKeys.lastModel }),
        queryClient.cancelQueries({ queryKey: coachQueryKeys.pendingNewChat }),
      ]);
      const previousSessions = queryClient.getQueryData<CoachSession[]>(coachQueryKeys.sessions);
      const previousLastModel = queryClient.getQueryData<string | null>(coachQueryKeys.lastModel);
      const previousPending = queryClient.getQueryData<string | null>(coachQueryKeys.pendingNewChat);
      queryClient.setQueryData(coachQueryKeys.lastModel, modelId);
      queryClient.setQueryData(coachQueryKeys.pendingNewChat, sessionId ? null : modelId);
      if (sessionId) {
        queryClient.setQueryData<CoachSession[]>(coachQueryKeys.sessions, (sessions) =>
          sessions?.map((session) => session.id === sessionId
            ? { ...session, model_id: modelId }
            : session),
        );
      }
      return { previousSessions, previousLastModel, previousPending };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(coachQueryKeys.sessions, context?.previousSessions);
      queryClient.setQueryData(coachQueryKeys.lastModel, context?.previousLastModel);
      queryClient.setQueryData(coachQueryKeys.pendingNewChat, context?.previousPending);
    },
    onSuccess: (session, { sessionId, modelId }) => {
      queryClient.setQueryData(coachQueryKeys.lastModel, modelId);
      queryClient.setQueryData(coachQueryKeys.pendingNewChat, sessionId ? null : modelId);
      if (sessionId && session) {
        queryClient.setQueryData<CoachSession[]>(coachQueryKeys.sessions, (sessions) =>
          sessions?.map((item) => item.id === sessionId ? session : item),
        );
      }
    },
  });
}

export function useCreateCoachSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<CreateCoachSession, "title" | "model_id">) => createSession(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: coachQueryKeys.sessions }),
  });
}

export function useRenameCoachSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameSession(id, title),
    onSuccess: (session) => {
      queryClient.setQueryData<CoachSession[]>(coachQueryKeys.sessions, (sessions) =>
        sessions?.map((item) => item.id === session.id ? session : item),
      );
    },
  });
}

export function useDeleteCoachSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<CoachSession[]>(coachQueryKeys.sessions, (sessions) =>
        sessions?.filter((session) => session.id !== id),
      );
      queryClient.removeQueries({ queryKey: coachQueryKeys.messages(id) });
    },
  });
}

export function useAppendCoachMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<AppendCoachMessage, "session_id" | "role" | "content"> &
      Partial<Pick<AppendCoachMessage, "tool_calls" | "error" | "model_id">>) => appendMessage(input),
    onMutate: async (input) => {
      if (input.role !== "user") return undefined;
      const key = coachQueryKeys.messages(input.session_id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CoachMessage[]>(key);
      const optimistic: CoachMessage = {
        id: `optimistic-${Date.now()}`,
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        model_id: input.model_id ?? null,
        tool_calls: input.tool_calls ?? null,
        created_at: Date.now(),
        error: input.error ?? null,
      };
      queryClient.setQueryData<CoachMessage[]>(key, (messages = []) => [...messages, optimistic]);
      return { key, previous };
    },
    onError: (_error, input, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (message, input) => {
      const key = coachQueryKeys.messages(input.session_id);
      queryClient.setQueryData<CoachMessage[]>(key, (messages = []) => {
        const optimisticIndex = messages.findIndex((item) => item.id.startsWith("optimistic-"));
        if (optimisticIndex < 0) return [...messages, message];
        return messages.map((item, index) => index === optimisticIndex ? message : item);
      });
      queryClient.invalidateQueries({ queryKey: coachQueryKeys.sessions });
    },
  });
}
