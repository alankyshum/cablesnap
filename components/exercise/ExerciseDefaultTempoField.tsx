import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { canonicalizeTempo } from "../../lib/workout/tempo-coach";
import { TempoEditorSheet } from "../session/TempoEditorSheet";
import { t } from "@lingui/core/macro";

type Props = {
  exerciseId: string;
  currentTempo: string | null | undefined;
  onSave: (canonical: string | null) => Promise<void> | void;
};

/**
 * BLD-1158: Exercise-level default tempo field.
 *
 * Renders in the Exercise detail/edit screen (primary discoverability path
 * per plan §UX). Shows the current default tempo and opens TempoEditorSheet
 * on tap. Calls `onSave(canonical)` on save (null = clear the default).
 *
 * Uses the same TempoEditorSheet as the per-set SetOptionsSheet tempo row
 * (single implementation, two entry points).
 */
export function ExerciseDefaultTempoField({ currentTempo, onSave }: Props) {
  const colors = useThemeColors();
  const [showEditor, setShowEditor] = useState(false);

  const handleOpen = useCallback(() => setShowEditor(true), []);
  const handleDismiss = useCallback(() => setShowEditor(false), []);

  const handleSave = useCallback(
    async (canonical: string | null) => {
      setShowEditor(false);
      const validated = canonical ? (canonicalizeTempo(canonical) ?? null) : null;
      await onSave(validated);
    },
    [onSave]
  );

  const displayTempo = currentTempo ? canonicalizeTempo(currentTempo) ?? currentTempo : null;

  return (
    <>
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontWeight: "600" }}>
            Default Tempo
          </Text>
          {displayTempo ? (
            <View style={[styles.chip, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: colors.onSurfaceVariant }}>
                ♩ {displayTempo}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}
        >
          {displayTempo
            ? t({ id: "components.exercise.default-tempo.inherit", message: "New sets inherit this tempo. You can override per set." })
            : t({ id: "components.exercise.default-tempo.rep-inherit", message: "New rep-mode sets will inherit a default tempo if set." })}
        </Text>
        <Button
          variant="outline"
          size="sm"
          onPress={handleOpen}
          accessibilityLabel={
            displayTempo ? t({ id: "components.exercise.default-tempo.edit-a11y", message: `Edit default tempo: ${displayTempo}` }) : t({ id: "components.exercise.default-tempo.set-a11y", message: "Set default tempo" })
          }
          style={{ alignSelf: "flex-start" }}
        >
          <Text style={{ color: colors.onSurface }}>
            {displayTempo ? t({ id: "components.exercise.default-tempo.edit", message: `Edit tempo: ${displayTempo}` }) : t({ id: "components.exercise.default-tempo.set", message: "Set default tempo" })}
          </Text>
        </Button>
      </View>

      {showEditor ? (
        <TempoEditorSheet
          currentTempo={currentTempo}
          onSave={handleSave}
          onDismiss={handleDismiss}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
});
