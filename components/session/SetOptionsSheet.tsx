import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { SET_TYPE_CYCLE, SET_TYPE_LABELS } from "../../lib/types";
import type { SetType } from "../../lib/types";
import type { ExerciseGroup } from "./types";
import { fontSizes } from "@/constants/design-tokens";
import { TempoEditorSheet } from "./TempoEditorSheet";

type SetOptionsSheetProps = {
  setId: string;
  /** Current tempo value for the set, or null if none. */
  currentTempo: string | null;
  groups: ExerciseGroup[];
  onSelectType: (type: SetType) => void;
  onSaveTempo: (setId: string, tempo: string | null) => void;
  onDismiss: () => void;
};

/**
 * BLD-1158: Set Options Sheet — extension of SetTypeSheet (QD watchpoint).
 *
 * Combines set-type selection (existing) with a "Tempo" row (new BLD-1158).
 * In PR2, a "Coach Launcher" row will be appended here (gated by setting +
 * tempo presence + rep-mode). This is NOT a parallel sheet — SetTypeSheet is
 * superseded by this component via rename/extension.
 *
 * Rendered as a modal overlay matching SetTypeSheet dimensions.
 */
export function SetOptionsSheet({
  setId,
  currentTempo,
  groups,
  onSelectType,
  onSaveTempo,
  onDismiss,
}: SetOptionsSheetProps) {
  const colors = useThemeColors();
  const [showTempoEditor, setShowTempoEditor] = useState(false);

  const handleOpenTempo = useCallback(() => {
    setShowTempoEditor(true);
  }, []);

  const handleSaveTempo = useCallback(
    (canonical: string | null) => {
      setShowTempoEditor(false);
      onSaveTempo(setId, canonical);
      onDismiss();
    },
    [setId, onSaveTempo, onDismiss]
  );

  const handleDismissTempo = useCallback(() => {
    setShowTempoEditor(false);
  }, []);

  if (showTempoEditor) {
    return (
      <TempoEditorSheet
        currentTempo={currentTempo}
        onSave={handleSaveTempo}
        onDismiss={handleDismissTempo}
      />
    );
  }

  const currentSetType = (() => {
    for (const g of groups) {
      for (const s of g.sets) {
        if (s.id === setId) return s.set_type;
      }
    }
    return "normal" as SetType;
  })();

  // Determine if this set is duration-mode (tempo chip hidden for duration sets per AC1.6/AC8)
  const isDurationSet = (() => {
    for (const g of groups) {
      for (const s of g.sets) {
        if (s.id === setId) return g.trackingMode === "duration";
      }
    }
    return false;
  })();

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.overlay]}
      onPress={onDismiss}
    >
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* ── Set Type section ── */}
        <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
          Set Type
        </Text>
        {SET_TYPE_CYCLE.map((type) => {
          const label = SET_TYPE_LABELS[type];
          const isSelected = currentSetType === type;
          return (
            <Pressable
              key={type}
              style={[
                styles.option,
                { backgroundColor: isSelected ? colors.primaryContainer : "transparent" },
              ]}
              onPress={() => { onSelectType(type); onDismiss(); }}
              accessibilityRole="button"
              accessibilityLabel={`${label.label} set`}
              accessibilityState={{ selected: isSelected }}
            >
              {label.short ? (
                <View
                  style={[
                    styles.chipPreview,
                    {
                      backgroundColor:
                        type === "warmup"
                          ? colors.surfaceVariant
                          : type === "dropset"
                          ? colors.tertiaryContainer
                          : type === "failure"
                          ? colors.errorContainer
                          : colors.surfaceDisabled,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: fontSizes.sm,
                      fontWeight: "700",
                      color:
                        type === "warmup"
                          ? colors.onSurfaceVariant
                          : type === "dropset"
                          ? colors.onTertiaryContainer
                          : colors.onErrorContainer,
                    }}
                  >
                    {label.short}
                  </Text>
                </View>
              ) : (
                <View style={[styles.chipPreview, { backgroundColor: colors.surfaceDisabled }]}>
                  <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: colors.onSurface }}>
                    —
                  </Text>
                </View>
              )}
              <Text variant="body" style={{ color: colors.onSurface, marginLeft: 12 }}>
                {label.label}
              </Text>
            </Pressable>
          );
        })}

        {/* ── Tempo row (hidden for duration-mode sets per AC1.6 / AC8) ── */}
        {!isDurationSet ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
            <Pressable
              style={styles.option}
              onPress={handleOpenTempo}
              accessibilityRole="button"
              accessibilityLabel={
                currentTempo
                  ? `Tempo: ${currentTempo}. Double tap to edit.`
                  : "Set tempo. Double tap to open editor."
              }
            >
              <View style={[styles.chipPreview, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: colors.onSurfaceVariant }}>
                  ♩
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="body" style={{ color: colors.onSurface }}>
                  Tempo
                </Text>
                {currentTempo ? (
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
                  >
                    {currentTempo}
                  </Text>
                ) : (
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
                  >
                    None
                  </Text>
                )}
              </View>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm }}>›</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  chipPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
    marginHorizontal: 12,
  },
});
