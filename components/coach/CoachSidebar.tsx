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
      "Delete Conversation",
      `Are you sure you want to delete "${session.title}"? This cannot be undone.`,
      () => onDeleteSession(session.id),
      true,
      "Delete",
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
            Conversations
          </Text>
        </View>
        <Button
          variant="default"
          size="sm"
          onPress={onNewChat}
          accessibilityLabel="Start a new chat"
          style={styles.newChatButton}
        >
          <Plus size={16} color={colors.onPrimary} style={styles.buttonIcon} />
          <Text style={[styles.newChatText, { color: colors.onPrimary }]}>New Chat</Text>
        </Button>
      </View>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageSquare size={32} color={colors.onSurfaceVariant} />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
            No conversations yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
            Start a new chat to consult your AI Coach.
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
              <Pressable
                onPress={() => onSelectSession(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Session: ${item.title}`}
                accessibilityState={{ selected: isActive }}
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
                <View style={styles.sessionInfo}>
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
                </View>

                {/* Actions */}
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    onPress={() => handleStartRename(item)}
                    accessibilityLabel={`Rename ${item.title}`}
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
                    accessibilityLabel={`Delete ${item.title}`}
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
              </Pressable>
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
              Rename Conversation
            </Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Conversation title"
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
                accessibilityLabel="Cancel rename"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onPress={handleSaveRename}
                disabled={editTitle.trim().length === 0}
                accessibilityLabel="Save rename"
              >
                Save
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
  buttonIcon: {
    marginRight: spacing.xs,
  },
  newChatText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
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
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 56,
  },
  sessionInfo: {
    flex: 1,
    marginRight: spacing.sm,
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
    gap: spacing.xs,
  },
  actionButton: {
    width: 48,
    height: 48,
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
