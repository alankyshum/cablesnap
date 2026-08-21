import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Bot, ChevronDown, Clock, Sparkles } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";

export type CoachHeaderProps = {
  selectedModelId: string | null;
  onOpenModelPicker: () => void;
  isStaleCatalog?: boolean;
  onRefreshCatalog?: () => void;
  disabled?: boolean;
};

export function CoachHeader({
  selectedModelId,
  onOpenModelPicker,
  isStaleCatalog = false,
  onRefreshCatalog,
  disabled = false,
}: CoachHeaderProps) {
  const colors = useThemeColors();

  // Extract a readable short name from modelId if it looks like "openai/gpt-4o" -> "gpt-4o"
  const getModelLabel = () => {
    if (!selectedModelId) return "Select AI Model";
    const parts = selectedModelId.split("/");
    return parts.length > 1 ? parts[1] : selectedModelId;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.outlineVariant }]}>
      <View style={styles.contentRow}>
        {/* Active Model Selector Chip */}
        <TouchableOpacity
          onPress={onOpenModelPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={selectedModelId ? `Active Model: ${selectedModelId}. Tap to change model.` : "Select AI Model"}
          style={[
            styles.modelChip,
            {
              backgroundColor: selectedModelId ? colors.surfaceVariant : colors.primaryContainer,
              borderColor: selectedModelId ? colors.outline : colors.primary,
            },
          ]}
        >
          {selectedModelId ? (
            <Bot size={16} color={colors.primary} />
          ) : (
            <Sparkles size={16} color={colors.onPrimaryContainer} />
          )}
          <Text
            numberOfLines={1}
            style={[
              styles.modelChipText,
              {
                color: selectedModelId ? colors.onSurface : colors.onPrimaryContainer,
                fontWeight: selectedModelId ? "600" : "700",
              },
            ]}
          >
            {getModelLabel()}
          </Text>
          <ChevronDown
            size={14}
            color={selectedModelId ? colors.onSurfaceVariant : colors.onPrimaryContainer}
          />
        </TouchableOpacity>

        {/* Stale Catalog Indicator */}
        {isStaleCatalog && (
          <TouchableOpacity
            onPress={onRefreshCatalog}
            accessibilityRole="button"
            accessibilityLabel="Catalog is cached. Tap to refresh."
            style={[styles.staleBadge, { backgroundColor: colors.surfaceVariant }]}
          >
            <Clock size={12} color={colors.onSurfaceVariant} />
            <Text style={[styles.staleText, { color: colors.onSurfaceVariant }]}>
              Cached catalog
            </Text>
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
    borderBottomWidth: 1,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 48,
    maxWidth: "75%",
  },
  modelChipText: {
    fontSize: fontSizes.sm,
    flexShrink: 1,
  },
  staleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    minHeight: 48,
  },
  staleText: {
    fontSize: fontSizes.xs,
  },
});
