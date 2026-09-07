/* eslint-disable max-lines */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUp, Bot, Square } from "lucide-react-native";
import { Bubble, Chat, useStreamingMessages, type IMessage, type BubbleProps, type SendProps, type MessageTextProps } from "@kesha-antonov/react-native-chat";
import { useQueryClient } from "@tanstack/react-query";
import { bumpQueryVersion } from "@/lib/query";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useAppendCoachMessage, useCreateCoachSession, coachQueryKeys } from "@/hooks/useCoachSessions";
import { startCoachAgent } from "@/lib/ai/agent";
import { canSendGymPhoto, getCurrentGymPhotoModel } from "@/lib/ai/catalog";
import { coachToolsForSession } from "@/lib/ai/tools";
import { toChatErrorState, type AIError, type ChatErrorState } from "@/lib/ai/errors";
import { t } from "@/lib/i18n";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import type { CoachMessage } from "@/lib/db/coach";
import { CoachEmptyState } from "./CoachEmptyState";
import { CoachErrorCard } from "./CoachErrorCard";
import { CoachMarkdown, hasMarkdownTable } from "./CoachMarkdown";
import { CoachThinkingIndicator } from "./CoachThinkingIndicator";
import { CoachToolBadge } from "./CoachToolBadge";
import { useCoachGymPhoto } from "@/hooks/useCoachGymPhoto";
import { GYM_PHOTO_MARKER, type PreparedGymPhoto } from "@/lib/coach-gym-photo";
import { CoachWorkoutDraftCard } from "./CoachWorkoutDraftCard";
import { CoachGymPhotoComposer } from "./CoachGymPhotoComposer";
import { useCoachWorkoutDraft } from "@/hooks/useCoachWorkoutDraft";
import type { CoachWorkoutDraft } from "@/lib/types";

export type CoachConversationProps = {
  messages: CoachMessage[];
  activeSessionId: string | null;
  selectedModelId: string | null;
  isMissingKey: boolean;
  activeError: ChatErrorState | null;
  sessions?: { id: string; model_id: string }[];
  onSessionCreated?: (id: string, modelId: string) => void;
  onOpenModelPicker: () => void;
  onDismissError: () => void;
  onRefreshCatalog?: () => void;
  onRetry?: () => void;
  onError?: (error: ChatErrorState) => void;
};

function toIMessage(message: CoachMessage): IMessage {
  const draftCard = parseDraftToolCall(message.tool_calls, message.id);
  return {
    _id: message.id,
    text: message.content,
    createdAt: new Date(message.created_at),
    user:
      message.role === "user"
        ? { _id: 1, name: t({ id: "components.coach.you", message: "You" }) }
        : { _id: 2, name: t({ id: "components.coach.aiCoachName", message: "AI Coach" }) },
    ...(message.role === "system" ? { system: true } : {}),
    ...(message.tool_calls ? { __toolCalls: true } : {}),
    ...(draftCard ? { __draftCard: draftCard } : {}),
  } as IMessage & { __toolCalls?: boolean };
}

type DraftCardData = { messageId: string; draftId: string; revision: number; equipment?: Array<{ label: string; confidence?: number; uncertainty?: string }>; draft: CoachWorkoutDraft; reasons?: unknown[] };
// Structured tool payload validation intentionally keeps all acceptance checks together.
// eslint-disable-next-line complexity
export function parseDraftToolCall(value: string | null | undefined, messageId = ""): DraftCardData | null {
  if (!value) return null;
  try {
    const calls = JSON.parse(value) as Array<{ name?: string; toolName?: string; output?: unknown }>;
    const unwrap = (value: unknown): { ok?: boolean; operation?: unknown; data?: unknown } | undefined => {
      let current: unknown = value;
      for (let depth = 0; depth < 4; depth += 1) {
        if (typeof current === "string") {
          try { current = JSON.parse(current); } catch { return undefined; }
        }
        if (!current || typeof current !== "object") return undefined;
        const record = current as { type?: unknown; value?: unknown };
        if (record.type === "json" && "value" in record) { current = record.value; continue; }
        return current as { ok?: boolean; operation?: unknown; data?: unknown };
      }
      return undefined;
    };
    const call = [...calls].reverse().find((item) => {
      const output = unwrap(item.output);
      const name = item.name ?? item.toolName;
      return ["create_gym_workout_draft", "modify_gym_workout_draft", "restore_gym_workout_revision"].includes(String(name))
        && ["create_draft", "modify_draft", "restore_revision"].includes(String(output?.operation));
    });
    const output = unwrap(call?.output);
    if (!output?.ok || !output.data || typeof output.data !== "object") return null;
    const data = output.data as Record<string, unknown>;
    if (typeof data.draftId !== "string" || !data.draftId || !Number.isInteger(data.revision) || Number(data.revision) < 1) return null;
    if (!Array.isArray(data.equipment) || data.equipment.length === 0 || data.equipment.length > 20 || !Array.isArray(data.reasons) || data.reasons.length === 0 || !data.draft || typeof data.draft !== "object") return null;
    if (!data.equipment.every((item) => {
      if (!item || typeof item !== "object") return false;
      const equipment = item as Record<string, unknown>;
      return typeof equipment.label === "string" && equipment.label.length > 0 && equipment.label.length <= 40
        && typeof equipment.confidence === "number" && Number.isFinite(equipment.confidence) && equipment.confidence >= 0 && equipment.confidence <= 1
        && (equipment.uncertainty == null || typeof equipment.uncertainty === "string");
    })) return null;
    if (!data.reasons.every((item) => {
      if (!item || typeof item !== "object") return false;
      const reason = item as Record<string, unknown>;
      return ["code", "input", "source", "rule", "bound", "fallback", "uncertainty", "override"].every((key) => reason[key] == null || typeof reason[key] === "string")
        && Boolean(reason.input ?? reason.source ?? reason.rule);
    })) return null;
    const draft = data.draft as Record<string, unknown>;
    // eslint-disable-next-line complexity
    if ((draft.name != null && typeof draft.name !== "string") || (draft.estimatedMinutes != null && (typeof draft.estimatedMinutes !== "number" || !Number.isFinite(draft.estimatedMinutes))) || !Array.isArray(draft.exercises) || !draft.exercises.length || draft.exercises.length > 30 || !draft.exercises.every((item) => {
      if (!item || typeof item !== "object") return false;
      const exercise = item as Record<string, unknown>;
      const rest = exercise.rest_seconds ?? exercise.restSeconds;
      return typeof exercise.exercise_id === "string" && exercise.exercise_id.length > 0
        && Number.isInteger(exercise.sets) && Number(exercise.sets) > 0 && Number(exercise.sets) <= 20
        && (typeof exercise.reps === "number" ? Number.isInteger(exercise.reps) && exercise.reps >= 1 && exercise.reps <= 100 : typeof exercise.reps === "string" && exercise.reps.length > 0 && exercise.reps.length <= 30)
        && Number.isInteger(Number(rest)) && Number(rest) >= 0 && Number(rest) <= 3600;
    })) return null;
    return { messageId, draftId: data.draftId, revision: Number(data.revision), equipment: data.equipment as DraftCardData["equipment"], reasons: data.reasons, draft: data.draft as CoachWorkoutDraft };
  } catch { return null; }
}

function toIMessages(messages: CoachMessage[]): IMessage[] {
  return messages
    .filter((m) => m.role !== "tool" && !m.error)
    .map(toIMessage);
}

const isCoachMessageGestureEnabled = (message: IMessage) => !hasMarkdownTable(message.text ?? "");

// eslint-disable-next-line max-lines-per-function
export function CoachConversation({
  messages,
  activeSessionId,
  selectedModelId,
  isMissingKey,
  activeError,
  onSessionCreated,
  onOpenModelPicker,
  onDismissError,
  onRefreshCatalog,
  onRetry,
  onError,
}: CoachConversationProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const isNarrowScreen = viewportWidth < 768;
  const queryClient = useQueryClient();
  const append = useAppendCoachMessage();
  const create = useCreateCoachSession();
  const [inFlightTool, setInFlightTool] = useState<string | null>(null);
  const gymPhoto = useCoachGymPhoto();
  const { cleanup: cleanupGymPhoto, ensureConsent, consent, pick, consented, disclosure } = gymPhoto;
  const [pendingGymPhoto, setPendingGymPhoto] = useState<PreparedGymPhoto | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);
  const consentResolver = useRef<((accepted: boolean) => void) | null>(null);
  const pendingGymPhotoRef = useRef<PreparedGymPhoto | null>(null);
  const handleRef = useRef<ReturnType<typeof stream.startStream> | null>(null);
  const runRef = useRef<ReturnType<typeof startCoachAgent> | null>(null);
  const runningSessionIdRef = useRef<string | null>(null);
  const runOwnerRef = useRef<symbol | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  // FlashList cannot use the chat library's inverted content-container alignment.
  // Keep chronological data in a normal list so native FlashList can remain enabled
  // while `isAlignedTop` correctly places short conversations below the header.
  const stream = useStreamingMessages<IMessage>({ initialMessages: toIMessages(messages), inverted: false });
  const activeDraft = useMemo(() => [...messages].reverse().map((message) => parseDraftToolCall(message.tool_calls, message.id)).find(Boolean) ?? null, [messages]);
  const draft = useCoachWorkoutDraft(activeDraft?.draftId ?? null, activeSessionId);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const quickPrompts = useMemo(
    () => [
      t({ id: "components.coach.quickPrompt1", message: "How have my last few workouts gone?" }),
      t({ id: "components.coach.quickPrompt2", message: "What did I eat this week?" }),
      t({ id: "components.coach.quickPrompt3", message: "Show my bench press progression" }),
      t({ id: "components.coach.quickPrompt4", message: "How can I optimize my recovery?" }),
    ],
    []
  );

  // React Query updates the message prop twice while a user message is appended
  // (optimistic insert, then persisted replacement). Those effects can run after
  // startStream(), so never replace the hook's array while this component owns a
  // run: doing so removes the streaming message and all later handle.push calls
  // have no matching message to update.
  useEffect(() => {
    const ownsThisSession = runningSessionIdRef.current !== null && runningSessionIdRef.current === activeSessionId;
    if (!ownsThisSession) stream.setMessages(toIMessages(messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, messages]);

  // Abort when navigation moves away from the run's session. Creating a new
  // session changes null -> its new id, but runningSessionIdRef already contains
  // that id, so the newly-started stream is preserved.
  useEffect(() => {
    // An attachment belongs to the currently selected conversation even when
    // no request is running. Always discard it on a session switch; only stop
    // the stream when the switch actually moves away from its owner.
    cleanupGymPhoto();
    pendingGymPhotoRef.current = null;
    // State must clear synchronously with the session switch so the Send
    // affordance cannot retain an attachment from another conversation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingGymPhoto(null);
    if (runningSessionIdRef.current === null || runningSessionIdRef.current === activeSessionId) return;
    stream.stop();
    runRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, cleanupGymPhoto]);

  // Unmount always aborts, including while a just-created session is streaming.
  useEffect(() => () => {
    stream.stop();
    runRef.current?.abort();
    cleanupGymPhoto();
    pendingGymPhotoRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupGymPhoto]);

  // This callback coordinates persistence, streaming, cancellation, and races
  // between navigation and the async SQLite/agent operations.
  const send = useCallback(
    // eslint-disable-next-line complexity
    async (outgoing: IMessage[]) => {
      const prompt = outgoing[outgoing.length - 1]?.text.trim();
      const attachment = pendingGymPhoto;
      const effectivePrompt = attachment ? `${GYM_PHOTO_MARKER}${prompt ? `\n${prompt}` : ""}` : prompt;
      if (((!effectivePrompt || effectivePrompt === GYM_PHOTO_MARKER) && !attachment) || stream.isStreaming) return;
      if (isMissingKey) {
        cleanupGymPhoto();
        pendingGymPhotoRef.current = null;
        setPendingGymPhoto(null);
        onError?.(toChatErrorState({ kind: "missing_key" }));
        return;
      }
      if (!selectedModelId) {
        cleanupGymPhoto();
        pendingGymPhotoRef.current = null;
        setPendingGymPhoto(null);
        onOpenModelPicker();
        return;
      }
      if (attachment) {
        try {
          const model = await getCurrentGymPhotoModel(selectedModelId);
          if (!canSendGymPhoto(model)) throw { kind: "model_lacks_image_input" } satisfies AIError;
        } catch (error) {
          cleanupGymPhoto();
          pendingGymPhotoRef.current = null;
          setPendingGymPhoto(null);
          const aiError = error && typeof error === "object" && "kind" in error
            ? error as AIError
            : { kind: "catalog_unavailable" } as const;
          onError?.(toChatErrorState(aiError));
          return;
        }
      }
      let sessionId = activeSessionId;
      const sessionAtSend = activeSessionId;
      const owner = Symbol("coach-run");
      let ownedHandle: ReturnType<typeof stream.startStream> | null = null;
      let ownedRun: ReturnType<typeof startCoachAgent> | null = null;
      try {
        if (!sessionId) {
          const session = await create.mutateAsync({ title: (effectivePrompt || "Gym photo").slice(0, 36), model_id: selectedModelId });
          // Creating the SQLite row is not cancellable. If the user selected a
          // different conversation while it was being created, leave the new
          // empty row in history but never steal focus or start an agent for it.
          if (activeSessionIdRef.current !== sessionAtSend) return;
          sessionId = session.id;
          activeSessionIdRef.current = sessionId;
          onSessionCreated?.(session.id, selectedModelId);
        }
        runOwnerRef.current = owner;
        runningSessionIdRef.current = sessionId;
        // Recheck immediately before the durable write as the live catalog may
        // have changed while a new conversation was being created.
        if (attachment) {
          const currentModel = await getCurrentGymPhotoModel(selectedModelId);
          if (!canSendGymPhoto(currentModel)) throw { kind: "model_lacks_image_input" } satisfies AIError;
        }
        const persistedUser = await append.mutateAsync({
          session_id: sessionId,
          role: "user",
          // Durable chat state contains only the neutral marker. The actual
          // request text/photo part is passed to the agent for this turn only.
          content: attachment ? GYM_PHOTO_MARKER : effectivePrompt,
          model_id: selectedModelId,
        });
        // The user can switch conversations while SQLite is writing. Do not
        // start an agent for a conversation that is no longer active.
        if (activeSessionIdRef.current !== sessionId || runOwnerRef.current !== owner) return;
        stream.append(toIMessage(persistedUser));
        const handle = stream.startStream({
          user: { _id: 2, name: t({ id: "components.coach.aiCoachName", message: "AI Coach" }) },
          text: "",
          createdAt: new Date(),
        });
        ownedHandle = handle;
        handleRef.current = handle;
        const run = startCoachAgent({
          sessionId,
          modelId: selectedModelId,
          prompt: attachment ? (prompt || "Identify the equipment in this gym photo.") : effectivePrompt,
          tools: coachToolsForSession(sessionId),
          gymPhoto: attachment ?? undefined,
          signal: handle.signal,
          onEvent: (event) => {
            if (event.type === "delta") handle.push(event.text);
            else if (event.type === "tool-call") setInFlightTool(event.name);
            else if (event.type === "tool-result") setInFlightTool(null);
          },
        });
        ownedRun = run;
        runRef.current = run;
        const persisted = await run.done;
        handle.done({ _id: persisted.id });
        await queryClient.invalidateQueries({ queryKey: coachQueryKeys.messages(sessionId) });
        // Draft tools append revisions during the same assistant turn. Refresh
        // the durable draft/revision queries so the card never shows a stale
        // latest revision after a conversational modification or restore.
        await queryClient.invalidateQueries({ queryKey: ["coach", "workout-draft"] });
        await queryClient.invalidateQueries({ queryKey: ["coach", "workout-draft-revisions"] });
      } catch (err) {
        const aiError =
          err && typeof err === "object" && "kind" in err ? (err as AIError) : ({ kind: "network_error" } as const);
        ownedHandle?.done();
        if (aiError.kind !== "aborted_by_user") {
          onError?.(toChatErrorState(aiError));
        }
      } finally {
        cleanupGymPhoto();
        pendingGymPhotoRef.current = null;
        setPendingGymPhoto(null);
        if (runOwnerRef.current === owner) {
          if (handleRef.current === ownedHandle) handleRef.current = null;
          if (runRef.current === ownedRun) runRef.current = null;
          runOwnerRef.current = null;
          runningSessionIdRef.current = null;
          setInFlightTool(null);
        }
      }
    },
    [
      stream,
      isMissingKey,
      selectedModelId,
      activeSessionId,
      onError,
      onOpenModelPicker,
      create,
      onSessionCreated,
      append,
      cleanupGymPhoto,
      pendingGymPhoto,
      queryClient,
    ]
  );

  const theme = useMemo(
    () => ({
      colors: {
        accent: colors.primary,
        background: colors.background,
        incomingBubble: colors.surfaceVariant,
        outgoingBubble: colors.primary,
        incomingText: colors.onSurface,
        outgoingText: colors.onPrimary,
        incomingMeta: colors.onSurfaceVariant,
        outgoingMeta: colors.onPrimary,
        separator: colors.outlineVariant,
        inputBackground: colors.surfaceVariant,
        inputBarBackground: colors.surface,
        inputText: colors.onSurface,
        placeholder: colors.onSurfaceVariant,
        surface: colors.surface,
        error: colors.error,
      },
      typography: {
        message: {
          fontSize: fontSizes.base,
          lineHeight: 22,
        },
      },
    }),
    [colors]
  );

  const toolLabel = inFlightTool
    ? `${inFlightTool === "recent_sessions"
      ? t({ id: "components.coach.toolReadingHistory", message: "Reading workout history" })
      : inFlightTool === "exercise_history"
        ? t({ id: "components.coach.toolExerciseProgress", message: "Analyzing exercise progress" })
        : inFlightTool === "nutrition_macros"
          ? t({ id: "components.coach.toolNutritionMacros", message: "Reviewing nutrition & macros" })
          : inFlightTool === "create_workout_template"
            ? t({ id: "components.coach.toolCreateTemplate", message: "Creating workout template" })
          : t({ id: "components.coach.usingTool", message: "Using tool: {tool}" }, { tool: inFlightTool })}...`
    : null;

  // eslint-disable-next-line complexity
  const renderCustomView = useCallback(
    // eslint-disable-next-line complexity
    ({ currentMessage }: BubbleProps<IMessage>) => {
      const custom = currentMessage as IMessage & { __toolCalls?: boolean };
      const card = (currentMessage as IMessage & { __draftCard?: DraftCardData }).__draftCard;
      if (card && activeDraft?.messageId === card.messageId && currentMessage.user?._id === 2) {
        const durableRevision = draft.draft.data?.revision;
        const durableDraft = durableRevision?.canonical_draft as CoachWorkoutDraft | undefined;
        const sourceEquipment = Array.isArray(draft.draft.data?.source_metadata?.equipment) ? draft.draft.data?.source_metadata?.equipment as DraftCardData["equipment"] : undefined;
        return (
          <CoachWorkoutDraftCard
            draft={durableDraft ?? card.draft}
            equipment={sourceEquipment ?? card.equipment}
            revision={durableRevision?.version ?? card.revision}
            reasons={durableRevision?.reason_ledger ?? card.reasons}
            revisions={draft.revisions.data ?? []}
            onStart={async () => {
              const id = await draft.start.mutateAsync();
              bumpQueryVersion("home");
              router.push(`/session/${id}`);
            }}
            onRestore={async (version) => {
              const currentVersion = draft.draft.data?.revision?.version ?? card.revision;
              const restored = await draft.restore.mutateAsync({ version, expectedRevision: currentVersion });
              if (activeSessionId) await queryClient.invalidateQueries({ queryKey: coachQueryKeys.messages(activeSessionId) });
              return restored ? { draft: restored.canonical_draft as CoachWorkoutDraft, revision: restored.version, reasons: restored.reason_ledger } : undefined;
            }}
          />
        );
      }
      const isEmptyAssistantStream = currentMessage.user?._id === 2
        && Boolean(currentMessage.streaming)
        && !currentMessage.text;
      const isToolRunning = Boolean(currentMessage.streaming && toolLabel);
      const label = custom.__toolCalls
        ? t({ id: "components.coach.dataConsulted", message: "Data consulted: local records" })
        : isToolRunning
          ? toolLabel
          : null;
      if (isEmptyAssistantStream) {
        return (
          <CoachThinkingIndicator
            label={toolLabel}
            accessibilityLabel={
              toolLabel || t({ id: "components.coach.thinkingA11y", message: "AI Coach is thinking" })
            }
          />
        );
      }
      return label ? <CoachToolBadge label={label} isStreaming={isToolRunning} /> : null;
    },
    [toolLabel, draft, router, activeSessionId, queryClient, activeDraft]
  );

  const renderAvatar = useCallback(
    (avatarProps: { currentMessage?: IMessage }) => {
      const currentMessage = avatarProps?.currentMessage;
      if (!currentMessage || currentMessage.user?._id !== 2) {
        return null;
      }
      return (
        <View
          style={[
            styles.assistantAvatar,
            {
              backgroundColor: colors.primaryContainer,
              borderColor: colors.outlineVariant,
            },
          ]}
          accessibilityRole="image"
          accessibilityLabel={t({ id: "components.coach.aiCoachName", message: "AI Coach" })}
        >
          <Bot size={18} color={colors.primary} />
        </View>
      );
    },
    [colors.primaryContainer, colors.outlineVariant, colors.primary]
  );

  const renderMessageText = useCallback(
    ({ currentMessage, textStyle, linkStyle, onPress, position = "left" }: MessageTextProps<IMessage>) => {
      return (
        <CoachMarkdown
          text={currentMessage.text}
          position={position}
          textStyle={textStyle?.[position ?? "left"]}
          linkStyle={linkStyle?.[position ?? "left"]}
          onLinkPress={(url) => onPress?.(currentMessage, url, "url")}
        />
      );
    },
    []
  );

  const renderBubble = useCallback(
    (bubbleProps: BubbleProps<IMessage>) => (
      <Bubble
        {...bubbleProps}
        wrapperStyle={{
          left: isNarrowScreen ? styles.narrowBubble : styles.wideBubble,
          right: isNarrowScreen ? styles.narrowBubble : styles.wideBubble,
        }}
      />
    ),
    [isNarrowScreen]
  );

  const chooseGymPhoto = useCallback(async () => {
    if (!selectedModelId) { onError?.(toChatErrorState({ kind: "model_not_in_catalog" })); return; }
    try {
      const model = await getCurrentGymPhotoModel(selectedModelId);
      if (!canSendGymPhoto(model)) { onError?.(toChatErrorState({ kind: "model_lacks_image_input" })); return; }
      if (!consented && !(await ensureConsent())) {
        const accepted = await new Promise<boolean>((resolve) => {
          consentResolver.current = resolve;
          setConsentVisible(true);
        });
        if (!accepted) return;
        await consent();
      }
      cleanupGymPhoto();
      const selected = await pick();
      pendingGymPhotoRef.current = selected;
      setPendingGymPhoto(selected);
    } catch (error) {
      cleanupGymPhoto();
      pendingGymPhotoRef.current = null;
      setPendingGymPhoto(null);
      onError?.(toChatErrorState(error && typeof error === "object" && "kind" in error ? error as AIError : { kind: "photo_decode_failed" }));
    }
  }, [selectedModelId, consented, ensureConsent, consent, cleanupGymPhoto, pick, onError]);

  const renderChatEmpty = useCallback(
    () => (
      <View style={styles.emptyStateWrapper}>
        <CoachEmptyState
          isMissingKey={isMissingKey}
          selectedModelId={selectedModelId}
          onOpenModelPicker={onOpenModelPicker}
          onSelectPrompt={(prompt) =>
            send([{ _id: "quick", text: prompt, createdAt: new Date(), user: { _id: 1 } }])
          }
          onChooseGymPhoto={chooseGymPhoto}
        />
      </View>
    ),
    [isMissingKey, selectedModelId, onOpenModelPicker, send, chooseGymPhoto]
  );

  const renderChatFooter = useCallback(() => {
    if (stream.messages.length === 0 || stream.isStreaming) {
      return null;
    }
    return (
      <View style={styles.footerContainer}>
        <ScrollView
          horizontal
          style={styles.promptsScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promptsContent}
        >
          {quickPrompts.map((p) => (
            <Pressable
              key={p}
              onPress={() => send([{ _id: p, text: p, createdAt: new Date(), user: { _id: 1 } }])}
              accessibilityRole="button"
              accessibilityLabel={p}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: colors.onSurfaceVariant }]}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }, [
    stream.messages.length,
    stream.isStreaming,
    quickPrompts,
    colors.surfaceVariant,
    colors.outlineVariant,
    colors.onSurfaceVariant,
    send,
  ]);

  const renderSend = useCallback(
    (sendProps: SendProps<IMessage>) => {
      const { onSend: sendMessage, text } = sendProps;
      if (stream.isStreaming) {
        return (
          <Pressable
            onPress={() => {
              stream.stop();
              runRef.current?.abort();
              cleanupGymPhoto();
              pendingGymPhotoRef.current = null;
              setPendingGymPhoto(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "components.coach.stop", message: "Stop generating" })}
            style={[styles.send, { backgroundColor: colors.error }]}
          >
            <Square size={16} color={colors.onError} fill={colors.onError} />
          </Pressable>
        );
      }

      const hasText = Boolean(text?.trim());
      return (
        <View style={styles.composerColumn}>
          {consented && <Text accessibilityLabel={disclosure} style={[styles.photoDisclosure, { color: colors.onSurfaceVariant }]}>{disclosure}</Text>}
          <View style={styles.sendRow}>
            <CoachGymPhotoComposer
            hasPhoto={Boolean(pendingGymPhoto)}
            previewUri={pendingGymPhoto?.uri}
            disabled={stream.isStreaming}
            onRemove={() => { cleanupGymPhoto(); pendingGymPhotoRef.current = null; setPendingGymPhoto(null); }}
            onPick={chooseGymPhoto} />
            <Pressable
            accessibilityRole="button"
            accessibilityLabel={t({ id: "components.coach.sendA11y", message: "Send message" })}
            disabled={!hasText && !pendingGymPhoto}
            onPress={() => sendMessage?.([{ _id: "send", text: text ?? "", createdAt: new Date(), user: { _id: 1 } }], true)}
            style={[styles.send, { backgroundColor: hasText || pendingGymPhoto ? colors.primary : colors.surfaceVariant }]}
            ><ArrowUp size={18} color={hasText || pendingGymPhoto ? colors.onPrimary : colors.onSurfaceVariant} /></Pressable>
          </View>
        </View>
      );
    },
    [
      stream,
      colors.error,
      colors.onError,
      colors.primary,
      colors.onPrimary,
      colors.surfaceVariant,
      colors.onSurfaceVariant,
      consented,
      disclosure,
      pendingGymPhoto,
      cleanupGymPhoto,
      chooseGymPhoto,
    ]
  );

  const labels = useMemo(
    () => ({
      placeholder: isMissingKey
        ? t({ id: "components.coach.missingKeyPlaceholder", message: "Add your OpenRouter key to chat..." })
        : !selectedModelId
          ? t({ id: "components.coach.selectModelPlaceholder", message: "Select a model above to begin..." })
          : t({ id: "components.coach.placeholder", message: "Ask your AI Coach anything..." }),
      send: t({ id: "components.coach.send", message: "Send" }),
      cancel: t({ id: "components.coach.cancel", message: "Cancel" }),
      loadEarlier: t({ id: "components.coach.loadEarlier", message: "Load earlier messages" }),
      today: t({ id: "components.coach.today", message: "Today" }),
    }),
    [isMissingKey, selectedModelId]
  );

  const isWeb = Platform.OS === "web";
  // FlashList v2 reads this extra option at runtime, although react-native-chat's
  // FlatList-only declaration does not include it in `listProps`.
  const listProps = {
    maintainVisibleContentPosition: {
      minIndexForVisible: 0,
      autoscrollToTopThreshold: 10,
      startRenderingFromBottom: false,
    },
  } as unknown as React.ComponentProps<typeof Chat>["listProps"];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.chatColumn}>
        <Chat
          messages={stream.messages}
          user={{ _id: 1 }}
          onSend={send}
          icons={{
            send: ({ color, size }) => <ArrowUp color={color} size={size} />,
          }}
          textInputProps={{
            maxLength: 4000,
            editable: !isMissingKey,
          }}
          renderCustomView={renderCustomView}
          renderBubble={renderBubble}
          renderAvatar={renderAvatar}
          renderChatEmpty={renderChatEmpty}
          renderChatFooter={renderChatFooter}
          renderSend={renderSend}
          renderMessageText={renderMessageText}
          messageTextProps={{ markdown: true }}
          isAvatarOnTop
          isAlignedTop
          isInverted={false}
          // Let the table's horizontal ScrollView own drags while preserving
          // message gestures everywhere else in mixed-content replies.
          isMessageGestureEnabled={isCoachMessageGestureEnabled}
          // FlashList v2 crashes under react-native-web; native keeps its virtualization
          // benefit. The non-inverted arrangement makes the library's top alignment
          // effective for short conversations too.
          isDayAnimationEnabled={false}
          isFlashListEnabled={!isWeb}
          disableGestureHandlerRootView
          listProps={listProps}
          theme={theme}
          darkTheme={theme}
          labels={labels}
          audioRecording={undefined}
          videoRecording={undefined}
        />
        {activeError && (
          <CoachErrorCard
            error={activeError}
            onDismiss={onDismissError}
            onPickModel={onOpenModelPicker}
            onRefreshCatalog={onRefreshCatalog}
            onRetry={onRetry}
          />
        )}
      </View>
      <Modal visible={consentVisible} transparent animationType="fade" onRequestClose={() => {
        setConsentVisible(false);
        consentResolver.current?.(false);
        consentResolver.current = null;
      }}>
        <View style={styles.consentOverlay}>
          <View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={[styles.consentCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
          >
            <Text accessibilityRole="header" style={[styles.consentTitle, { color: colors.onSurface }]}>
              {t({ id: "components.coach.gymPhotoPrivacyTitle", message: "Gym photo privacy" })}
            </Text>
            <Text style={[styles.consentText, { color: colors.onSurfaceVariant }]}>{disclosure}</Text>
            <View style={styles.consentActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.cancel", message: "Cancel" })} onPress={() => { setConsentVisible(false); consentResolver.current?.(false); consentResolver.current = null; }} style={styles.consentButton}>
                <Text style={{ color: colors.onSurface }}>{t({ id: "components.coach.cancel", message: "Cancel" })}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.privacyUnderstand", message: "I understand" })} onPress={() => { setConsentVisible(false); consentResolver.current?.(true); consentResolver.current = null; }} style={[styles.consentButton, { backgroundColor: colors.primary }]}>
                <Text style={{ color: colors.onPrimary }}>{t({ id: "components.coach.privacyUnderstand", message: "I understand" })}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatColumn: {
    flex: 1,
    width: "100%",
    maxWidth: 768,
    alignSelf: "center",
    minWidth: 0,
  },
  emptyStateWrapper: {
    flex: 1,
    width: "100%",
    transform: [{ scaleY: -1 }],
  },
  footerContainer: {
    paddingVertical: spacing.xs,
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
  },
  promptsScroll: { maxWidth: "100%", flexGrow: 0 },
  promptsContent: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    fontSize: fontSizes.xs,
    fontWeight: "500",
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  sendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  composerColumn: { flexDirection: "column", alignItems: "stretch", maxWidth: "100%" },
  consentOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.base, backgroundColor: "rgba(0,0,0,0.45)" },
  consentCard: { width: "100%", maxWidth: 520, borderWidth: 1, borderRadius: radii.md, padding: spacing.base },
  consentTitle: { fontSize: fontSizes.lg, fontWeight: "700", marginBottom: spacing.sm },
  consentText: { fontSize: fontSizes.sm, lineHeight: 20 },
  consentActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.lg },
  consentButton: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  photoDisclosure: { flex: 1, fontSize: fontSizes.xs, lineHeight: 15 },
  photoButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  narrowBubble: {
    maxWidth: "92%",
  },
  wideBubble: {
    maxWidth: "70%",
  },
});
