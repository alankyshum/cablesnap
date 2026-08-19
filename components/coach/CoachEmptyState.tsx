import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Bot, ChevronRight, Key, Sparkles, TrendingUp, Utensils, Zap } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";

export type CoachEmptyStateProps = {
  isMissingKey: boolean;
  selectedModelId: string | null;
  onOpenModelPicker: () => void;
  onSelectPrompt: (prompt: string) => void;
};

const PROMPT_SUGGESTIONS = [
  {
    icon: TrendingUp,
    title: "Review Workout Progress",
    prompt: "How is my strength and volume progressing over my recent workouts?",
  },
  {
    icon: Utensils,
    title: "Nutrition & Macros",
    prompt: "What should I focus on eating today to hit my macro targets?",
  },
  {
    icon: Zap,
    title: "Exercise Technique",
    prompt: "What are the key cues for a strong and safe cable chest press?",
  },
];

export function CoachEmptyState({
  isMissingKey,
  selectedModelId,
  onOpenModelPicker,
  onSelectPrompt,
}: CoachEmptyStateProps) {
  const colors = useThemeColors();
  const router = useRouter();

  if (isMissingKey) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.errorContainer }]}>
            <Key size={28} color={colors.onErrorContainer} />
          </View>
          <Text variant="title" style={[styles.cardTitle, { color: colors.onSurface }]}>
            API Key Required
          </Text>
          <Text style={[styles.cardDescription, { color: colors.onSurfaceVariant }]}>
            Add your OpenRouter key in Settings to chat with AI Coach and receive personalized workout insights.
          </Text>
          <Button
            variant="default"
            onPress={() => router.push("/settings/ai-key")}
            accessibilityLabel="Add OpenRouter API Key"
            style={styles.ctaButton}
          >
            Add Key
          </Button>
        </View>
      </View>
    );
  }

  if (!selectedModelId) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
            <Sparkles size={28} color={colors.onPrimaryContainer} />
          </View>
          <Text variant="title" style={[styles.cardTitle, { color: colors.onSurface }]}>
            Select an AI Model
          </Text>
          <Text style={[styles.cardDescription, { color: colors.onSurfaceVariant }]}>
            Choose a model from the OpenRouter catalog to power your AI Coach conversations.
          </Text>
          <Button
            variant="default"
            onPress={onOpenModelPicker}
            accessibilityLabel="Select AI Model"
            style={styles.ctaButton}
          >
            Select Model
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.welcomeHeader}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
          <Bot size={32} color={colors.primary} />
        </View>
        <Text variant="title" style={[styles.welcomeTitle, { color: colors.onSurface }]}>
          How can I help you today?
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: colors.onSurfaceVariant }]}>
          Ask anything about your workouts, progression, nutrition, or exercise technique.
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: colors.onSurfaceVariant }]}>Aggregated workout and nutrition fields are sent to OpenRouter for your request; food names are not.</Text>
      </View>

      {/* Suggestion Prompts */}
      <View style={styles.suggestionsContainer}>
        {PROMPT_SUGGESTIONS.map((item, index) => {
          const IconComponent = item.icon;
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onSelectPrompt(item.prompt)}
              accessibilityRole="button"
              accessibilityLabel={`Suggestion: ${item.title}`}
              style={[
                styles.suggestionItem,
                {
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <View style={[styles.suggestionIconCircle, { backgroundColor: colors.surface }]}>
                <IconComponent size={18} color={colors.primary} />
              </View>
              <View style={styles.suggestionTextContainer}>
                <Text style={[styles.suggestionTitle, { color: colors.onSurface }]}>
                  {item.title}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.suggestionPrompt, { color: colors.onSurfaceVariant }]}
                >
                  {item.prompt}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: "center",
    textAlign: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    textAlign: "center",
  },
  cardDescription: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  ctaButton: {
    minHeight: 48,
    width: "100%",
    marginTop: spacing.sm,
  },
  welcomeHeader: {
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 440,
  },
  welcomeTitle: {
    fontSize: fontSizes.heading,
    fontWeight: "800",
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  suggestionsContainer: {
    width: "100%",
    maxWidth: 480,
    gap: spacing.sm,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    minHeight: 56,
    gap: spacing.md,
  },
  suggestionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionTextContainer: {
    flex: 1,
    gap: spacing.xxs,
  },
  suggestionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  suggestionPrompt: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
  },
});
