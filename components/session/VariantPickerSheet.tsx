import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { SegmentedControl, type SegmentedControlButton } from "@/components/ui/segmented-control";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import {
  ATTACHMENT_VALUES,
  MOUNT_POSITION_VALUES,
} from "@/lib/cable-variant";
import {
  ATTACHMENT_LABELS,
  MOUNT_POSITION_LABELS,
  type Attachment,
  type MountPosition,
} from "@/lib/types";

// "(default)" suffix is rendered when the exercise-definition default is the
// pre-highlighted option. Per QD-B2 / plan §UX line 132, the default is shown
// as a hint inside the picker but is NEVER auto-stamped onto the set unless
// the user explicitly confirms.
const DEFAULT_SUFFIX = " (default)";

export type VariantPickerSheetProps = {
  isVisible: boolean;
  onClose: () => void;

  /** Per-set value as it currently sits in the DB (NULL = unset). */
  attachment: Attachment | null;
  /** Per-set value as it currently sits in the DB (NULL = unset). */
  mount: MountPosition | null;

  /** Exercise-definition default; pre-highlighted in the picker if non-null. */
  defaultAttachment?: Attachment | null;
  /** Exercise-definition default; pre-highlighted in the picker if non-null. */
  defaultMount?: MountPosition | null;

  /**
   * Callback when the user confirms. Either field may be NULL (cleared).
   * Caller is responsible for the DB write — the sheet is presentational.
   */
  onConfirm: (next: { attachment: Attachment | null; mount: MountPosition | null }) => void;

  /** Set number for the title ("Set 3 — Variant"). */
  setNumber?: number;
};

type VariantPickerBodyProps = Omit<VariantPickerSheetProps, "isVisible">;

/**
 * Inner body — owns the staged state. Mounted by `VariantPickerSheet` only
 * while the sheet is visible, so `useState` initializers re-run on every
 * open. This avoids the `react-hooks/refs` lint trap that fires on
 * effect-driven resync (see commit history for the previous, lint-rejected
 * approach).
 */
function VariantPickerBody({
  onClose,
  attachment,
  mount,
  defaultAttachment,
  defaultMount,
  onConfirm,
}: VariantPickerBodyProps) {
  const colors = useThemeColors();

  // Sentinel "" means "user has not touched this field; saving keeps it NULL".
  const [stagedAttachment, setStagedAttachment] = useState<string>(attachment ?? "");
  const [stagedMount, setStagedMount] = useState<string>(mount ?? "");

  const attachmentButtons: SegmentedControlButton[] = ATTACHMENT_VALUES.map((value) => {
    const isDefault = defaultAttachment === value;
    const label = ATTACHMENT_LABELS[value];
    return {
      value,
      label: isDefault ? `${label}${DEFAULT_SUFFIX}` : label,
      accessibilityLabel: `Attachment ${label}${isDefault ? ", default" : ""}`,
    };
  });

  const mountButtons: SegmentedControlButton[] = MOUNT_POSITION_VALUES.map((value) => {
    const isDefault = defaultMount === value;
    const label = MOUNT_POSITION_LABELS[value];
    return {
      value,
      label: isDefault ? `${label}${DEFAULT_SUFFIX}` : label,
      accessibilityLabel: `Mount ${label}${isDefault ? ", default" : ""}`,
    };
  });

  // Pre-highlight: if user hasn't staged a value but a definition default
  // exists, show the default as visually selected. Crucially, this does NOT
  // change `stagedAttachment` — confirming without an explicit tap saves NULL.
  const visibleAttachmentValue = stagedAttachment !== ""
    ? stagedAttachment
    : (defaultAttachment ?? "");
  const visibleMountValue = stagedMount !== ""
    ? stagedMount
    : (defaultMount ?? "");

  const handleClear = useCallback(() => {
    setStagedAttachment("");
    setStagedMount("");
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm({
      attachment: stagedAttachment === "" ? null : (stagedAttachment as Attachment),
      mount: stagedMount === "" ? null : (stagedMount as MountPosition),
    });
    onClose();
  }, [stagedAttachment, stagedMount, onConfirm, onClose]);

  return (
    <View>
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.onSurface }]}>Attachment</Text>
        <SegmentedControl
          value={String(visibleAttachmentValue)}
          onValueChange={setStagedAttachment}
          buttons={attachmentButtons}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.onSurface }]}>Mount position</Text>
        <SegmentedControl
          value={String(visibleMountValue)}
          onValueChange={setStagedMount}
          buttons={mountButtons}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Clear variant"
          accessibilityHint="Removes the attachment and mount values from this set"
          hitSlop={8}
          style={[styles.actionButton, { borderColor: colors.outline }]}
        >
          <Text style={[styles.actionLabel, { color: colors.onSurface }]}>Clear</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityLabel="Save variant"
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
 * BLD-771: Bottom-sheet picker for per-set cable variant.
 *
 * Wraps `<BottomSheet>` with two `<SegmentedControl>` rows — one for
 * attachment, one for mount position — plus a Clear action that writes NULL
 * on confirm.
 *
 * **Default semantics (QD-B2):** if `defaultAttachment` / `defaultMount` are
 * provided AND the per-set value is NULL, that default is *pre-highlighted*
 * in the segmented control (cosmetic only) with a "(default)" suffix on the
 * label. The internal staged state stays NULL until the user actively taps a
 * segment — confirming without touching the picker leaves the field NULL.
 * This closes the silent-default trap.
 *
 * **Body remount on open:** the inner `VariantPickerBody` is mounted only
 * while `isVisible` is true. That makes `useState` initializers re-run on
 * every open, so re-opening picks up fresh prop values without the
 * effect-based resync that trips `react-hooks/refs`.
 *
 * **A11y / focus return:** the parent `SetRow` is responsible for restoring
 * focus to the originating row on dismiss (plan §UX line 84). This component
 * only handles the picker's own controls.
 */
export function VariantPickerSheet({
  isVisible,
  onClose,
  attachment,
  mount,
  defaultAttachment,
  defaultMount,
  onConfirm,
  setNumber,
}: VariantPickerSheetProps) {
  const title = setNumber != null ? `Set ${setNumber} — Variant` : "Variant";
  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title={title}
      snapPoints={[0.55, 0.8]}
      enableBackdropDismiss
    >
      {isVisible ? (
        <VariantPickerBody
          onClose={onClose}
          attachment={attachment}
          mount={mount}
          defaultAttachment={defaultAttachment}
          defaultMount={defaultMount}
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
