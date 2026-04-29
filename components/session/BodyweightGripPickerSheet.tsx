import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { SegmentedControl, type SegmentedControlButton } from "@/components/ui/segmented-control";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import {
  GRIP_TYPE_VALUES,
  GRIP_WIDTH_VALUES,
} from "@/lib/bodyweight-grip-variant";
import {
  GRIP_TYPE_LABELS,
  GRIP_WIDTH_LABELS,
  type GripType,
  type GripWidth,
} from "@/lib/types";

export type BodyweightGripPickerSheetProps = {
  isVisible: boolean;
  onClose: () => void;

  /** Per-set value as it currently sits in the DB (NULL = unset). */
  gripType: GripType | null;
  /** Per-set value as it currently sits in the DB (NULL = unset). */
  gripWidth: GripWidth | null;

  /**
   * Callback when the user confirms. Either field may be NULL (cleared).
   * Caller is responsible for the DB write — the sheet is presentational.
   */
  onConfirm: (next: { gripType: GripType | null; gripWidth: GripWidth | null }) => void;

  /** Set number for the title ("Set 3 — Grip"). */
  setNumber?: number;
};

type BodyweightGripPickerBodyProps = Omit<BodyweightGripPickerSheetProps, "isVisible">;

/**
 * Inner body — owns the staged state. Mounted by `BodyweightGripPickerSheet`
 * only while the sheet is visible, so `useState` initializers re-run on every
 * open. Mirrors `VariantPickerSheet` (BLD-771) exactly to avoid the
 * `react-hooks/refs` lint trap that fires on effect-driven resync.
 *
 * **Sibling, not a parameterization** of `VariantPickerSheet` per
 * PLAN-BLD-768.md "Sheet Decision". Defer the parameterization to a future
 * fourth use-case.
 */
function BodyweightGripPickerBody({
  onClose,
  gripType,
  gripWidth,
  onConfirm,
}: BodyweightGripPickerBodyProps) {
  const colors = useThemeColors();

  // Sentinel "" means "user has not touched this field; saving keeps it NULL".
  const [stagedGripType, setStagedGripType] = useState<string>(gripType ?? "");
  const [stagedGripWidth, setStagedGripWidth] = useState<string>(gripWidth ?? "");

  const gripTypeButtons: SegmentedControlButton[] = GRIP_TYPE_VALUES.map((value) => {
    const label = GRIP_TYPE_LABELS[value];
    return {
      value,
      label,
      accessibilityLabel: `Grip type ${label}`,
    };
  });

  const gripWidthButtons: SegmentedControlButton[] = GRIP_WIDTH_VALUES.map((value) => {
    const label = GRIP_WIDTH_LABELS[value];
    return {
      value,
      label,
      accessibilityLabel: `Grip width ${label}`,
    };
  });

  const handleClear = useCallback(() => {
    setStagedGripType("");
    setStagedGripWidth("");
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm({
      gripType: stagedGripType === "" ? null : (stagedGripType as GripType),
      gripWidth: stagedGripWidth === "" ? null : (stagedGripWidth as GripWidth),
    });
    onClose();
  }, [stagedGripType, stagedGripWidth, onConfirm, onClose]);

  return (
    <View>
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.onSurface }]}>Grip type</Text>
        <SegmentedControl
          value={stagedGripType}
          onValueChange={setStagedGripType}
          buttons={gripTypeButtons}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.onSurface }]}>Grip width</Text>
        <SegmentedControl
          value={stagedGripWidth}
          onValueChange={setStagedGripWidth}
          buttons={gripWidthButtons}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Clear grip"
          accessibilityHint="Removes the grip type and width values from this set"
          hitSlop={8}
          style={[styles.actionButton, { borderColor: colors.outline }]}
        >
          <Text style={[styles.actionLabel, { color: colors.onSurface }]}>Clear</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityLabel="Save grip"
          hitSlop={8}
          style={[
            styles.actionButton,
            styles.primaryAction,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={[styles.actionLabel, { color: colors.onPrimary }]}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * BLD-822: Bottom-sheet picker for per-set bodyweight grip variant.
 *
 * Two `<SegmentedControl>` rows — one for grip type (overhand/underhand/
 * neutral/mixed), one for grip width (narrow/shoulder/wide) — plus a Clear
 * action that writes NULL on confirm.
 *
 * **No exercise-level default semantics.** Unlike `VariantPickerSheet` (which
 * has the `defaultAttachment` / `defaultMount` pre-highlight from
 * `exercise.attachment` / `exercise.mount_position`), bodyweight grip variants
 * have no exercise-level definition column. Empty staged state → save writes
 * NULL. Autofill from prior-set history is handled at the
 * `useBodyweightGripPickerSheet` layer (caller's `gripType`/`gripWidth` props),
 * NOT here.
 *
 * **Body remount on open:** the inner body is mounted only while `isVisible`
 * is true. `useState` initializers re-run on every open, so re-opening picks
 * up fresh prop values without the effect-based resync that trips
 * `react-hooks/refs`. Mirrors `VariantPickerSheet` (BLD-771).
 *
 * **A11y / focus return:** the parent `SetRow` is responsible for restoring
 * focus to the originating row on dismiss, via the
 * `useBodyweightGripPickerSheet` hook's `bodyweightGripFooterRef`.
 */
export function BodyweightGripPickerSheet({
  isVisible,
  onClose,
  gripType,
  gripWidth,
  onConfirm,
  setNumber,
}: BodyweightGripPickerSheetProps) {
  const title = setNumber != null ? `Set ${setNumber} — Grip` : "Grip";
  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title={title}
      snapPoints={[0.55, 0.8]}
      enableBackdropDismiss
    >
      {isVisible ? (
        <BodyweightGripPickerBody
          onClose={onClose}
          gripType={gripType}
          gripWidth={gripWidth}
          onConfirm={onConfirm}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    marginBottom: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryAction: {
    borderWidth: 0,
  },
  actionLabel: {
    fontSize: fontSizes.base,
    fontWeight: "600",
  },
});
