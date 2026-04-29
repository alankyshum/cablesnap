/**
 * BLD-788: per-exercise cable variant analytics filter.
 *
 * Renders only when the parent exercise is a cable exercise (gating is the
 * caller's responsibility — pass `null` to hide). Lets the user scope the
 * exercise's records / chart / best-set queries to a tuple
 * `(attachment, mount_position)`.
 *
 * Each dimension is independent — selecting only an attachment leaves
 * mount_position unscoped (and vice versa). Tap an active chip again to clear
 * that dimension.
 *
 * State is component-local (lifted into `useExerciseDetail` via
 * `setVariantScope`); never persisted across cold-start.
 *
 * Read-only filter — never writes to `workout_sets`. No streaks, no
 * gamification, no notifications (Behavior-Design Classification: NO).
 *
 * Vocabulary source: `lib/cable-variant.ts` (no hardcoded enum literals — see
 * `scripts/audit-vocab.sh`).
 */

import React, { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
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
import type { VariantScope } from "@/lib/db";

export type ExerciseVariantFilterProps = {
  /** Active filter state. `{}` = "All variants". */
  scope: VariantScope;
  /** Setter; merge-replace the scope. */
  onChange: (next: VariantScope) => void;
  /**
   * Total count of completed, non-warmup sets for this exercise that have
   * any variant field populated (attachment OR mount_position not null).
   * Used for the "All variants (N logged)" badge.
   */
  variantTotal: number;
};

function isFilterActive(scope: VariantScope): boolean {
  return scope.attachment !== undefined || scope.mount_position !== undefined;
}

function formatBadge(scope: VariantScope, variantTotal: number): string {
  if (!isFilterActive(scope)) {
    return `Showing: All variants (${variantTotal} logged)`;
  }
  const parts: string[] = [];
  if (scope.attachment !== undefined) {
    parts.push(scope.attachment === null ? "(no attachment)" : ATTACHMENT_LABELS[scope.attachment]);
  }
  if (scope.mount_position !== undefined) {
    parts.push(scope.mount_position === null ? "(no mount)" : MOUNT_POSITION_LABELS[scope.mount_position]);
  }
  return `Showing: ${parts.join(" · ")}`;
}

export default function ExerciseVariantFilter({
  scope,
  onChange,
  variantTotal,
}: ExerciseVariantFilterProps) {
  const colors = useThemeColors();
  const active = isFilterActive(scope);

  const toggleAttachment = useCallback(
    (value: Attachment) => {
      if (scope.attachment === value) {
        const next: VariantScope = { ...scope };
        delete next.attachment;
        onChange(next);
      } else {
        onChange({ ...scope, attachment: value });
      }
    },
    [scope, onChange]
  );

  const toggleMount = useCallback(
    (value: MountPosition) => {
      if (scope.mount_position === value) {
        const next: VariantScope = { ...scope };
        delete next.mount_position;
        onChange(next);
      } else {
        onChange({ ...scope, mount_position: value });
      }
    },
    [scope, onChange]
  );

  const clear = useCallback(() => onChange({}), [onChange]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}
      accessibilityLabel="Cable variant filter"
    >
      <View style={styles.headerRow}>
        <Text
          variant="body"
          style={[styles.badge, { color: colors.onSurface }]}
          accessibilityRole="header"
          accessibilityLabel={formatBadge(scope, variantTotal)}
        >
          {formatBadge(scope, variantTotal)}
        </Text>
        {active && (
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel="Clear variant filter"
            style={({ pressed }) => [
              styles.clearBtn,
              { backgroundColor: colors.surfaceVariant, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.clearLabel, { color: colors.onSurfaceVariant }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.dimensionLabel, { color: colors.onSurfaceVariant }]}>Attachment</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {ATTACHMENT_VALUES.map((v) => {
          const selected = scope.attachment === v;
          return (
            <Pressable
              key={v}
              onPress={() => toggleAttachment(v)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Attachment ${ATTACHMENT_LABELS[v]}${selected ? ", selected" : ""}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.primaryContainer : colors.surfaceVariant,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: selected ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                ]}
              >
                {ATTACHMENT_LABELS[v]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.dimensionLabel, { color: colors.onSurfaceVariant }]}>Mount</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {MOUNT_POSITION_VALUES.map((v) => {
          const selected = scope.mount_position === v;
          return (
            <Pressable
              key={v}
              onPress={() => toggleMount(v)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Mount ${MOUNT_POSITION_LABELS[v]}${selected ? ", selected" : ""}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.primaryContainer : colors.surfaceVariant,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: selected ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                ]}
              >
                {MOUNT_POSITION_LABELS[v]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  badge: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  clearLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
  dimensionLabel: {
    fontSize: fontSizes.xs,
    marginTop: 6,
    marginBottom: 4,
  },
  chipRow: {
    paddingVertical: 2,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 6,
  },
  chipLabel: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
});
