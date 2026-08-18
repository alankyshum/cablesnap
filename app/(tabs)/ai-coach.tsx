import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  CoachConversation,
  CoachHeader,
  CoachSidebar,
  ModelPickerSheet,
} from "@/components/coach";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  coachQueryKeys,
  useAppendCoachMessage,
  useCoachMessages,
  useCoachSessions,
  useCreateCoachSession,
  useDeleteCoachSession,
  useRenameCoachSession,
} from "@/hooks/useCoachSessions";
import { useKeyStatus } from "@/hooks/useKeyStatus";
import { useModelCatalog, useRefreshModelCatalog } from "@/hooks/useModelCatalog";
import { startCoachAgent, type CoachAgentRun } from "@/lib/ai/agent";
import { toChatErrorState, type AIError, type ChatErrorState } from "@/lib/ai/errors";
import { coachTools } from "@/lib/ai/tools";
import { useLayout } from "@/lib/layout";
import { radii } from "@/constants/design-tokens";

export default function AiCoachScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  // Sidebar visibility state for compact (phone) screens
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Model Picker Sheet visibility state
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Active session and selected model state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Composer and agent streaming state
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const [inFlightTool, setInFlightTool] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<ChatErrorState | null>(null);

  const currentRunRef = useRef<CoachAgentRun | null>(null);

  // Backend / Database queries and mutations
  const sessionsQuery = useCoachSessions();
  const messagesQuery = useCoachMessages(activeSessionId);
  const createSessionMutation = useCreateCoachSession();
  const renameSessionMutation = useRenameCoachSession();
  const deleteSessionMutation = useDeleteCoachSession();
  const appendMessageMutation = useAppendCoachMessage();
  const keyStatus = useKeyStatus();
  const catalogQuery = useModelCatalog();
  const refreshCatalog = useRefreshModelCatalog();

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const messages = messagesQuery.data ?? [];
  const isMissingKey = keyStatus.data?.kind === "missing_key";
  const isStaleCatalog = Boolean(
    catalogQuery.data?.stale || catalogQuery.data?.warning?.kind === "stale_catalog_warning",
  );

  const initialSyncDoneRef = useRef(false);

  // The header control closes over the sidebar state owned by this screen.
  useEffect(() => {
    navigation.setOptions({
      headerLeft: layout.compact
        ? () => (
            <TouchableOpacity
              onPress={() => setSidebarOpen((prev) => !prev)}
              accessibilityLabel="Toggle sessions sidebar"
              accessibilityRole="button"
              style={styles.headerToggle}
            >
              <MaterialCommunityIcons name="menu" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          )
        : () => null,
    });
  }, [layout.compact, navigation, colors.onSurface]);

  // Sync activeSession selection and active session model_id
  useEffect(() => {
    if (!initialSyncDoneRef.current && sessions.length > 0) {
      initialSyncDoneRef.current = true;
      setActiveSessionId(sessions[0].id);
      setSelectedModelId(sessions[0].model_id);
      return;
    }

    if (activeSessionId) {
      const active = sessions.find((s) => s.id === activeSessionId);
      if (active) {
        // The persisted session model is the source of truth when switching sessions.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedModelId(active.model_id);
      } else if (sessions.length > 0) {
        // Active session was deleted
        setActiveSessionId(sessions[0].id);
        setSelectedModelId(sessions[0].model_id);
      } else {
        setActiveSessionId(null);
        setSelectedModelId(null);
      }
    }
  }, [sessions, activeSessionId]);

  // Handle New Chat CTA
  const handleNewChat = () => {
    currentRunRef.current?.abort();
    setActiveSessionId(null);
    setSelectedModelId(null);
    setInputText("");
    setActiveError(null);
    setStreamingText("");
    setStreamingSessionId(null);
    setIsStreaming(false);
    setInFlightTool(null);
  };

  // Handle selecting a session
  const handleSelectSession = (id: string) => {
    currentRunRef.current?.abort();
    setActiveSessionId(id);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setSelectedModelId(session.model_id);
    }
    setActiveError(null);
    setStreamingText("");
    setStreamingSessionId(null);
    setIsStreaming(false);
  };

  // Handle renaming a session
  const handleRenameSession = async (id: string, newTitle: string) => {
    await renameSessionMutation.mutateAsync({ id, title: newTitle });
  };

  // Handle deleting a session
  const handleDeleteSession = async (id: string) => {
    if (id === activeSessionId) {
      currentRunRef.current?.abort();
      const remaining = sessions.filter((s) => s.id !== id);
      const nextActive = remaining.length > 0 ? remaining[0] : null;
      setActiveSessionId(nextActive ? nextActive.id : null);
      setSelectedModelId(nextActive ? nextActive.model_id : null);
    }
    await deleteSessionMutation.mutateAsync(id);
  };

  // Handle selecting a model from the model picker
  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    setModelPickerOpen(false);
  };

  // Handle stopping an in-flight stream
  const handleStopStream = () => {
    if (currentRunRef.current) {
      currentRunRef.current.abort();
    }
  };

  // Handle sending a user message
  const handleSendMessage = async (customPrompt?: string) => {
    const prompt = (typeof customPrompt === "string" ? customPrompt : inputText).trim();
    if (prompt.length === 0 || isStreaming) return;

    if (isMissingKey) {
      setActiveError(toChatErrorState({ kind: "missing_key" }));
      return;
    }

    if (!selectedModelId) {
      setModelPickerOpen(true);
      return;
    }

    let targetSessionId = activeSessionId;
    const preRunAbort = new AbortController();
    currentRunRef.current = {
      done: new Promise(() => undefined),
      abort: () => preRunAbort.abort(),
    };

    try {
      // If no active session exists yet, create one
      if (!targetSessionId) {
        const title = prompt.slice(0, 36);
        const created = await createSessionMutation.mutateAsync({
          title,
          model_id: selectedModelId,
        });
        targetSessionId = created.id;
        setActiveSessionId(created.id);
      }

      // Optimistically append user message
      await appendMessageMutation.mutateAsync({
        session_id: targetSessionId,
        role: "user",
        content: prompt,
      });
      if (preRunAbort.signal.aborted) {
        throw { kind: "aborted_by_user" } satisfies AIError;
      }

      setInputText("");
      setActiveError(null);
      setIsStreaming(true);
      setStreamingText("");
      setStreamingSessionId(targetSessionId);
      setInFlightTool(null);

      const run = startCoachAgent({
        sessionId: targetSessionId,
        modelId: selectedModelId,
        prompt,
        signal: preRunAbort.signal,
        tools: coachTools,
        onEvent: (event) => {
          if (event.type === "delta") {
            setStreamingText((prev) => {
              const next = prev + event.text;
              return next;
            });
          } else if (event.type === "tool-call") {
            setInFlightTool(event.name);
          } else if (event.type === "tool-result") {
            setInFlightTool(null);
          }
        },
      });

      currentRunRef.current = run;
      await run.done;

      // Invalidate message cache so persisted assistant message renders
      await queryClient.invalidateQueries({
        queryKey: coachQueryKeys.messages(targetSessionId),
      });
      await queryClient.invalidateQueries({
        queryKey: coachQueryKeys.sessions,
      });
    } catch (err: unknown) {
      const aiError =
        err && typeof err === "object" && "kind" in err
          ? (err as AIError)
          : ({ kind: "network_error" } as const);

      if (aiError.kind !== "aborted_by_user") {
        setActiveError(toChatErrorState(aiError));
      }
      if (targetSessionId && aiError.kind !== "aborted_by_user") {
        await appendMessageMutation.mutateAsync({
          session_id: targetSessionId,
          role: "assistant",
          content: toChatErrorState(aiError).message,
          error: JSON.stringify(aiError),
        });
      }
    } finally {
      setIsStreaming(false);
      setStreamingText("");
      setStreamingSessionId(null);
      setInFlightTool(null);
      currentRunRef.current = null;
    }
  };

  const sidebarContent = (
    <CoachSidebar
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={(id) => {
        handleSelectSession(id);
        if (layout.compact) {
          setSidebarOpen(false);
        }
      }}
      onNewChat={() => {
        handleNewChat();
        if (layout.compact) {
          setSidebarOpen(false);
        }
      }}
      onRenameSession={handleRenameSession}
      onDeleteSession={handleDeleteSession}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Tablet Layout (>=600px): Persistent Left Sidebar */}
      {layout.atLeastMedium && (
        <View
          style={[
            styles.tabletSidebarContainer,
            {
              backgroundColor: colors.surface,
              borderRightColor: colors.outlineVariant,
            },
          ]}
        >
          {sidebarContent}
        </View>
      )}

      {/* Main Conversation Pane */}
      <View style={styles.conversationPane}>
        {/* Header with Active Model Selector & Stale Catalog Banner */}
        <CoachHeader
          selectedModelId={selectedModelId}
          onOpenModelPicker={() => setModelPickerOpen(true)}
          isStaleCatalog={isStaleCatalog}
          onRefreshCatalog={() => refreshCatalog()}
          disabled={isStreaming}
        />

        {/* Conversation List & Composer */}
        <CoachConversation
          messages={messages}
          activeSessionId={activeSessionId}
          selectedModelId={selectedModelId}
          isMissingKey={isMissingKey}
          isStreaming={isStreaming}
          streamingSessionId={streamingSessionId}
          streamingText={streamingText}
          inFlightTool={inFlightTool}
          activeError={activeError}
          inputText={inputText}
          onChangeInputText={setInputText}
          onSend={handleSendMessage}
          onSendPrompt={handleSendMessage}
          onStop={handleStopStream}
          onOpenModelPicker={() => setModelPickerOpen(true)}
          onDismissError={() => setActiveError(null)}
          onRefreshCatalog={() => refreshCatalog()}
          onRetry={handleSendMessage}
        />
      </View>

      {/* Phone Drawer (compact <600px): Slide-in Left Drawer via Sheet */}
      {layout.compact && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} side="left">
          <SheetContent style={styles.drawerSheet}>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {/* Model Picker Bottom Sheet */}
      <ModelPickerSheet
        isVisible={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  tabletSidebarContainer: {
    width: 280,
    borderRightWidth: 1,
    height: "100%",
  },
  conversationPane: {
    flex: 1,
    height: "100%",
  },
  headerToggle: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerSheet: {
    padding: 0,
    borderTopRightRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
});
