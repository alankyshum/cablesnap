/* eslint-disable max-lines */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { AlertCircle, Check, RotateCcw, Search, X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Switch } from "@/components/ui/switch";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useModelCatalog, useRefreshModelCatalog } from "@/hooks/useModelCatalog";
import { useKeyStatus } from "@/hooks/useKeyStatus";
import { toChatErrorState } from "@/lib/ai/errors";
import type { CatalogModel } from "@/lib/ai/catalog";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { i18n, t } from "@/lib/i18n";
import {
  formatCachedTimestamp,
  formatContextLength,
  formatModelPricing,
} from "./model-formatters";

export type ModelPickerProps = {
  /** The currently selected model ID (OpenRouter slug), or null if none selected. */
  selectedModelId?: string | null;
  /** Callback invoked when the user selects a model slug. */
  onSelectModel: (modelId: string) => void;
  /** Optional callback to close the picker sheet/modal. */
  onClose?: () => void;
  /** Sheet wrappers may own dismissal to avoid a present/dismiss race. */
  closeOnSelect?: boolean;
  /** Whether to render a close button in the header. */
  showCloseButton?: boolean;
  /** Optional title override (pass null to suppress internal header when rendered inside a titled sheet). */
  title?: string | null;
};

// The picker intentionally keeps catalog filtering, sorting, and selection together so
// its displayed list and selected value cannot drift apart.
// eslint-disable-next-line max-lines-per-function, complexity
export function ModelPicker({
  selectedModelId,
  onSelectModel,
  onClose,
  closeOnSelect = true,
  showCloseButton = false,
  title,
}: ModelPickerProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const catalogQuery = useModelCatalog();
  const refreshCatalog = useRefreshModelCatalog();
  const keyStatus = useKeyStatus();
  const resolvedTitle = title === undefined
    ? t({ id: "components.coach.selectAIModel", message: "Select AI Model" })
    : title;

  // Search query filter
  const [searchQuery, setSearchQuery] = useState("");

  // Tools-only filter is ON by default because the AI coach requires tool-calling.
  // This is where the tools-only filter default lives.
  const [toolsOnly, setToolsOnly] = useState(true);

  const isMissingKey = keyStatus.data?.kind === "missing_key";
  const isStale = Boolean(catalogQuery.data?.stale || catalogQuery.data?.warning?.kind === "stale_catalog_warning");
  const isError = catalogQuery.isError || (!catalogQuery.data && !catalogQuery.isLoading);

  const filteredModels = useMemo(() => {
    const rawModels: readonly CatalogModel[] = catalogQuery.data?.models ?? [];
    const query = searchQuery.trim().toLowerCase();

    return rawModels.filter((model) => {
      // If tools-only filter is active, exclude models lacking "tools"
      if (toolsOnly && !model.supportedParameters.includes("tools")) {
        return false;
      }
      // Search matches both model.id and model.name
      if (query.length > 0) {
        const idMatch = model.id.toLowerCase().includes(query);
        const nameMatch = model.name.toLowerCase().includes(query);
        return idMatch || nameMatch;
      }
      return true;
    });
  }, [catalogQuery.data?.models, toolsOnly, searchQuery]);

  const handleSelect = (modelId: string) => {
    onSelectModel(modelId);
    if (closeOnSelect) onClose?.();
  };

  const handleNavigateKeySettings = () => {
    router.push("/settings/ai-key");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header (rendered if title is provided) */}
      {Boolean(resolvedTitle) && (
        <View style={styles.headerRow}>
          <View style={styles.headerTextContainer}>
            <Text variant="title" style={{ color: colors.onSurface }}>
              {resolvedTitle}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {t({
                id: "components.coach.modelsSourcedCatalog",
                message: "Models sourced from live OpenRouter catalog",
              })}
            </Text>
          </View>
          {showCloseButton && onClose && (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: "components.coach.closeModelPicker",
                message: "Close model picker",
              })}
              hitSlop={{ top: spacing.md, bottom: spacing.md, left: spacing.md, right: spacing.md }}
              style={[styles.iconButton, { borderColor: colors.outline }]}
            >
              <X size={20} color={colors.onSurface} />
            </Pressable>
          )}
        </View>
      )}

      {/* Missing API Key Banner */}
      {isMissingKey && (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.errorContainer,
              borderColor: colors.error,
            },
          ]}
        >
          <View style={styles.bannerRow}>
            <AlertCircle size={20} color={colors.onErrorContainer} />
            <View style={styles.bannerText}>
              <Text style={{ color: colors.onErrorContainer, fontWeight: "600" }}>
                {t({ id: "components.coach.apiKeyRequiredBanner", message: "API key required" })}
              </Text>
              <Text variant="caption" style={{ color: colors.onErrorContainer }}>
                {t({
                  id: "components.coach.apiKeyRequiredPickerDescription",
                  message: "Add your OpenRouter API key to use AI Coach and browse all models.",
                })}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleNavigateKeySettings}
            accessibilityRole="button"
            accessibilityLabel={t({
              id: "components.coach.configureApiKeyA11y",
              message: "Configure OpenRouter API key",
            })}
            style={[
              styles.bannerButton,
              { backgroundColor: colors.error },
            ]}
          >
            <Text style={{ color: colors.onError, fontWeight: "600", fontSize: fontSizes.sm }}>
              {t({ id: "components.coach.configureApiKey", message: "Configure API Key" })}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Stale Catalog Notice */}
      {isStale && (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.tertiaryContainer,
              borderColor: colors.tertiary,
            },
          ]}
          testID="stale-catalog-banner"
        >
          <View style={styles.bannerRow}>
            <AlertCircle size={20} color={colors.onTertiaryContainer} />
            <View style={styles.bannerText}>
              <Text style={{ color: colors.onTertiaryContainer, fontWeight: "600" }}>
                {t({ id: "components.coach.cachedCatalog", message: "Cached catalog" })}
              </Text>
              <Text variant="caption" style={{ color: colors.onTertiaryContainer }}>
                {i18n._({
                  id: "components.coach.cachedCatalogDescription",
                  message: "Showing cached models from {time}. Selections may have changed.",
                  values: { time: formatCachedTimestamp(catalogQuery.data?.cachedAt) },
                })}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => void refreshCatalog()}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "components.coach.refreshCatalog", message: "Refresh catalog" })}
            style={[
              styles.bannerOutlineButton,
              { borderColor: colors.onTertiaryContainer },
            ]}
          >
            <RotateCcw size={14} color={colors.onTertiaryContainer} />
            <Text style={{ color: colors.onTertiaryContainer, fontWeight: "600", fontSize: fontSizes.sm }}>
              {t({ id: "components.coach.refresh", message: "Refresh" })}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Active Model / No Default Notice */}
      <View
        style={[
          styles.selectionStatusCard,
          {
            backgroundColor: selectedModelId ? colors.primaryContainer : colors.surfaceAlt,
            borderColor: selectedModelId ? colors.primary : colors.outlineVariant,
          },
        ]}
      >
        <Text
          variant="caption"
          style={{
            color: selectedModelId ? colors.onPrimaryContainer : colors.onSurfaceVariant,
            fontWeight: selectedModelId ? "600" : "400",
          }}
        >
          {selectedModelId
            ? i18n._({
                id: "components.coach.selectedModel",
                message: "Selected: {modelId}",
                values: { modelId: selectedModelId },
              })
            : t({
                id: "components.coach.noModelSelected",
                message: "No model selected. Choose a model below to start coaching.",
              })}
        </Text>
      </View>

      {/* Search & Filter Controls */}
      <View style={styles.controlsContainer}>
        {/* Search Input */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Search size={18} color={colors.onSurfaceVariant} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t({
              id: "components.coach.searchModelsPlaceholder",
              message: "Search by model id or name…",
            })}
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityRole="search"
            accessibilityLabel={t({
              id: "components.coach.searchModelsA11y",
              message: "Search models by id or name",
            })}
            testID="model-search-input"
            style={[
              styles.searchInput,
              {
                color: colors.onSurface,
              },
            ]}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: "components.coach.clearModelSearch",
                message: "Clear model search",
              })}
              hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }}
              style={styles.clearButton}
            >
              <X size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        {/* Tools-Only Filter Toggle */}
        <View style={styles.filterRow}>
          <View style={styles.filterLabelContainer}>
            <Text variant="body" style={[styles.filterLabel, { color: colors.onSurface }]}>
              {t({ id: "components.coach.toolCallingOnly", message: "Tool-calling only" })}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {t({
                id: "components.coach.toolCallingDescription",
                message: "Coach needs tool calling to read logs and manage workouts",
              })}
            </Text>
          </View>
          <Switch
            value={toolsOnly}
            onValueChange={setToolsOnly}
            accessibilityLabel={t({
              id: "components.coach.filterToolsA11y",
              message: "Filter by tool calling support",
            })}
          />
        </View>
      </View>

      {/* Relaxed Tools Warning (when toolsOnly is OFF) */}
      {!toolsOnly && (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.tertiaryContainer,
              borderColor: colors.tertiary,
            },
          ]}
          testID="relaxed-tools-warning"
        >
          <View style={styles.bannerRow}>
            <AlertCircle size={20} color={colors.onTertiaryContainer} />
            <View style={styles.bannerText}>
              <Text style={{ color: colors.onTertiaryContainer, fontWeight: "600" }}>
                {t({ id: "components.coach.toolCallingWarning", message: "Tool Calling Warning" })}
              </Text>
              <Text variant="caption" style={{ color: colors.onTertiaryContainer }}>
                {t({
                  id: "components.coach.toolCallingWarningDescription",
                  message:
                    "Tools will not work on models without tool-calling support. AI Coach will not be able to log sets, retrieve exercises, or analyze workout history.",
                })}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Catalog Unavailable / Error State */}
      {isError ? (
        <View
          style={[
            styles.errorContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.error,
            },
          ]}
          testID="catalog-error-state"
        >
          <AlertCircle size={32} color={colors.error} />
          <Text style={[styles.errorTitle, { color: colors.onSurface }]}>
            {t({ id: "components.coach.catalogUnavailable", message: "Catalog Unavailable" })}
          </Text>
          <Text variant="caption" style={[styles.errorMessage, { color: colors.onSurfaceVariant }]}>
            {toChatErrorState({ kind: "catalog_unavailable" }).message}
          </Text>
          <Pressable
            onPress={() => void refreshCatalog()}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "components.coach.refreshCatalog", message: "Refresh catalog" })}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
            ]}
          >
            <RotateCcw size={16} color={colors.onPrimary} style={{ marginRight: spacing.xs }} />
            <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
              {t({ id: "components.coach.refreshCatalog", message: "Refresh catalog" })}
            </Text>
          </Pressable>
        </View>
      ) : catalogQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: spacing.sm }}>
            {t({ id: "components.coach.loadingCatalog", message: "Loading live model catalog…" })}
          </Text>
        </View>
      ) : (
        /* Model FlatList */
        <BottomSheetFlatList<CatalogModel>
          testID="model-catalog-list"
          style={styles.modelList}
          data={filteredModels}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={styles.listContent}
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          windowSize={7}
          renderItem={({ item, index }) => {
            const isSelected = selectedModelId === item.id;
            const hasTools = item.supportedParameters.includes("tools");
            const contextStr = formatContextLength(item.contextLength);
            const pricingStr = formatModelPricing(item.pricing);

            return (
              <Pressable
                onPress={() => handleSelect(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.id}, ${contextStr}, ${pricingStr}${hasTools ? ", supports tools" : ""}${isSelected ? ", selected" : ""}`}
                accessibilityState={{ selected: isSelected }}
                testID={`model-row-${item.id}`}
                style={({ pressed }) => [
                  styles.modelRow,
                  {
                    backgroundColor: isSelected
                      ? colors.primaryContainer
                      : pressed
                        ? colors.surfaceAlt
                        : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.outlineVariant,
                  },
                ]}
              >
                <View style={styles.rowMain} testID={`model-catalog-option-${index}`}>
                  {/* Top Row: Name & Badges */}
                  <View style={styles.rowTopLine}>
                    <Text
                      variant="subtitle"
                      numberOfLines={1}
                      style={[
                        styles.modelName,
                        {
                          color: isSelected ? colors.onPrimaryContainer : colors.onSurface,
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <View style={styles.badgeRow}>
                      {hasTools && (
                        <View
                          style={[
                            styles.toolBadge,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.secondaryContainer,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.toolBadgeText,
                              {
                                color: isSelected ? colors.onPrimary : colors.onSecondaryContainer,
                              },
                            ]}
                          >
                            {t({ id: "components.coach.toolsBadge", message: "Tools" })}
                          </Text>
                        </View>
                      )}
                      {isSelected && (
                        <View
                          style={[
                            styles.selectedCheckCircle,
                            { backgroundColor: colors.primary },
                          ]}
                        >
                          <Check size={14} color={colors.onPrimary} strokeWidth={2.5} />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Verbatim Model ID */}
                  <Text
                    style={[
                      styles.modelId,
                      {
                        color: isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.id}
                  </Text>

                  {/* Metadata Row: Context & Pricing */}
                  <View style={styles.metaRow}>
                    <Text
                      variant="caption"
                      style={[
                        styles.metaText,
                        {
                          color: isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      {contextStr}
                    </Text>
                    <Text
                      variant="caption"
                      style={[
                        styles.metaDivider,
                        {
                          color: isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      •
                    </Text>
                    <Text
                      variant="caption"
                      style={[
                        styles.metaText,
                        {
                          color: isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      {pricingStr}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text variant="subtitle" style={{ color: colors.onSurface, textAlign: "center" }}>
                {searchQuery.trim().length > 0
                  ? i18n._({
                      id: "components.coach.noModelsMatching",
                      message: 'No models matching "{query}"',
                      values: { query: searchQuery },
                    })
                  : t({
                      id: "components.coach.noModelsAvailable",
                      message: "No models available in catalog.",
                    })}
              </Text>
              <Text
                variant="caption"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: spacing.xs }}
              >
                {searchQuery.trim().length > 0
                  ? t({
                      id: "components.coach.tryDifferentSearch",
                      message: "Try searching for a different provider or model name.",
                    })
                  : t({
                      id: "components.coach.checkNetworkOrRefresh",
                      message: "Check your network connection or refresh the catalog.",
                    })}
              </Text>
              <Pressable
                onPress={() => void refreshCatalog()}
                accessibilityRole="button"
                accessibilityLabel={t({ id: "components.coach.refreshCatalog", message: "Refresh catalog" })}
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary, marginTop: spacing.md },
                ]}
              >
                <RotateCcw size={16} color={colors.onPrimary} style={{ marginRight: spacing.xs }} />
                <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                  {t({ id: "components.coach.refreshCatalog", message: "Refresh catalog" })}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

export default ModelPicker;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTextContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  iconButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bannerText: {
    flex: 1,
    gap: spacing.xs,
  },
  bannerButton: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  bannerOutlineButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 44,
    gap: spacing.xs,
  },
  selectionStatusCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  controlsContainer: {
    gap: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.base,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    padding: spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  filterLabelContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  filterLabel: {
    fontWeight: "600",
    fontSize: fontSizes.sm,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  modelList: {
    flex: 1,
  },
  modelRow: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 64,
    justifyContent: "center",
  },
  rowMain: {
    gap: spacing.xs,
  },
  rowTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelName: {
    flex: 1,
    fontSize: fontSizes.base,
    fontWeight: "700",
    marginRight: spacing.sm,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  toolBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  toolBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
  selectedCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  modelId: {
    fontSize: fontSizes.xs,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  metaText: {
    fontSize: fontSizes.xs,
  },
  metaDivider: {
    marginHorizontal: spacing.xs,
    fontSize: fontSizes.xs,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  errorMessage: {
    textAlign: "center",
    lineHeight: 20,
  },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.base,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
});
