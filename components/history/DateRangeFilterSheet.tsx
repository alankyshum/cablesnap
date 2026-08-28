import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { DatePreset } from "@/lib/db";

type DateRangeFilterSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  selectedPreset: DatePreset | null;
  onSelect: (preset: DatePreset | null) => void;
};

function getPresets(): { value: DatePreset; label: string }[] {
  return [
  { value: "7d", label: t({ id: "history.dateRange.last7", message: "Last 7 days" }) },
  { value: "30d", label: t({ id: "history.dateRange.last30", message: "Last 30 days" }) },
  { value: "90d", label: t({ id: "history.dateRange.last90", message: "Last 90 days" }) },
  { value: "year", label: t({ id: "history.dateRange.thisYear", message: "This year" }) },
  ];
}

/**
 * Bottom-sheet for the Date Range filter (BLD-938). Single-select,
 * presets-only — custom date range is deferred to v2 (no
 * `@react-native-community/datetimepicker` dependency in scope).
 */
export function DateRangeFilterSheet({
  isVisible,
  onClose,
  selectedPreset,
  onSelect,
}: DateRangeFilterSheetProps) {
  const colors = useThemeColors();
  const presets = getPresets();

  const handleSelect = (preset: DatePreset) => {
    onSelect(preset);
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    onClose();
  };

  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title={t({ id: "history.dateRange.title", message: "Filter by date range" })}
      snapPoints={[0.45, 0.7]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          accessibilityLabel={t({ id: "history.dateRange.clearA11y", message: "Clear date range filter" })}
          accessibilityRole="button"
        >
          <Text variant="body" style={{ color: colors.primary }}>
            {t({ id: "history.dateRange.clear", message: "Clear" })}
          </Text>
        </Pressable>
      </View>

      <View>
        {presets.map((p) => {
          const isSelected = p.value === selectedPreset;
          return (
            <Pressable
              key={p.value}
              onPress={() => handleSelect(p.value)}
              style={[
                styles.row,
                isSelected && { backgroundColor: colors.primaryContainer },
              ]}
              accessibilityLabel={i18n._({ id: "history.dateRange.optionA11y", message: "{label}{selected, select, true {, selected} false {}}", values: { label: p.label, selected: isSelected } })}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text variant="body" style={{ color: colors.onSurface }}>
                {p.label}
              </Text>
              {isSelected ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
});
