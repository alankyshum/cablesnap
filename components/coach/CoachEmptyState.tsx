import React, { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Bot, ChevronRight, Key, Sparkles, TrendingUp, Utensils, Zap } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { i18n, t } from "@/lib/i18n";

export type CoachEmptyStateProps = {
  isMissingKey: boolean;
  selectedModelId: string | null;
  onOpenModelPicker: () => void;
  onSelectPrompt: (prompt: string) => void;
};

export function CoachEmptyState({
  isMissingKey,
  selectedModelId,
  onOpenModelPicker,
  onSelectPrompt,
}: CoachEmptyStateProps) {
  const colors = useThemeColors();
  const router = useRouter();

  const promptSuggestions = useMemo(
    () => [
      {
        icon: TrendingUp,
        title: t({
          id: "components.coach.promptReviewWorkoutTitle",
          message: "Review Workout Progress",
        }),
        prompt: t({
          id: "components.coach.promptReviewWorkoutBody",
          message: "How is my strength and volume progressing over my recent workouts?",
        }),
      },
      {
        icon: Utensils,
        title: t({
          id: "components.coach.promptNutritionTitle",
          message: "Nutrition & Macros",
        }),
        prompt: t({
          id: "components.coach.promptNutritionBody",
          message: "What should I focus on eating today to hit my macro targets?",
        }),
      },
      {
        icon: Zap,
        title: t({
          id: "components.coach.promptTechniqueTitle",
          message: "Exercise Technique",
        }),
        prompt: t({
          id: "components.coach.promptTechniqueBody",
          message: "What are the key cues for a strong and safe cable chest press?",
        }),
      },
    ],
    []
  );

  if (isMissingKey) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.errorContainer }]}>
            <Key size={28} color={colors.onErrorContainer} />
          </View>
          <Text variant="title" style={[styles.cardTitle, { color: colors.onSurface }]}>
            {t({ id: "components.coach.apiKeyRequired", message: "API Key Required" })}
          </Text>
          <Text style={[styles.cardDescription, { color: colors.onSurfaceVariant }]}>
            {t({
              id: "components.coach.apiKeyRequiredDescription",
              message: "Add your OpenRouter key in Settings to chat with AI Coach and receive personalized workout insights.",
            })}
          </Text>
          <Button
            testID="coach-add-key"
            variant="default"
            onPress={() => router.push("/settings/ai-key")}
            accessibilityLabel={t({ id: "components.coach.addApiKeyA11y", message: "Add OpenRouter API Key" })}
            style={styles.ctaButton}
          >
            {t({ id: "components.coach.addKey", message: "Add Key" })}
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
            {t({ id: "components.coach.selectAnAIModel", message: "Select an AI Model" })}
          </Text>
          <Text style={[styles.cardDescription, { color: colors.onSurfaceVariant }]}>
            {t({
              id: "components.coach.selectAIModelDescription",
              message: "Choose a model from the OpenRouter catalog to power your AI Coach conversations.",
            })}
          </Text>
          <Button
            variant="default"
            onPress={onOpenModelPicker}
            accessibilityLabel={t({ id: "components.coach.selectModel", message: "Select Model" })}
            style={styles.ctaButton}
          >
            {t({ id: "components.coach.selectModel", message: "Select Model" })}
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
          {t({ id: "components.coach.howCanIHelp", message: "How can I help you today?" })}
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: colors.onSurfaceVariant }]}>
          {t({
            id: "components.coach.howCanIHelpSubtitle",
            message: "Ask anything about your workouts, progression, nutrition, or exercise technique.",
          })}
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: colors.onSurfaceVariant }]}>
          {t({
            id: "components.coach.privacyDisclaimer",
            message: "Aggregated workout and nutrition fields are sent to OpenRouter for your request; food names are not.",
          })}
        </Text>
      </View>

      {/* Suggestion Prompts */}
      <View style={styles.suggestionsContainer}>
        {promptSuggestions.map((item, index) => {
          const IconComponent = item.icon;
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onSelectPrompt(item.prompt)}
              accessibilityRole="button"
              accessibilityLabel={i18n._({
                id: "components.coach.suggestionA11y",
                message: "Suggestion: {title}",
                values: { title: item.title },
              })}
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
    gap: spacing.xs,
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
