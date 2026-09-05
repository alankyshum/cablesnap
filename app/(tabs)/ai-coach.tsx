import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ChevronRight, Plus } from "lucide-react-native";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CoachConversation, CoachHeader, CoachSidebar, ModelPickerSheet } from "@/components/coach";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  useCoachMessages,
  useCoachSessions,
  useDeleteCoachSession,
  useLastCoachModel,
  usePendingNewChatModel,
  useRenameCoachSession,
  useSelectCoachModel,
} from "@/hooks/useCoachSessions";
import { useKeyStatus } from "@/hooks/useKeyStatus";
import { useModelCatalog, useRefreshModelCatalog } from "@/hooks/useModelCatalog";
import type { ChatErrorState } from "@/lib/ai/errors";
import { useLayout } from "@/lib/layout";
import { elevation, radii, spacing } from "@/constants/design-tokens";
import { t } from "@/lib/i18n";

export default function AiCoachScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const navigation = useNavigation();
  const tabBarHeight = useFloatingTabBarHeight();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<ChatErrorState | null>(null);
  const selectionHydratedRef = useRef(false);

  const sessionsQuery = useCoachSessions();
  const messagesQuery = useCoachMessages(activeSessionId);
  const rename = useRenameCoachSession();
  const remove = useDeleteCoachSession();
  const lastModel = useLastCoachModel();
  const pendingNewChat = usePendingNewChatModel();
  const selectModel = useSelectCoachModel();
  const keyStatus = useKeyStatus();
  const catalog = useModelCatalog();
  const refresh = useRefreshModelCatalog();

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const messages = messagesQuery.data ?? [];
  const missingKey = keyStatus.data?.kind === "missing_key";
  const selectedModelName = catalog.data?.models.find((model) => model.id === selectedModelId)?.name ?? null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectionHydratedRef.current) {
      if (sessionsQuery.isLoading || lastModel.isLoading || pendingNewChat.isLoading) return;
      selectionHydratedRef.current = true;
      const pendingModel = typeof pendingNewChat.data === "string" ? pendingNewChat.data : null;
      if (sessions[0] && !pendingModel) {
        setActiveSessionId(sessions[0].id);
        setSelectedModelId(sessions[0].model_id);
      } else {
        setSelectedModelId(pendingModel ?? lastModel.data ?? null);
      }
    }
  }, [sessions, sessionsQuery.isLoading, lastModel.data, lastModel.isLoading, pendingNewChat.data, pendingNewChat.isLoading]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    navigation.setOptions({
      headerLeft: layout.compact
        ? () => (
            <TouchableOpacity
              onPress={() => setSidebarOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={t({ id: "components.coach.toggleSidebar", message: "Toggle sessions sidebar" })}
              style={styles.toggle}
            >
              <MaterialCommunityIcons name="menu" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          )
        : () => null,
    });
  }, [layout.compact, navigation, colors.onSurface]);

  const select = (id: string) => {
    setActiveSessionId(id);
    setSelectedModelId(sessions.find((session) => session.id === id)?.model_id ?? null);
    setActiveError(null);
    if (layout.compact) setSidebarOpen(false);
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setSelectedModelId(
      (typeof pendingNewChat.data === "string" ? pendingNewChat.data : null) ?? lastModel.data ?? null,
    );
    setActiveError(null);
    if (layout.compact) setSidebarOpen(false);
  };

  const sidebar = (
    <CoachSidebar
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={select}
      onNewChat={handleNewChat}
      onRenameSession={(id, title) => rename.mutateAsync({ id, title })}
      onDeleteSession={async (id) => {
        await remove.mutateAsync(id);
        if (id === activeSessionId) {
          const next = sessions.find((s) => s.id !== id);
          setActiveSessionId(next?.id ?? null);
          setSelectedModelId(next?.model_id ?? lastModel.data ?? null);
        }
      }}
      onToggleSidebar={layout.atLeastMedium && !sidebarCollapsed ? () => setSidebarCollapsed(true) : undefined}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: tabBarHeight }]}>
      {layout.atLeastMedium && (
        <View
          style={[
            styles.sidebar,
            sidebarCollapsed && styles.collapsed,
            {
              backgroundColor: colors.surface,
              borderRightColor: colors.outlineVariant,
              shadowColor: colors.shadow,
            },
          ]}
        >
          {sidebarCollapsed ? (
            <View style={[styles.miniRail, { paddingTop: spacing.sm }]}>
              <TouchableOpacity
                onPress={() => setSidebarCollapsed(false)}
                accessibilityRole="button"
                accessibilityLabel={t({ id: "components.coach.expandSidebar", message: "Expand sessions sidebar" })}
                style={styles.miniRailButton}
              >
                <ChevronRight size={20} color={colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNewChat}
                accessibilityRole="button"
                accessibilityLabel={t({ id: "components.coach.newChatA11y", message: "Start a new chat" })}
                style={[styles.miniRailButton, { marginTop: spacing.sm }]}
              >
                <Plus size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            sidebar
          )}
        </View>
      )}
      <View style={styles.pane}>
        <CoachHeader
          selectedModelId={selectedModelId}
          selectedModelName={selectedModelName}
          onOpenModelPicker={() => setModelPickerOpen(true)}
          isStaleCatalog={Boolean(catalog.data?.stale || catalog.data?.warning?.kind === "stale_catalog_warning")}
          onRefreshCatalog={() => refresh()}
          disabled={false}
        />
        <CoachConversation
          messages={messages}
          activeSessionId={activeSessionId}
          selectedModelId={selectedModelId}
          isMissingKey={missingKey}
          activeError={activeError}
          onSessionCreated={(id, model) => {
            setActiveSessionId(id);
            setSelectedModelId(model);
          }}
          onOpenModelPicker={() => setModelPickerOpen(true)}
          onDismissError={() => setActiveError(null)}
          onRefreshCatalog={() => refresh()}
          onRetry={() => setActiveError(null)}
          onError={setActiveError}
        />
      </View>
      {layout.compact && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} side="left">
          <SheetContent style={styles.drawer}>{sidebar}</SheetContent>
        </Sheet>
      )}
      <ModelPickerSheet
        isVisible={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        selectedModelId={selectedModelId}
        onSelectModel={(id) => {
          // Close synchronously before changing selection; the sheet owns its
          // imperative dismissal and parent state follows its selection.
          setModelPickerOpen(false);
          setSelectedModelId(id);
          const mutation = selectModel.mutateAsync ?? ((input: { sessionId: string | null; modelId: string }) => {
            selectModel.mutate(input);
            return Promise.resolve();
          });
          void mutation({ sessionId: activeSessionId, modelId: id });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 280,
    borderRightWidth: 1,
    zIndex: 20,
    ...elevation.medium,
  },
  collapsed: {
    width: 52,
  },
  miniRail: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  miniRailButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  pane: {
    flex: 1,
    // Allow the chat's keyboard-avoiding container to shrink inside this row
    // instead of overflowing beneath the keyboard.
    minWidth: 0,
    minHeight: 0,
  },
  toggle: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  drawer: {
    borderTopRightRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
});
