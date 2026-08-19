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
import { t } from "@/lib/i18n";

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
      <Button variant="outline" onPress={toggle} style={styles.actionBtn} accessibilityLabel={expanded ? t({ id: "components.manualFood.closeA11y", message: "Close manual entry" }) : t({ id: "components.manualFood.openA11y", message: "Manual entry" })}>
        {expanded ? t({ id: "common.cancel", message: "Cancel" }) : t({ id: "components.manualFood.open", message: "Manual Entry" })}
      </Button>
      {expanded && (
        <View style={styles.formContent}>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>{t({ id: "components.manualFood.title", message: "Manual Food Entry" })}</Text>
          <Input
            label={t({ id: "components.manualFood.foodName", message: "Food name" })}
            value={name}
            onChangeText={setName}
            variant="outline"
            containerStyle={styles.formInput}
            testID="food-name-input"
          />
          <Input
            label={t({ id: "components.manualFood.calories", message: "Calories" })}
            value={calories}
            onChangeText={setCalories}
            keyboardType="numeric"
            variant="outline"
            containerStyle={styles.formInput}
            testID="food-calories-input"
          />
          <MacroInputRow
            protein={protein}
            carbs={carbs}
            fat={fat}
            onProteinChange={setProtein}
            onCarbsChange={setCarbs}
            onFatChange={setFat}
          />
          <Input
            label={t({ id: "components.manualFood.servingSize", message: "Serving size" })}
            value={serving}
            onChangeText={setServing}
            variant="outline"
            containerStyle={styles.formInput}
            testID="food-serving-input"
          />
          <Chip
            selected={favorite}
            onPress={() => setFavorite(!favorite)}
            style={styles.favChip}
             accessibilityLabel={favorite ? t({ id: "components.manualFood.removeFavoriteA11y", message: "Remove manual entry from favorites" }) : t({ id: "components.manualFood.saveFavoriteA11y", message: "Save manual entry as favorite" })}
            role="button"
            accessibilityState={{ selected: favorite }}
          >
            {t({ id: "components.manualFood.saveFavorite", message: "Save as favorite" })}
          </Chip>
          {/* Log Food button is rendered last in the form. The BottomSheet ScrollView
              is now correctly bounded to the visible sheet height (BLD-1819 fix in
              bottom-sheet.tsx), so scrollUntilVisible will bring this button into
              view before Maestro taps it. testID="log-food-button" is the stable
              e2e selector (accessibilityLabel "Log manual entry" shadows the visible
              text in UIAutomator2). */}
          <Button
            variant="default"
            onPress={handleSave}
            loading={saving}
            disabled={saving || !name.trim()}
             accessibilityLabel={t({ id: "components.manualFood.logA11y", message: "Log manual entry" })}
            testID="log-food-button"
          >
            {t({ id: "components.manualFood.log", message: "Log Food" })}
          </Button>
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
