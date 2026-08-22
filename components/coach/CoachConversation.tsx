import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowUp, Bot, Square, Wrench } from "lucide-react-native";
import { Chat, useStreamingMessages, type IMessage, type BubbleProps, type SendProps } from "@kesha-antonov/react-native-chat";
import { useQueryClient } from "@tanstack/react-query";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useAppendCoachMessage, useCreateCoachSession, coachQueryKeys } from "@/hooks/useCoachSessions";
import { startCoachAgent } from "@/lib/ai/agent";
import { coachTools } from "@/lib/ai/tools";
import { toChatErrorState, type AIError, type ChatErrorState } from "@/lib/ai/errors";
import { t } from "@/lib/i18n";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import type { CoachMessage } from "@/lib/db/coach";
import { CoachEmptyState } from "./CoachEmptyState";
import { CoachErrorCard } from "./CoachErrorCard";

const TOOL_LABELS: Record<string, { id: string; message: string }> = {
  recent_sessions: { id: "components.coach.toolReadingHistory", message: "Reading workout history" },
  exercise_history: { id: "components.coach.toolExerciseProgress", message: "Analyzing exercise progress" },
  nutrition_macros: { id: "components.coach.toolNutritionMacros", message: "Reviewing nutrition & macros" },
};

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
  } as IMessage & { __toolCalls?: boolean };
}

function toIMessages(messages: CoachMessage[]): IMessage[] {
  return messages
    .filter((m) => m.role !== "tool" && !m.error)
    .map(toIMessage);
}

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
  const tabBarHeight = useFloatingTabBarHeight();
  const queryClient = useQueryClient();
  const append = useAppendCoachMessage();
  const create = useCreateCoachSession();
  const [inFlightTool, setInFlightTool] = useState<string | null>(null);
  const handleRef = useRef<ReturnType<typeof stream.startStream> | null>(null);
  const runRef = useRef<ReturnType<typeof startCoachAgent> | null>(null);
  const runningSessionIdRef = useRef<string | null>(null);
  const runOwnerRef = useRef<symbol | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  const stream = useStreamingMessages<IMessage>({ initialMessages: toIMessages(messages), inverted: true });

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
    if (runningSessionIdRef.current === null || runningSessionIdRef.current === activeSessionId) return;
    stream.stop();
    runRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Unmount always aborts, including while a just-created session is streaming.
  useEffect(() => () => {
    stream.stop();
    runRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This callback coordinates persistence, streaming, cancellation, and races
  // between navigation and the async SQLite/agent operations.
  const send = useCallback(
    // eslint-disable-next-line complexity
    async (outgoing: IMessage[]) => {
      const prompt = outgoing[outgoing.length - 1]?.text.trim();
      if (!prompt || stream.isStreaming) return;
      if (isMissingKey) {
        onError?.(toChatErrorState({ kind: "missing_key" }));
        return;
      }
      if (!selectedModelId) {
        onOpenModelPicker();
        return;
      }
      let sessionId = activeSessionId;
      const sessionAtSend = activeSessionId;
      const owner = Symbol("coach-run");
      let ownedHandle: ReturnType<typeof stream.startStream> | null = null;
      let ownedRun: ReturnType<typeof startCoachAgent> | null = null;
      try {
        if (!sessionId) {
          const session = await create.mutateAsync({ title: prompt.slice(0, 36), model_id: selectedModelId });
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
        const persistedUser = await append.mutateAsync({ session_id: sessionId, role: "user", content: prompt });
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
          prompt,
          tools: coachTools,
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
      } catch (err) {
        const aiError =
          err && typeof err === "object" && "kind" in err ? (err as AIError) : ({ kind: "network_error" } as const);
        ownedHandle?.done();
        if (aiError.kind !== "aborted_by_user") {
          onError?.(toChatErrorState(aiError));
        }
      } finally {
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
    ? `${t(TOOL_LABELS[inFlightTool] ?? { id: "components.coach.toolUsing", message: `Using tool: ${inFlightTool}` })}...`
    : null;

  const renderCustomView = useCallback(
    ({ currentMessage }: BubbleProps<IMessage>) => {
      const custom = currentMessage as IMessage & { __toolCalls?: boolean };
      const label = custom.__toolCalls
        ? t({ id: "components.coach.dataConsulted", message: "Data consulted: local records" })
        : currentMessage.streaming && toolLabel
          ? toolLabel
          : null;
      return label ? (
        <View style={[styles.badge, { backgroundColor: colors.surface }]}>
          <Wrench size={12} color={colors.onSurfaceVariant} />
          <Text style={[styles.badgeText, { color: colors.onSurfaceVariant }]}>{label}</Text>
        </View>
      ) : null;
    },
    [colors.surface, colors.onSurfaceVariant, toolLabel]
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

  const renderChatEmpty = useCallback(
    () => (
      <CoachEmptyState
        isMissingKey={isMissingKey}
        selectedModelId={selectedModelId}
        onOpenModelPicker={onOpenModelPicker}
        onSelectPrompt={(prompt) =>
          send([{ _id: "quick", text: prompt, createdAt: new Date(), user: { _id: 1 } }])
        }
      />
    ),
    [isMissingKey, selectedModelId, onOpenModelPicker, send]
  );

  const renderChatFooter = useCallback(() => {
    if (stream.messages.length === 0 || stream.isStreaming) {
      return null;
    }
    return (
      <View style={styles.footerContainer}>
        <ScrollView
          horizontal
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t({ id: "components.coach.sendA11y", message: "Send message" })}
          disabled={!hasText}
          onPress={() =>
            sendMessage?.([{ _id: "send", text: text ?? "", createdAt: new Date(), user: { _id: 1 } }], true)
          }
          style={[
            styles.send,
            {
              backgroundColor: hasText ? colors.primary : colors.surfaceVariant,
            },
          ]}
        >
          <ArrowUp
            size={18}
            color={hasText ? colors.onPrimary : colors.onSurfaceVariant}
          />
        </Pressable>
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

  // FlashList 2.0.2 crashes under react-native-web with
  // `TypeError: Failed to set an indexed property [0] on 'CSSStyleDeclaration'`.
  // FlatList fallback is used on web to prevent crashes while retaining native FlashList optimization.
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: tabBarHeight }]}>
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
          renderAvatar={renderAvatar}
          renderChatEmpty={renderChatEmpty}
          renderChatFooter={renderChatFooter}
          renderSend={renderSend}
          messageTextProps={{ markdown: true }}
          isFlashListEnabled={!isWeb}
          disableGestureHandlerRootView
          listProps={{
            maintainVisibleContentPosition: { minIndexForVisible: 0, autoscrollToTopThreshold: 10 },
          }}
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
  },
  footerContainer: {
    paddingVertical: spacing.xs,
  },
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
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  badgeText: {
    fontSize: fontSizes.xs,
  },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
