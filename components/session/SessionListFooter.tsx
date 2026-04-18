import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  onAddExercise: () => void;
  onFinish: () => void;
  onCancel: () => void;
  colors: ThemeColors;
};

export function SessionListFooter({ onAddExercise, onFinish, onCancel, colors }: Props) {
  return (
    <>
      <Button
        variant="outline"
        onPress={onAddExercise}
        style={styles.addExercise}
        accessibilityLabel="Add exercise to workout"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Add Exercise</Text>
        </View>
      </Button>
      <Button
        variant="default"
        onPress={onFinish}
        style={styles.finishBtn}
        accessibilityLabel="Finish workout"
        label="Finish Workout"
      />
      <Button
        variant="ghost"
        onPress={onCancel}
        textStyle={{ color: colors.error }}
        style={styles.cancelBtn}
        accessibilityLabel="Cancel workout"
        label="Cancel Workout"
      />
    </>
  );
}

const styles = StyleSheet.create({
  addExercise: {
    marginTop: 8,
  },
  finishBtn: {
    marginTop: 24,
  },
  cancelBtn: {
    marginTop: 8,
  },
});
