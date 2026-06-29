import React, { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import { canonicalizeTempo } from "../../lib/workout/tempo-coach";

type TempoEditorSheetProps = {
  /** Current tempo value for the set (canonical "E-B-C-T" or null). */
  currentTempo: string | null | undefined;
  onSave: (canonical: string | null) => void;
  onDismiss: () => void;
};

const PHASE_LABELS = [
  { key: "e" as const, label: "Eccentric (lowering)", abbr: "E" },
  { key: "b" as const, label: "Bottom pause", abbr: "B" },
  { key: "c" as const, label: "Concentric (lifting)", abbr: "C" },
  { key: "t" as const, label: "Top pause", abbr: "T" },
];

function parsePhases(raw: string | null | undefined): [number, number, number, number] {
  if (!raw) return [0, 0, 0, 0];
  const parts = raw.split("-").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    return parts as [number, number, number, number];
  }
  return [0, 0, 0, 0];
}

/**
 * BLD-1158: Tempo editor bottom sheet.
 *
 * Rendered as a modal overlay (same pattern as SetTypeSheet). Shows four
 * stepper rows for E-B-C-T phases, a canonical preview, and Save/Clear buttons.
 * Save persists the canonical string; Clear sets the tempo to null.
 */
export function TempoEditorSheet({
  currentTempo,
  onSave,
  onDismiss,
}: TempoEditorSheetProps) {
  const colors = useThemeColors();
  const [phases, setPhases] = useState<[number, number, number, number]>(() =>
    parsePhases(currentTempo)
  );
  const [error, setError] = useState<string | null>(null);

  const canonical = phases.every((v) => v === 0)
    ? ""
    : `${phases[0]}-${phases[1]}-${phases[2]}-${phases[3]}`;

  const adjustPhase = useCallback(
    (idx: number, delta: number) => {
      setPhases((prev) => {
        const next = [...prev] as [number, number, number, number];
        const newVal = Math.max(0, Math.min(60, next[idx] + delta));
        next[idx] = newVal;
        return next;
      });
      setError(null);
    },
    []
  );

  const handleSave = useCallback(() => {
    if (canonical === "") {
      onSave(null);
      return;
    }
    const validated = canonicalizeTempo(canonical);
    if (!validated) {
      setError("All phases are 0. Use at least one non-zero phase, or tap Clear to remove.");
      return;
    }
    onSave(validated);
  }, [canonical, onSave]);

  const handleClear = useCallback(() => {
    onSave(null);
  }, [onSave]);

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.overlay]}
      onPress={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kavWrapper}
      >
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="title" style={{ color: colors.onSurface, marginBottom: 4 }}>
            Tempo
          </Text>
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginBottom: 20 }}
          >
            Eccentric–Pause–Concentric–Pause (seconds each)
          </Text>

          {PHASE_LABELS.map(({ key, label, abbr }, idx) => (
            <View key={key} style={styles.phaseRow}>
              <View style={styles.phaseLabel}>
                <View
                  style={[
                    styles.phaseBadge,
                    { backgroundColor: colors.primaryContainer },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: fontSizes.xs,
                      fontWeight: "700",
                      color: colors.onPrimaryContainer,
                    }}
                  >
                    {abbr}
                  </Text>
                </View>
                <Text
                  variant="body"
                  style={{ color: colors.onSurface, flex: 1 }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => adjustPhase(idx, -1)}
                  accessibilityLabel={`Decrease ${label}`}
                  disabled={phases[idx] <= 0}
                >
                  <Text
                    style={{
                      color: phases[idx] <= 0 ? colors.onSurfaceVariant : colors.onSurface,
                      fontSize: fontSizes.lg,
                      fontWeight: "600",
                    }}
                  >
                    −
                  </Text>
                </Pressable>
                <Text
                  style={{
                    color: colors.onSurface,
                    fontSize: fontSizes.base,
                    fontWeight: "700",
                    minWidth: 32,
                    textAlign: "center",
                  }}
                  accessibilityLabel={`${phases[idx]} seconds`}
                >
                  {phases[idx]}s
                </Text>
                <Pressable
                  style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => adjustPhase(idx, 1)}
                  accessibilityLabel={`Increase ${label}`}
                  disabled={phases[idx] >= 60}
                >
                  <Text
                    style={{
                      color: phases[idx] >= 60 ? colors.onSurfaceVariant : colors.onSurface,
                      fontSize: fontSizes.lg,
                      fontWeight: "600",
                    }}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {canonical ? (
            <View style={[styles.previewBox, { backgroundColor: colors.surfaceVariant }]}>
              <Text
                style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}
              >
                Preview:{"  "}
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>
                  ♩ {canonical}
                </Text>
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text
              style={{
                color: colors.error,
                fontSize: fontSizes.sm,
                marginBottom: 8,
              }}
            >
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              variant="ghost"
              onPress={handleClear}
              style={styles.clearBtn}
              accessibilityLabel="Clear tempo"
            >
              <Text style={{ color: colors.onSurfaceVariant }}>Clear</Text>
            </Button>
            <Button
              variant="default"
              onPress={handleSave}
              style={styles.saveBtn}
              accessibilityLabel="Save tempo"
            >
              <Text style={{ color: colors.onPrimary }}>Save</Text>
            </Button>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  kavWrapper: {
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radii.xl ?? 16,
    borderTopRightRadius: radii.xl ?? 16,
    padding: 20,
    paddingBottom: 36,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  phaseLabel: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  phaseBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  clearBtn: {
    flex: 1,
  },
  saveBtn: {
    flex: 2,
  },
});
