import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getFavoriteFoods } from "../lib/db";
import type { FoodEntry } from "../lib/types";

type Props = {
  saving: boolean;
  onSave: (
    name: string, calories: number, protein: number, carbs: number, fat: number,
    serving: string, favorite: boolean,
  ) => Promise<boolean>;
  onFavoritesChanged: (favs: FoodEntry[]) => void;
};

export default function ManualFoodEntry({ saving, onSave, onFavoritesChanged }: Props) {
  const colors = useThemeColors();
  const sheetRef = useRef<BottomSheet>(null);

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [serving, setServing] = useState("1 serving");
  const [favorite, setFavorite] = useState(false);

  const reset = () => {
    setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat("");
    setServing("1 serving"); setFavorite(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const ok = await onSave(
      name.trim(),
      Math.max(0, parseFloat(calories) || 0),
      Math.max(0, parseFloat(protein) || 0),
      Math.max(0, parseFloat(carbs) || 0),
      Math.max(0, parseFloat(fat) || 0),
      serving.trim() || "1 serving",
      favorite,
    );
    if (ok) {
      reset();
      sheetRef.current?.close();
      getFavoriteFoods().then(onFavoritesChanged).catch(() => {});
    }
  };

  const open = useCallback(() => sheetRef.current?.expand(), []);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  return (
    <>
      <Button
        variant="outline"
        onPress={open}
        style={styles.actionBtn}
        accessibilityLabel="Manual entry"
      >
        Manual Entry
      </Button>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={["70%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={reset}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
      >
        <BottomSheetView style={styles.sheetContent} accessibilityViewIsModal>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
            Manual Food Entry
          </Text>
          <Input
            label="Food name" value={name} onChangeText={setName}
            variant="outline" containerStyle={styles.sheetInput}
          />
          <Input
            label="Calories" value={calories} onChangeText={setCalories}
            keyboardType="numeric" variant="outline" containerStyle={styles.sheetInput}
          />
          <View style={styles.macroRow}>
            <Input
              label="Protein (g)" value={protein} onChangeText={setProtein}
              keyboardType="numeric" variant="outline"
              containerStyle={StyleSheet.flatten([styles.sheetInput, styles.flex])}
            />
            <View style={{ width: 8 }} />
            <Input
              label="Carbs (g)" value={carbs} onChangeText={setCarbs}
              keyboardType="numeric" variant="outline"
              containerStyle={StyleSheet.flatten([styles.sheetInput, styles.flex])}
            />
            <View style={{ width: 8 }} />
            <Input
              label="Fat (g)" value={fat} onChangeText={setFat}
              keyboardType="numeric" variant="outline"
              containerStyle={StyleSheet.flatten([styles.sheetInput, styles.flex])}
            />
          </View>
          <Input
            label="Serving size" value={serving} onChangeText={setServing}
            variant="outline" containerStyle={styles.sheetInput}
          />
          <Chip
            selected={favorite}
            onPress={() => setFavorite(!favorite)}
            style={styles.sheetFavChip}
            accessibilityLabel={favorite ? "Remove manual entry from favorites" : "Save manual entry as favorite"}
            role="button"
            accessibilityState={{ selected: favorite }}
          >
            Save as favorite
          </Chip>
          <Button
            variant="default"
            onPress={handleSave}
            loading={saving}
            disabled={saving || !name.trim()}
            accessibilityLabel="Log manual entry"
          >
            Log Food
          </Button>
        </BottomSheetView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheetInput: {
    marginBottom: 8,
  },
  macroRow: {
    flexDirection: "row",
  },
  flex: {
    flex: 1,
  },
  sheetFavChip: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
});
