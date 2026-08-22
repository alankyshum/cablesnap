import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Clock, Sparkles } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { i18n, t } from "@/lib/i18n";

export type CoachHeaderProps = {
  selectedModelId: string | null;
  /** Catalog display name for the selected ID; falls back to the slug suffix. */
  selectedModelName?: string | null;
  onOpenModelPicker: () => void;
  isStaleCatalog?: boolean;
  onRefreshCatalog?: () => void;
  disabled?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

export function CoachHeader({
  selectedModelId,
  selectedModelName,
  onOpenModelPicker,
  isStaleCatalog = false,
  onRefreshCatalog,
  disabled = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}: CoachHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  // Extract a readable short name from modelId if it looks like "openai/gpt-4o" -> "gpt-4o"
  const getModelLabel = () => {
    if (!selectedModelId) return t({ id: "components.coach.selectAIModel", message: "Select AI Model" });
    if (selectedModelName) return selectedModelName;
    const parts = selectedModelId.split("/");
    return parts.length > 1 ? parts[1] : selectedModelId;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderBottomColor: colors.outlineVariant }]}>
      <View style={styles.contentRow}>
        {/* Active Model Selector Chip */}
        <TouchableOpacity
          onPress={onOpenModelPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            selectedModelId
              ? i18n._({
                  id: "components.coach.activeModelA11y",
                  message: "Active Model: {modelId}. Tap to change model.",
                  values: { modelId: selectedModelId },
                })
              : t({ id: "components.coach.selectAIModel", message: "Select AI Model" })
          }
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
            accessibilityLabel={t({
              id: "components.coach.cachedCatalogA11y",
              message: "Catalog is cached. Tap to refresh.",
            })}
            style={[styles.staleBadge, { backgroundColor: colors.surfaceVariant }]}
          >
            <Clock size={12} color={colors.onSurfaceVariant} />
            <Text style={[styles.staleText, { color: colors.onSurfaceVariant }]}>
              {t({ id: "components.coach.cachedCatalog", message: "Cached catalog" })}
            </Text>
          </TouchableOpacity>
        )}
        {onToggleSidebar && (
          <TouchableOpacity
            onPress={onToggleSidebar}
            accessibilityRole="button"
            accessibilityLabel={
              sidebarCollapsed
                ? t({ id: "components.coach.expandSidebar", message: "Expand sessions sidebar" })
                : t({ id: "components.coach.collapseSidebar", message: "Collapse sessions sidebar" })
            }
            style={styles.sidebarToggle}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={20} color={colors.onSurface} />
            ) : (
              <ChevronLeft size={20} color={colors.onSurface} />
            )}
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
    maxWidth: 768,
    alignSelf: "center",
    width: "100%",
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
  sidebarToggle: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
