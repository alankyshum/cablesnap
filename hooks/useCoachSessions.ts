import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appendMessage,
  createSession,
  deleteSession,
  getMessages,
  listSessions,
  renameSession,
} from "@/lib/db/coach";
import type { AppendCoachMessage, CoachMessage, CoachSession, CreateCoachSession } from "@/lib/db/coach";

export const coachQueryKeys = {
  sessions: ["coach", "sessions"] as const,
  messages: (sessionId: string) => ["coach", "messages", sessionId] as const,
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
      Partial<Pick<AppendCoachMessage, "tool_calls" | "error">>) => appendMessage(input),
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
