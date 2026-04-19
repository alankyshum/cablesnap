import { useCallback, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import InlineFoodSearch from "../../components/InlineFoodSearch";
import SaveAsTemplateSheet from "../../components/SaveAsTemplateSheet";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { FoodLogCard } from "../../components/nutrition/FoodLogCard";
import { NutritionListHeader } from "../../components/nutrition/NutritionListHeader";
import { MealSectionHeader } from "../../components/nutrition/MealSectionHeader";
import { MacroTargetsSheet } from "../../components/nutrition/MacroTargetsSheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useNutritionData } from "@/hooks/useNutritionData";

export default function Nutrition() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const {
    date, dateKey, summary, targets,
    addSheetVisible, setAddSheetVisible,
    templateSheet, setTemplateSheet,
    sections, prev, next, remove, load, handleSnack,
  } = useNutritionData();

  const [targetsVisible, setTargetsVisible] = useState(false);

  const handleFoodLogged = useCallback(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.horizontalPadding, paddingBottom: tabBarHeight + 16 }]}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <MealSectionHeader section={section} colors={colors} onSaveAsTemplate={(m, data) => setTemplateSheet({ visible: true, meal: m, items: data })} />
        )}
        renderItem={({ item }) => <FoodLogCard item={item} colors={colors} onRemove={remove} />}
        SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListHeaderComponent={<NutritionListHeader date={date} summary={summary} targets={targets} colors={colors} onPrev={prev} onNext={next} onEditTargets={() => setTargetsVisible(true)} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
              No food logged yet.{"\n"}Tap + to add your first meal.
            </Text>
          </View>
        }
      />

      <BottomSheet isVisible={addSheetVisible} onClose={() => setAddSheetVisible(false)} snapPoints={[0.7, 0.9]} title="Add Food">
        <InlineFoodSearch dateKey={dateKey} onFoodLogged={handleFoodLogged} onSnack={handleSnack} />
      </BottomSheet>
      <SaveAsTemplateSheet
        visible={templateSheet.visible}
        onClose={() => setTemplateSheet((s) => ({ ...s, visible: false }))}
        meal={templateSheet.meal}
        items={templateSheet.items}
        onSaved={load}
      />
      <MacroTargetsSheet visible={targetsVisible} onClose={() => { setTargetsVisible(false); load(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 64 },
});
