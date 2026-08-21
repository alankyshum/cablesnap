import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Bot, User, Wrench } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import type { CoachMessage } from "@/lib/db/coach";

export type CoachMessageBubbleProps = {
  message: Pick<CoachMessage, "role" | "content"> & {
    id?: string;
    tool_calls?: string | null;
    error?: string | null;
    created_at?: number;
  };
  isStreaming?: boolean;
  inFlightTool?: string | null;
};

export function CoachMessageBubble({
  message,
  isStreaming = false,
  inFlightTool = null,
}: CoachMessageBubbleProps) {
  const colors = useThemeColors();
  const isUser = message.role === "user";

  const formatTimestamp = (ts?: number) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getToolDisplayName = (toolName: string) => {
    switch (toolName) {
      case "recent_sessions":
        return "Reading workout history";
      case "exercise_history":
        return "Analyzing exercise progress";
      case "nutrition_macros":
        return "Reviewing nutrition & macros";
      default:
        return `Using tool: ${toolName}`;
    }
  };

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? "You" : "AI Coach"}: ${message.content}`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.primaryContainer }]}>
          <Bot size={18} color={colors.onPrimaryContainer} />
        </View>
      )}

      <View
        style={[
          styles.bubble,
          isUser
            ? [
                styles.userBubble,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]
            : [
                styles.assistantBubble,
                {
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.outlineVariant,
                },
              ],
        ]}
      >
        {/* Tool In-Flight Indicator (during streaming) */}
        {inFlightTool && (
          <View style={[styles.toolBadge, { backgroundColor: colors.secondaryContainer }]}>
            <ActivityIndicator size="small" color={colors.onSecondaryContainer} style={styles.toolSpinner} />
            <Text style={[styles.toolBadgeText, { color: colors.onSecondaryContainer }]}>
              {getToolDisplayName(inFlightTool)}...
            </Text>
          </View>
        )}

        {/* Persisted Tool Calls Badge */}
        {!inFlightTool && message.tool_calls && (
          <View style={[styles.toolBadge, { backgroundColor: colors.surface }]}>
            <Wrench size={12} color={colors.onSurfaceVariant} style={styles.toolIcon} />
            <Text style={[styles.toolBadgeText, { color: colors.onSurfaceVariant }]}>
              Data consulted: local records
            </Text>
          </View>
        )}

        {/* Message Content */}
        <Text
          style={[
            styles.messageText,
            {
              color: isUser ? colors.onPrimary : colors.onSurface,
            },
          ]}
          selectable
        >
          {message.content}
        </Text>

        {/* Streaming cursor indicator */}
        {isStreaming && (
          <View style={styles.streamingRow}>
            <ActivityIndicator size="small" color={colors.primary} style={styles.streamingIndicator} />
            <Text style={[styles.streamingText, { color: colors.onSurfaceVariant }]}>
              Thinking...
            </Text>
          </View>
        )}

        {/* Timestamp */}
        {Boolean(message.created_at) && (
          <Text
            style={[
              styles.timestamp,
              {
                color: isUser ? colors.onPrimary : colors.onSurfaceVariant,
                opacity: isUser ? 0.8 : 0.6,
                alignSelf: isUser ? "flex-end" : "flex-start",
              },
            ]}
          >
            {formatTimestamp(message.created_at)}
          </Text>
        )}
      </View>

      {/* User Avatar */}
      {isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.secondaryContainer }]}>
          <User size={18} color={colors.onSecondaryContainer} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  assistantContainer: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  userBubble: {
    borderBottomRightRadius: radii.sm,
  },
  assistantBubble: {
    borderBottomLeftRadius: radii.sm,
  },
  messageText: {
    fontSize: fontSizes.base,
    lineHeight: 22,
  },
  toolBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    alignSelf: "flex-start",
    marginBottom: spacing.xxs,
  },
  toolSpinner: {
    marginRight: spacing.xxs,
  },
  toolIcon: {
    marginRight: spacing.xxs,
  },
  toolBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
  streamingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  streamingIndicator: {
    marginRight: spacing.xxs,
  },
  streamingText: {
    fontSize: fontSizes.xs,
    fontStyle: "italic",
  },
  timestamp: {
    fontSize: fontSizes.xs,
    marginTop: spacing.xxs,
  },
});
