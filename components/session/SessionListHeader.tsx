import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  nextHint: string | null;
  gymName?: string | null;
  colors: ThemeColors;
  notesText: string;
  onNotesChange: (text: string) => void;
  onNotesSave: () => void;
};

export function SessionListHeader({ nextHint, gymName, colors, notesText, onNotesChange, onNotesSave }: Props) {
  return (
    <>
      {gymName ? (
        <View style={[styles.gymChip, { backgroundColor: colors.secondaryContainer }]}>
          <Text variant="caption" style={{ color: colors.onSecondaryContainer, fontWeight: "700" }}>
            {gymName}
          </Text>
        </View>
      ) : null}
      {nextHint && (
        <View style={[styles.nextBanner, { backgroundColor: colors.secondaryContainer }]} accessibilityLiveRegion="polite">
          <Text variant="subtitle" style={{ color: colors.onSecondaryContainer, fontWeight: "700" }}>
            {nextHint}
          </Text>
        </View>
      )}
      <View style={[styles.notesCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
        <View style={styles.notesHeader}>
          <Text variant="subtitle" style={{ color: colors.onSurface, fontWeight: "700" }}>Session notes</Text>
        </View>
        <Input
          type="textarea"
          variant="outline"
          rows={3}
          placeholder="Add notes about this workout..."
          value={notesText}
          onChangeText={onNotesChange}
          onBlur={onNotesSave}
          maxLength={500}
          inputStyle={{ fontSize: fontSizes.base, color: colors.onSurface }}
          accessibilityLabel="Workout note for this session"
        />
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4 }}>
          {notesText.length}/500
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  gymChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  nextBanner: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  notesCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
});
