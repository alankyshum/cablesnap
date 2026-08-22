import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Bot, Edit2, MessageSquare, Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { confirmAction } from "@/lib/confirm";
import { i18n, t } from "@/lib/i18n";
import type { CoachSession } from "@/lib/db/coach";

export type CoachSidebarProps = {
  sessions: CoachSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
};

export function CoachSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
}: CoachSidebarProps) {
  const colors = useThemeColors();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartRename = (session: CoachSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = () => {
    if (editingSessionId && editTitle.trim().length > 0) {
      onRenameSession(editingSessionId, editTitle.trim());
    }
    setEditingSessionId(null);
    setEditTitle("");
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditTitle("");
  };

  const handleDelete = (session: CoachSession) => {
    confirmAction(
      t({ id: "components.coach.deleteConversationTitle", message: "Delete Conversation" }),
      i18n._({
        id: "components.coach.deleteConversationBody",
        message: 'Are you sure you want to delete "{title}"? This cannot be undone.',
        values: { title: session.title },
      }),
      () => onDeleteSession(session.id),
      true,
      t({ id: "components.coach.deleteConfirm", message: "Delete" }),
    );
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Header with New Chat CTA */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Bot size={20} color={colors.primary} />
          <Text variant="title" style={[styles.headerTitle, { color: colors.onSurface }]}>
            {t({ id: "components.coach.conversations", message: "Conversations" })}
          </Text>
        </View>
        <Button
          variant="default"
          size="sm"
          onPress={onNewChat}
          accessibilityLabel={t({ id: "components.coach.newChatA11y", message: "Start a new chat" })}
          style={styles.newChatButton}
        >
          <Plus size={16} color={colors.onPrimary} />
          <Text style={[styles.newChatText, { color: colors.onPrimary }]}>
            {t({ id: "components.coach.newChat", message: "New Chat" })}
          </Text>
        </Button>
      </View>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageSquare size={32} color={colors.onSurfaceVariant} />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
            {t({ id: "components.coach.noConversations", message: "No conversations yet" })}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
            {t({
              id: "components.coach.startNewChatSubtitle",
              message: "Start a new chat to consult your AI Coach.",
            })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isActive = item.id === activeSessionId;
            return (
              <View
                style={[
                  styles.sessionItem,
                  {
                    backgroundColor: isActive
                      ? colors.secondaryContainer
                      : colors.surfaceVariant,
                    borderColor: isActive ? colors.primary : "transparent",
                  },
                ]}
              >
                <Pressable
                  onPress={() => onSelectSession(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={i18n._({
                    id: "components.coach.sessionA11y",
                    message: "Session: {title}",
                    values: { title: item.title },
                  })}
                  accessibilityState={{ selected: isActive }}
                  style={styles.sessionInfo}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sessionTitle,
                      {
                        color: isActive
                          ? colors.onSecondaryContainer
                          : colors.onSurface,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[
                      styles.sessionDate,
                      {
                        color: isActive
                          ? colors.onSecondaryContainer
                          : colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {formatDate(item.updated_at)}
                  </Text>
                </Pressable>

                {/* Actions */}
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    onPress={() => handleStartRename(item)}
                    accessibilityLabel={i18n._({
                      id: "components.coach.renameSessionA11y",
                      message: "Rename {title}",
                      values: { title: item.title },
                    })}
                    accessibilityRole="button"
                    style={styles.actionButton}
                    hitSlop={{ top: spacing.xs, bottom: spacing.xs, left: spacing.xs, right: spacing.xs }}
                  >
                    <Edit2
                      size={16}
                      color={isActive ? colors.onSecondaryContainer : colors.onSurfaceVariant}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    accessibilityLabel={i18n._({
                      id: "components.coach.deleteSessionA11y",
                      message: "Delete {title}",
                      values: { title: item.title },
                    })}
                    accessibilityRole="button"
                    style={styles.actionButton}
                    hitSlop={{ top: spacing.xs, bottom: spacing.xs, left: spacing.xs, right: spacing.xs }}
                  >
                    <Trash2
                      size={16}
                      color={isActive ? colors.error : colors.onSurfaceVariant}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Rename Modal */}
      <Modal
        visible={editingSessionId !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRename}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text variant="title" style={[styles.modalTitle, { color: colors.onSurface }]}>
              {t({ id: "components.coach.renameConversation", message: "Rename Conversation" })}
            </Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t({
                id: "components.coach.conversationTitlePlaceholder",
                message: "Conversation title",
              })}
              placeholderTextColor={colors.onSurfaceVariant}
              style={[
                styles.modalInput,
                {
                  color: colors.onSurface,
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.outline,
                },
              ]}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleSaveRename}
            />
            <View style={styles.modalButtons}>
              <Button
                variant="outline"
                size="sm"
                onPress={handleCancelRename}
                accessibilityLabel={t({ id: "components.coach.cancelRenameA11y", message: "Cancel rename" })}
              >
                {t({ id: "components.coach.cancel", message: "Cancel" })}
              </Button>
              <Button
                variant="default"
                size="sm"
                onPress={handleSaveRename}
                disabled={editTitle.trim().length === 0}
                accessibilityLabel={t({ id: "components.coach.saveRenameA11y", message: "Save rename" })}
              >
                {t({ id: "components.coach.save", message: "Save" })}
              </Button>
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
  header: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
  },
  newChatButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  newChatText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 56,
  },
  sessionInfo: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    justifyContent: "center",
  },
  sessionTitle: {
    fontSize: fontSizes.sm,
  },
  sessionDate: {
    fontSize: fontSizes.xs,
    marginTop: spacing.xxs,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.xs,
  },
  actionButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSizes.base,
    fontWeight: "600",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: fontSizes.xs,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.base,
  },
  modalTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
  },
  modalInput: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.base,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
