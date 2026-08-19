import React, { useEffect, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { Text } from "@/components/ui/text";
import type { CoachMessage } from "@/lib/db/coach";
import type { ChatErrorState } from "@/lib/ai/errors";
import { CoachEmptyState } from "./CoachEmptyState";
import { CoachErrorCard } from "./CoachErrorCard";
import { CoachMessageBubble } from "./CoachMessageBubble";
import { CoachComposer } from "./CoachComposer";

const QUICK_PROMPTS = [
  "How have my last few workouts gone?",
  "What did I eat this week?",
  "Show my bench press progression",
  "How can I optimize my recovery?",
];

export type CoachConversationProps = {
  messages: CoachMessage[];
  activeSessionId: string | null;
  selectedModelId: string | null;
  isMissingKey: boolean;
  isStreaming: boolean;
  streamingSessionId: string | null;
  streamingText: string;
  inFlightTool: string | null;
  activeError: ChatErrorState | null;
  inputText: string;
  onChangeInputText: (text: string) => void;
  onSend: () => void;
  onSendPrompt?: (prompt: string) => void;
  onStop: () => void;
  onOpenModelPicker: () => void;
  onDismissError: () => void;
  onRefreshCatalog?: () => void;
  onRetry?: () => void;
};

export function CoachConversation({
  messages,
  activeSessionId,
  selectedModelId,
  isMissingKey,
  isStreaming,
  streamingSessionId,
  streamingText,
  inFlightTool,
  activeError,
  inputText,
  onChangeInputText,
  onSend,
  onSendPrompt,
  onStop,
  onOpenModelPicker,
  onDismissError,
  onRefreshCatalog,
  onRetry,
}: CoachConversationProps) {
  const colors = useThemeColors();
  const tabBarHeight = useFloatingTabBarHeight();
  const flatListRef = useRef<FlatList>(null);
  const isPinnedToBottomRef = useRef(true);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 60;
    isPinnedToBottomRef.current =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  };

  useEffect(() => {
    if (isPinnedToBottomRef.current) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, streamingText]);

  const hasNoMessages = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Messages Area */}
      <View style={styles.messagesContainer}>
        {hasNoMessages ? (
          <CoachEmptyState
            isMissingKey={isMissingKey}
            selectedModelId={selectedModelId}
            onOpenModelPicker={onOpenModelPicker}
            onSelectPrompt={(prompt) => {
              onChangeInputText(prompt);
            }}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <CoachMessageBubble message={item} />
            )}
            ListFooterComponent={
               isStreaming && streamingSessionId === activeSessionId ? (
                <CoachMessageBubble
                  message={{
                    role: "assistant",
                    content: streamingText,
                  }}
                  isStreaming={true}
                  inFlightTool={inFlightTool}
                />
              ) : null
            }
          />
        )}
      </View>

      {/* Error Card */}
      {activeError && (
        <CoachErrorCard
          error={activeError}
          onDismiss={onDismissError}
          onPickModel={onOpenModelPicker}
          onRefreshCatalog={onRefreshCatalog}
          onRetry={onRetry}
        />
      )}

      {/* Composer at Bottom */}
      <View style={{ paddingBottom: tabBarHeight }}>
        {!hasNoMessages && !isStreaming && selectedModelId && !isMissingKey && (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptsContainer}
          >
            {QUICK_PROMPTS.map((prompt, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  if (onSendPrompt) {
                    onSendPrompt(prompt);
                  } else {
                    onChangeInputText(prompt);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Quick prompt: ${prompt}`}
                style={[
                  styles.quickPromptChip,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.quickPromptText, { color: colors.onSurfaceVariant }]}>
                  {prompt}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <CoachComposer
          value={inputText}
          onChangeText={onChangeInputText}
          onSend={onSend}
          onStop={onStop}
          isStreaming={isStreaming}
          disabled={isMissingKey}
          placeholder={
            isMissingKey
              ? "Add your OpenRouter key to chat..."
              : !selectedModelId
                ? "Select a model above to begin..."
                : "Ask your AI Coach anything..."
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  quickPromptsContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  quickPromptChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
  },
  quickPromptText: {
    fontSize: fontSizes.xs,
  },
});
