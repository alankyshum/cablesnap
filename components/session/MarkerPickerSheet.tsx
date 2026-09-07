import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * MarkerPickerSheet — lets the user pick a cable stack marker number from the
 * active gym's calibration table. On confirm, the caller receives the selected
 * marker and the resolved true weight.
 *
 * Mirrors VariantPickerSheet (BLD-771) — a sibling component, NOT an overload.
 * BLD-1059: Per-Gym Cable Stack Calibration.
 */
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import type { CableStackRow, StackCalibrationRow } from "@/lib/db/schema";

export type MarkerPickerSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  stacks: Array<CableStackRow & { calibrations: StackCalibrationRow[] }>;
  onConfirm: (result: {
    stackId: string;
    stackName: string;
    marker: number;
    trueWeight: number;
    unit: string;
  }) => void;
};

function MarkerPickerBody({
  onClose,
  stacks,
  onConfirm,
}: Omit<MarkerPickerSheetProps, "isVisible">) {
  const colors = useThemeColors();
  const [selectedStackId, setSelectedStackId] = useState<string | null>(
    stacks.length === 1 ? stacks[0].id : null
  );

  const activeStack = stacks.find((stack) => stack.id === selectedStackId) ?? null;

  const handleSelect = useCallback((marker: number, trueWeight: number) => {
    if (!activeStack) return;
    onConfirm({
      stackId: activeStack.id,
      stackName: activeStack.name,
      marker,
      trueWeight,
      unit: activeStack.unit,
    });
    onClose();
  }, [activeStack, onClose, onConfirm]);

  const sortedCalibrations = activeStack
    ? [...activeStack.calibrations].sort((a, b) => a.marker - b.marker)
    : [];

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.onSurface }]}>{t({ id: "session.markerpickersheet.str2", message: "Select Marker" })}</Text>

      {stacks.length > 1 ? (
        <View style={styles.stackPicker}>
          {stacks.map((stack) => {
            const selected = selectedStackId === stack.id;
            return (
              <Pressable
                key={stack.id}
                onPress={() => setSelectedStackId(stack.id)}
                style={[
                  styles.stackChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t({ id: "session.markerpickersheet.dynamic1", message: `Stack: ${stack.name}` })}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.stackChipText,
                    { color: selected ? colors.onPrimary : colors.onSurface },
                  ]}
                >
                  {stack.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {activeStack && activeStack.calibrations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>{t({ id: "session.markerpickersheet.str3", message: "No markers added yet. Add markers in Settings → Gym Profiles." })}</Text>
        </View>
      ) : null}

      {activeStack && activeStack.calibrations.length > 0 ? (
        <FlatList
          data={sortedCalibrations}
          keyExtractor={(item) => `${item.stack_id}-${item.marker}`}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item.marker, item.true_weight)}
              style={[styles.markerRow, { borderBottomColor: colors.outlineVariant }]}
              accessibilityRole="button"
              accessibilityLabel={t({ id: "session.markerpickersheet.dynamic2", message: `Marker ${item.marker}, ${item.true_weight} ${activeStack.unit}` })}
              accessibilityHint={t({ id: "session.markerpickersheet.str1", message: "Select this marker weight" })}
            >
              <Text style={[styles.markerNumber, { color: colors.onSurface }]}>#{item.marker}</Text>
              <Text style={[styles.markerWeight, { color: colors.onSurfaceVariant }]}> 
                {item.true_weight} {activeStack.unit}
              </Text>
            </Pressable>
          )}
          style={styles.list}
        />
      ) : null}

      {!activeStack && stacks.length > 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>{t({ id: "session.markerpickersheet.str4", message: "Select a stack above to see markers." })}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function MarkerPickerSheet({
  isVisible,
  onClose,
  stacks,
  onConfirm,
}: MarkerPickerSheetProps) {
  return (
    <BottomSheet isVisible={isVisible} onClose={onClose}>
      {isVisible ? (
        <MarkerPickerBody onClose={onClose} stacks={stacks} onConfirm={onConfirm} />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  stackPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  stackChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  stackChipText: { fontSize: fontSizes.sm },
  list: { maxHeight: 320 },
  markerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  markerNumber: { fontSize: fontSizes.base, fontWeight: "600" },
  markerWeight: { fontSize: fontSizes.base },
  emptyState: { paddingHorizontal: 20, paddingVertical: 24 },
});
