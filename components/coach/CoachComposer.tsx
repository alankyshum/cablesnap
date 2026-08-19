import React, { useRef } from "react";
import {
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowUp, Square } from "lucide-react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";

export type CoachComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function CoachComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = "Message your AI Coach...",
}: CoachComposerProps) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    // Submit on Enter without Shift on Web / Desktop
    const event = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (Platform.OS === "web" && event.key === "Enter" && !event.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.outlineVariant,
        },
      ]}
    >
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.surfaceVariant,
            borderColor: colors.outline,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceVariant}
          multiline
          maxLength={4000}
          editable={!disabled}
          onKeyPress={handleKeyPress}
          accessibilityLabel="Message AI Coach input"
          style={[
            styles.textInput,
            {
              color: colors.onSurface,
            },
          ]}
        />

        {/* Action Button: Stop or Send */}
        {isStreaming ? (
          <TouchableOpacity
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel="Stop generating"
            style={[styles.actionButton, { backgroundColor: colors.error }]}
          >
            <Square size={16} color={colors.onError} fill={colors.onError} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={[
              styles.actionButton,
              {
                backgroundColor: canSend ? colors.primary : colors.outlineVariant,
                opacity: canSend ? 1 : 0.6,
              },
            ]}
          >
            <ArrowUp size={18} color={canSend ? colors.onPrimary : colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    fontSize: fontSizes.base,
    lineHeight: 20,
    maxHeight: 120,
    paddingTop: Platform.OS === "ios" ? spacing.xs : 0,
    paddingBottom: Platform.OS === "ios" ? spacing.xs : 0,
    marginRight: spacing.sm,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
});
