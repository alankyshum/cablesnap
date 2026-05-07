/**
 * BLD-1086: Variant chip for per-variant PR cards.
 *
 * Renders a horizontal row of variant dimension labels below the exercise name.
 * Null dimensions are rendered as em-dash (–). If ALL four dimensions are null
 * the chip renders nothing (caller should show "(unspecified)" caption instead).
 *
 * 390px web-viewport: chip text wraps within its container; max 28 chars before
 * ellipsizing in the middle. Parent-to-child width constraint is enforced by
 * flex:1 on the container — do not set a fixed width here.
 *
 * accessibilityLabel is the full human-readable sentence:
 *   "Variant: Rope attachment, high mount, neutral grip, kilograms."
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  ATTACHMENT_LABELS,
  MOUNT_POSITION_LABELS,
  GRIP_TYPE_LABELS,
} from "@/lib/types";

export type VariantTuple = {
  attachment: string | null;
  mountPosition: string | null;
  gripType: string | null;
  stackUnitAtLog: string | null;
};

function labelFor(
  value: string | null,
  dict: Record<string, string>
): string {
  if (value === null) return "–";
  return dict[value] ?? value;
}

function stackUnitLabel(unit: string | null): string {
  if (unit === null) return "–";
  if (unit === "kg") return "kg";
  if (unit === "lb") return "lb";
  return unit;
}

function isAllNull(v: VariantTuple): boolean {
  return v.attachment === null && v.mountPosition === null && v.gripType === null && v.stackUnitAtLog === null;
}

function buildChipText(v: VariantTuple): string {
  const parts = [
    labelFor(v.attachment, ATTACHMENT_LABELS as Record<string, string>),
    labelFor(v.mountPosition, MOUNT_POSITION_LABELS as Record<string, string>),
    labelFor(v.gripType, GRIP_TYPE_LABELS as Record<string, string>),
    stackUnitLabel(v.stackUnitAtLog),
  ];
  // Collapse trailing em-dashes if all subsequent dims are null
  let end = parts.length - 1;
  while (end > 0 && parts[end] === "–") end--;
  return parts.slice(0, end + 1).join(" · ");
}

function buildAccessibilityLabel(v: VariantTuple): string {
  const parts: string[] = [];
  if (v.attachment !== null) {
    parts.push(`${labelFor(v.attachment, ATTACHMENT_LABELS as Record<string, string>)} attachment`);
  }
  if (v.mountPosition !== null) {
    parts.push(`${labelFor(v.mountPosition, MOUNT_POSITION_LABELS as Record<string, string>)} mount`);
  }
  if (v.gripType !== null) {
    parts.push(`${labelFor(v.gripType, GRIP_TYPE_LABELS as Record<string, string>)} grip`);
  }
  if (v.stackUnitAtLog !== null) {
    parts.push(stackUnitLabel(v.stackUnitAtLog));
  }
  if (parts.length === 0) return "Variant: unspecified.";
  return `Variant: ${parts.join(", ")}.`;
}

type Props = {
  variant: VariantTuple;
};

export default function VariantChip({ variant }: Props) {
  const colors = useThemeColors();

  if (isAllNull(variant)) return null;

  const chipText = buildChipText(variant);
  const a11yLabel = buildAccessibilityLabel(variant);

  return (
    <View
      style={styles.chipWrap}
      accessible
      accessibilityLabel={a11yLabel}
      accessibilityRole="text"
    >
      <Text
        variant="caption"
        numberOfLines={1}
        ellipsizeMode="middle"
        style={[styles.chipText, { color: colors.primary, backgroundColor: colors.primaryContainer }]}
      >
        {chipText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: "row",
    overflow: "hidden",
    marginTop: 3,
  },
  chipText: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 11,
    overflow: "hidden",
  },
});
