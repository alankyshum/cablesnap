/**
 * BLD-938 — FilterBar for the history screen.
 *
 * Renders three tappable chips (Template / Muscle Group / Date Range) plus
 * a "Clear all" link when any filter is active. Active chips show an inline
 * dismiss (×) that clears just that key.
 *
 * Single-select v1 (multi-select deferred to v2 per plan §Out of Scope).
 *
 * The bar resolves its own display labels from the canonical state
 * (`filters` + `templateOptions` + `MUSCLE_LABELS`) so callers don't have
 * to compute them — keeps every label in sync with renames/deletes.
 */
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronDown, X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { HistoryFilters, TemplateOption } from "@/lib/db";
import type { HistoryFilterKey } from "@/hooks/useHistoryFilters";
import { MUSCLE_LABELS, type MuscleGroup } from "@/lib/types";

const DATE_PRESET_LABELS: Record<string, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
};

export type FilterBarProps = {
  filters: HistoryFilters;
  templateOptions: TemplateOption[];
  onOpenTemplateSheet: () => void;
  onOpenMuscleGroupSheet: () => void;
  onOpenDateRangeSheet: () => void;
  onClearOne: (key: HistoryFilterKey) => void;
  onClearAll: () => void;
};

export function FilterBar({
  filters,
  templateOptions,
  onOpenTemplateSheet,
  onOpenMuscleGroupSheet,
  onOpenDateRangeSheet,
  onClearOne,
  onClearAll,
}: FilterBarProps) {
  const colors = useThemeColors();

  // Resolve template display name from the cached options. If the
  // template was deleted between visits, the row still surfaces with a
  // "(deleted)" suffix — falls back to a generic label only if the
  // option list is empty (race window before the load completes).
  const templateLabel = useMemo<string | null>(() => {
    if (filters.templateId === null) return null;
    const opt = templateOptions.find((o) => o.template_id === filters.templateId);
    if (!opt) return "Template";
    return opt.is_deleted ? `${opt.template_name} (deleted)` : opt.template_name;
  }, [filters.templateId, templateOptions]);

  const muscleGroupLabel = useMemo<string | null>(() => {
    if (filters.muscleGroup === null) return null;
    return MUSCLE_LABELS[filters.muscleGroup as MuscleGroup] ?? filters.muscleGroup;
  }, [filters.muscleGroup]);

  const datePresetLabel = useMemo<string | null>(() => {
    if (filters.datePreset === null) return null;
    return DATE_PRESET_LABELS[filters.datePreset] ?? filters.datePreset;
  }, [filters.datePreset]);

  const anyActive =
    filters.templateId !== null ||
    filters.muscleGroup !== null ||
    filters.datePreset !== null;

  return (
    <View style={styles.container} testID="history-filter-bar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        <FilterChip
          label="Template"
          selectedLabel={templateLabel}
          onPress={onOpenTemplateSheet}
          onClear={() => onClearOne("templateId")}
          colors={colors}
          testID="history-filter-chip-template"
        />
        <FilterChip
          label="Muscle Group"
          selectedLabel={muscleGroupLabel}
          onPress={onOpenMuscleGroupSheet}
          onClear={() => onClearOne("muscleGroup")}
          colors={colors}
          testID="history-filter-chip-muscle"
        />
        <FilterChip
          label="Date Range"
          selectedLabel={datePresetLabel}
          onPress={onOpenDateRangeSheet}
          onClear={() => onClearOne("datePreset")}
          colors={colors}
          testID="history-filter-chip-date"
        />
      </ScrollView>
      {anyActive && (
        <Pressable
          onPress={onClearAll}
          accessibilityLabel="Clear all filters"
          accessibilityRole="button"
          style={styles.clearAll}
          testID="history-filter-clear-all"
        >
          <Text variant="caption" style={{ color: colors.primary, fontWeight: "600" }}>
            Clear all
          </Text>
        </Pressable>
      )}
    </View>
  );
}

type FilterChipProps = {
  label: string;
  selectedLabel: string | null;
  onPress: () => void;
  onClear: () => void;
  colors: ReturnType<typeof useThemeColors>;
  testID?: string;
};

function FilterChip({ label, selectedLabel, onPress, onClear, colors, testID }: FilterChipProps) {
  const active = selectedLabel !== null;
  const display = active ? selectedLabel! : label;
  const accessibilityLabel = active
    ? `${label} filter, currently ${selectedLabel}, double-tap to change`
    : `${label} filter, none selected, double-tap to select`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primaryContainer : colors.surface,
          borderColor: active ? colors.primary : colors.outline,
        },
      ]}
      testID={testID}
    >
      <Text
        variant="caption"
        style={{
          color: active ? colors.onPrimaryContainer : colors.onSurface,
          fontWeight: active ? "600" : "500",
        }}
        numberOfLines={1}
      >
        {display}
      </Text>
      {active ? (
        <Pressable
          onPress={onClear}
          accessibilityLabel={`Clear ${label} filter`}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.dismissBtn}
        >
          <Icon name={X} size={14} />
        </Pressable>
      ) : (
        <Icon name={ChevronDown} size={14} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  scroll: {
    // Bound the ScrollView width so it can actually scroll horizontally
    // instead of overflowing the row and clipping the rightmost chip
    // (BLD-956 — Date Range chip clipped at 390px viewport).
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
  },
  dismissBtn: {
    padding: 2,
    marginRight: -4,
  },
  clearAll: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  },
});
