import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import * as Haptics from "expo-haptics";
import type { SetWithMeta } from "./types";
import type { Suggestion } from "../../lib/rm";

export type SuggestionChipProps = {
  suggestion: Suggestion;
  sets: SetWithMeta[];
  step: number;
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void;
  colors: {
    primaryContainer: string;
    surfaceVariant: string;
    onPrimaryContainer: string;
    onSurfaceVariant: string;
  };
};

export function SuggestionChip({ suggestion, sets, step, onUpdate, colors }: SuggestionChipProps) {
  const s = suggestion;
  const isIncrease = s.type === "increase" || s.type === "rep_increase";
  const label = s.type === "rep_increase"
    ? `${s.reps} reps ▲`
    : s.type === "increase"
      ? `${s.weight} ▲`
      : `${s.weight} =`;
  const hint = s.type === "rep_increase"
    ? `Suggested reps: ${s.reps}, ${s.reason}`
    : s.type === "increase"
      ? `Suggested weight: ${s.weight}, increase by ${step}`
      : `Suggested weight: ${s.weight}, maintain`;

  return (
    <Pressable
      onPress={() => {
        if (s.type === "rep_increase") {
          for (const set of sets) {
            if (!set.completed && (set.reps == null || set.reps === 0)) {
              onUpdate(set.id, "reps", String(s.reps));
            }
          }
        } else {
          for (const set of sets) {
            if (!set.completed && (set.weight == null || set.weight === 0)) {
              onUpdate(set.id, "weight", String(s.weight));
            }
          }
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      style={[
        styles.suggestionChip,
        { backgroundColor: isIncrease ? colors.primaryContainer : colors.surfaceVariant },
      ]}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityHint={s.type === "rep_increase" ? "Double tap to fill suggested reps" : "Double tap to fill suggested weight"}
    >
      <Text
        variant="caption"
        style={{
          color: isIncrease ? colors.onPrimaryContainer : colors.onSurfaceVariant,
          fontWeight: "600",
        }}
      >
        Suggested: {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginLeft: 4,
    marginBottom: 6,
    minHeight: 48,
    justifyContent: "center",
  },
});
