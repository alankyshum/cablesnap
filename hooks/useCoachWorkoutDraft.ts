import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoachWorkoutDraft,
  listCoachWorkoutDraftRevisions,
  restoreCoachWorkoutDraftRevision,
  startSessionFromCoachWorkoutDraft,
} from "@/lib/db/coach-workout-drafts";

export const coachWorkoutDraftQueryKeys = {
  draft: (draftId: string, coachSessionId: string) => ["coach", "workout-draft", draftId, coachSessionId] as const,
  revisions: (draftId: string, coachSessionId: string) => ["coach", "workout-draft-revisions", draftId, coachSessionId] as const,
};

export function useCoachWorkoutDraft(draftId: string | null, coachSessionId: string | null) {
  const queryClient = useQueryClient();
  const enabled = Boolean(draftId && coachSessionId);
  const draft = useQuery({
    queryKey: coachWorkoutDraftQueryKeys.draft(draftId ?? "", coachSessionId ?? ""),
    queryFn: () => getCoachWorkoutDraft(draftId!, coachSessionId!),
    enabled,
  });
  const revisions = useQuery({
    queryKey: coachWorkoutDraftQueryKeys.revisions(draftId ?? "", coachSessionId ?? ""),
    queryFn: () => listCoachWorkoutDraftRevisions(draftId!, coachSessionId!),
    enabled,
  });
  const start = useMutation({
    mutationFn: () => startSessionFromCoachWorkoutDraft(draftId!, coachSessionId!),
  });
  const restore = useMutation({
    mutationFn: ({ version, expectedRevision }: { version: number; expectedRevision: number }) =>
      restoreCoachWorkoutDraftRevision(draftId!, version, expectedRevision, coachSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coachWorkoutDraftQueryKeys.draft(draftId ?? "", coachSessionId ?? "") });
      void queryClient.invalidateQueries({ queryKey: coachWorkoutDraftQueryKeys.revisions(draftId ?? "", coachSessionId ?? "") });
    },
  });
  return { draft, revisions, start, restore };
}
