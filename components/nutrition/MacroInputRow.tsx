import React from "react";
import { StyleSheet, View } from "react-native";
import { Input } from "@/components/ui/input";

type Props = {
  protein: string;
  carbs: string;
  fat: string;
  onProteinChange: (v: string) => void;
  onCarbsChange: (v: string) => void;
  onFatChange: (v: string) => void;
};

export function MacroInputRow({ protein, carbs, fat, onProteinChange, onCarbsChange, onFatChange }: Props) {
  return (
    <View style={styles.row}>
      <Input
        label="Protein (g)" value={protein} onChangeText={onProteinChange}
        keyboardType="numeric" variant="outline"
        containerStyle={StyleSheet.flatten([styles.input, styles.flex])}
      />
      <View style={{ width: 8 }} />
      <Input
        label="Carbs (g)" value={carbs} onChangeText={onCarbsChange}
        keyboardType="numeric" variant="outline"
        containerStyle={StyleSheet.flatten([styles.input, styles.flex])}
      />
      <View style={{ width: 8 }} />
      <Input
        label="Fat (g)" value={fat} onChangeText={onFatChange}
        keyboardType="numeric" variant="outline"
        containerStyle={StyleSheet.flatten([styles.input, styles.flex])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  input: { marginBottom: 8 },
  flex: { flex: 1 },
});
