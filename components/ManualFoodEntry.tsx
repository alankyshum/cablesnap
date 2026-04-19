import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/hooks/useThemeColors";
import { MacroInputRow } from "./nutrition/MacroInputRow";
import { useManualFoodForm } from "@/hooks/useManualFoodForm";
import type { FoodEntry } from "../lib/types";

type Props = {
  saving: boolean;
  onSave: (name: string, cal: number, pro: number, carbs: number, fat: number, serving: string, fav: boolean) => Promise<boolean>;
  onFavoritesChanged: (favs: FoodEntry[]) => void;
};

export default function ManualFoodEntry({ saving, onSave, onFavoritesChanged }: Props) {
  const colors = useThemeColors();
  const { expanded, name, setName, calories, setCalories, protein, setProtein, carbs, setCarbs, fat, setFat, serving, setServing, favorite, setFavorite, handleSave, toggle } = useManualFoodForm(onSave, onFavoritesChanged);

  return (
    <View style={styles.container}>
      <Button variant="outline" onPress={toggle} style={styles.actionBtn} accessibilityLabel={expanded ? "Close manual entry" : "Manual entry"}>
        {expanded ? "Cancel" : "Manual Entry"}
      </Button>
      {expanded && (
        <View style={styles.formContent}>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>Manual Food Entry</Text>
          <Input label="Food name" value={name} onChangeText={setName} variant="outline" containerStyle={styles.formInput} />
          <Input label="Calories" value={calories} onChangeText={setCalories} keyboardType="numeric" variant="outline" containerStyle={styles.formInput} />
          <MacroInputRow protein={protein} carbs={carbs} fat={fat} onProteinChange={setProtein} onCarbsChange={setCarbs} onFatChange={setFat} />
          <Input label="Serving size" value={serving} onChangeText={setServing} variant="outline" containerStyle={styles.formInput} />
          <Chip selected={favorite} onPress={() => setFavorite(!favorite)} style={styles.favChip} accessibilityLabel={favorite ? "Remove manual entry from favorites" : "Save manual entry as favorite"} role="button" accessibilityState={{ selected: favorite }}>
            Save as favorite
          </Chip>
          <Button variant="default" onPress={handleSave} loading={saving} disabled={saving || !name.trim()} accessibilityLabel="Log manual entry">Log Food</Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionBtn: { flex: 1 },
  formContent: { marginTop: 12 },
  formInput: { marginBottom: 8 },
  favChip: { alignSelf: "flex-start", marginBottom: 12 },
});
