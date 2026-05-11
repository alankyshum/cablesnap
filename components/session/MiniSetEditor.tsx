/**
 * BLD-1168 Slice 7: MiniSetEditor
 *
 * Shown below an advanced-type set row (rest_pause | cluster | myo_reps) during
 * an active session. Allows the user to:
 *   - View existing mini-sets as focusable rows
 *   - Add a new mini-set (max 8, warn at 7)
 *   - Delete an existing mini-set (long-press → confirmation)
 *   - Collapse all mini-sets back to a single normal set (with sum of reps)
 *
 * The component is purely presentational: it receives segments as props and
 * dispatches mutations via callbacks (provided by the active-session hook or
 * the useMiniSetEditor helper). No DB calls happen inside this file.
 *
 * Behavior-Design Classification: NO — no streaks, badges, rewards, or
 * motivational framing. Functional logging primitive only.
 */
import React, { useCallback } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { SetSegment } from "@/lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";

export const MAX_MINI_SETS = 8;
export const WARN_MINI_SETS = 7;

export type MiniSetEditorProps = {
  /** ID of the parent workout_sets row (for error context). */
  setId: string;
  /** Ordered list of existing mini-sets for this set. */
  segments: SetSegment[];
  /** Called when the user taps "+ mini-set". Should insert a new segment. */
  onAddSegment: () => Promise<void> | void;
  /** Called when the user confirms deletion of a segment. */
  onDeleteSegment: (segmentId: string) => Promise<void> | void;
  /**
   * Called when the user confirms collapsing the advanced set back to normal.
   * The parent component is responsible for: (a) deleting all segments,
   * (b) setting reps = Σ segments.reps, (c) changing set_type back to "normal".
   */
  onCollapseToNormal: () => Promise<void> | void;
  /**
   * Optional: current reps draft for the NEXT mini-set input.
   * If undefined, the editor shows a simple "+ mini-set" button.
   */
  nextReps?: number | null;
  onChangeNextReps?: (reps: number | null) => void;
};

export function MiniSetEditor({
  setId,
  segments,
  onAddSegment,
  onDeleteSegment,
  onCollapseToNormal,
  nextReps,
  onChangeNextReps,
}: MiniSetEditorProps) {
  const colors = useThemeColors();

  const totalReps = segments.reduce((sum, s) => sum + s.reps, 0);
  const atMax = segments.length >= MAX_MINI_SETS;
  const atWarn = segments.length === WARN_MINI_SETS;

  const handleAddSegment = useCallback(() => {
    if (atMax) return;
    void onAddSegment();
  }, [atMax, onAddSegment]);

  const handleLongPressSegment = useCallback(
    (seg: SetSegment) => {
      Alert.alert(
        "Delete mini-set?",
        `Remove mini-set ${seg.segment_number} (${seg.reps} reps)?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => void onDeleteSegment(seg.id),
          },
        ],
      );
    },
    [onDeleteSegment],
  );

  const handleCollapsePress = useCallback(() => {
    const sum = segments.reduce((s, seg) => s + seg.reps, 0);
    Alert.alert(
      "Collapse mini-sets?",
      `Collapse ${segments.length} mini-sets into a single set of ${sum} reps? Mini-set rest data will be lost.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, collapse",
          style: "destructive",
          onPress: () => void onCollapseToNormal(),
        },
      ],
    );
  }, [segments, onCollapseToNormal]);

  return (
    <View
      style={[styles.container, { borderLeftColor: colors.primaryContainer, backgroundColor: colors.surfaceVariant }]}
      testID={`mini-set-editor-${setId}`}
    >
      {/* Existing mini-set rows */}
      {segments.map((seg) => (
        <Pressable
          key={seg.id}
          style={[styles.segmentRow, { borderBottomColor: colors.outline }]}
          onLongPress={() => handleLongPressSegment(seg)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={
            `Mini-set ${seg.segment_number} of ${segments.length}, ${seg.reps} reps` +
            (seg.weight != null ? ` at ${seg.weight} kg` : "") +
            (seg.completed_at != null ? ", completed" : "")
          }
          accessibilityHint="Long press to delete this mini-set"
          testID={`mini-set-segment-${seg.id}`}
        >
          <Text variant="caption" style={[styles.segmentLabel, { color: colors.onSurfaceVariant }]}>
            {seg.segment_number}
          </Text>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
            {seg.reps} reps{seg.weight != null ? ` @ ${seg.weight}` : ""}
          </Text>
          {seg.completed_at != null && (
            <Text variant="caption" style={{ color: colors.primary }}>✓</Text>
          )}
        </Pressable>
      ))}

      {/* Next reps input (optional controlled mode) */}
      {onChangeNextReps && (
        <View style={styles.inputRow}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginRight: 8 }}>
            Next reps:
          </Text>
          <TextInput
            style={[styles.repsInput, { color: colors.onSurface, borderColor: colors.outline }]}
            value={nextReps != null ? String(nextReps) : ""}
            onChangeText={(v) => {
              const n = parseInt(v, 10);
              onChangeNextReps(Number.isFinite(n) && n > 0 ? n : null);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.onSurfaceVariant}
            accessibilityLabel="Reps for next mini-set"
            testID="mini-set-next-reps-input"
          />
        </View>
      )}

      {/* Warn at 7 */}
      {atWarn && (
        <Text variant="caption" style={[styles.warnText, { color: colors.onSurfaceVariant }]}>
          One more mini-set remaining before maximum (8).
        </Text>
      )}

      {/* Action row */}
      <View style={styles.actionRow}>
        <Pressable
          style={[
            styles.addButton,
            { borderColor: colors.primary, opacity: atMax ? 0.4 : 1 },
          ]}
          onPress={handleAddSegment}
          disabled={atMax}
          accessible
          accessibilityRole="button"
          accessibilityLabel={atMax ? "Maximum mini-sets reached" : "Add mini-set"}
          accessibilityHint={atMax ? undefined : "Tap to log the next mini-set"}
          testID="mini-set-add-button"
        >
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: fontSizes.sm }}>
            + mini-set
          </Text>
        </Pressable>

        {segments.length > 0 && (
          <>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginHorizontal: 8 }}>
              Total: {totalReps}
            </Text>
            <Pressable
              onPress={handleCollapsePress}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Collapse mini-sets back to normal set"
              testID="mini-set-collapse-button"
            >
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, textDecorationLine: "underline" }}>
                Collapse
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {atMax && (
        <Text variant="caption" style={[styles.warnText, { color: colors.error }]}>
          Maximum 8 mini-sets reached. Use a separate set for more.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    marginLeft: 8,
    marginTop: 2,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  segmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmentLabel: {
    width: 24,
    fontWeight: "700",
    textAlign: "center",
    marginRight: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  addButton: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  warnText: {
    marginTop: 4,
    fontStyle: "italic",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  repsInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    width: 56,
    textAlign: "center",
    paddingVertical: 4,
    fontSize: fontSizes.sm,
  },
});
