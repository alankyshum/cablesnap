import { useCallback, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import InlineFoodSearch from '../../components/InlineFoodSearch';
import SaveAsTemplateSheet from '../../components/SaveAsTemplateSheet';
import { useLayout } from '../../lib/layout';
import { useFloatingTabBarHeight } from '../../components/FloatingTabBar';
import { FoodLogCard } from '../../components/nutrition/FoodLogCard';
import { NutritionListHeader } from '../../components/nutrition/NutritionListHeader';
import { MealSectionHeader } from '../../components/nutrition/MealSectionHeader';
import { MacroTargetsSheet } from '../../components/nutrition/MacroTargetsSheet';
import { MealTemplatesSheet } from '../../components/nutrition/MealTemplatesSheet';
import { WaterAmountSheet } from '../../components/nutrition/WaterAmountSheet';
import { MacroCoachCard } from '../../components/nutrition/MacroCoachCard';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useNutritionData } from '@/hooks/useNutritionData';
import { useMacroCoach } from '@/hooks/useMacroCoach';

/** Returns a human-readable week label like "May 4–10" based on the most recent Sunday. */
function getWeekLabel(now: Date): string {
  const day = now.getDay(); // 0=Sun
  const sunday = new Date(now.getTime() - day * 86_400_000);
  const saturday = new Date(sunday.getTime() + 6 * 86_400_000);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = sunday.toLocaleDateString('en-US', opts);
  const end = saturday.toLocaleDateString('en-US', { day: 'numeric' });
  return `${start}–${end}`;
}

export default function Nutrition() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const {
    date,
    dateKey,
    summary,
    targets,
    addSheetVisible,
    setAddSheetVisible,
    templateSheet,
    setTemplateSheet,
    sections,
    prev,
    next,
    remove,
    load,
    handleSnack,
    waterTotalMl,
    waterGoalMl,
    waterUnit,
    waterPresetsMl,
    addWater,
    trainingDayAdjustment,
  } = useNutritionData();

  const coach = useMacroCoach();
  const weekLabel = getWeekLabel(new Date());

  const showCoachCard =
    (coach.status === 'ready' || coach.status === 'info_only') &&
    coach.suggestion !== undefined &&
    coach.safetyFloorKcal !== undefined &&
    coach.userWeightKg !== undefined;

  const [targetsVisible, setTargetsVisible] = useState(false);
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [waterSheetVisible, setWaterSheetVisible] = useState(false);

  const handleFoodLogged = useCallback(() => {
    load();
  }, [load]);

  return (
    <View testID="nutrition-screen-container" style={[styles.container, { backgroundColor: colors.background }]}>
      <SectionList
        testID="nutrition-scroll-view"
        sections={sections}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: layout.horizontalPadding, paddingBottom: tabBarHeight + 16 },
        ]}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <MealSectionHeader
            section={section}
            colors={colors}
            onSaveAsTemplate={(m, data) =>
              setTemplateSheet({ visible: true, meal: m, items: data })
            }
          />
        )}
        renderItem={({ item }) => <FoodLogCard item={item} colors={colors} onRemove={remove} />}
        SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListHeaderComponent={
          <>
            <NutritionListHeader
              date={date}
              summary={summary}
              targets={targets}
              waterTotalMl={waterTotalMl}
              waterGoalMl={waterGoalMl}
              waterUnit={waterUnit}
              waterPresetsMl={waterPresetsMl}
              colors={colors}
              onPrev={prev}
              onNext={next}
              onEditTargets={() => setTargetsVisible(true)}
              onMealTemplates={() => setTemplatesVisible(true)}
              onWaterPreset={(amt) => addWater(amt)}
              onWaterCustom={() => setWaterSheetVisible(true)}
              trainingDayAdjustment={trainingDayAdjustment ?? undefined}
            />
            {showCoachCard && (
              <MacroCoachCard
                suggestion={coach.suggestion!}
                infoOnly={coach.status === 'info_only'}
                weekLabel={weekLabel}
                safetyFloorKcal={coach.safetyFloorKcal!}
                userWeightKg={coach.userWeightKg!}
                lastAcceptedDate={coach.lastAccepted?.dateIso}
                lastAcceptedTarget={coach.lastAccepted?.targetKcal}
                onDismiss={coach.refetch}
              />
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: 'center' }}>
              No food logged yet.{'\n'}Tap + to add your first meal.
            </Text>
          </View>
        }
      />

      <BottomSheet
        isVisible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        snapPoints={[0.7, 0.9]}
        title="Add Food"
        // disablePanGesture: the Add Food sheet hosts a long, keyboard-heavy
        // manual-entry form (ManualFoodEntry). The default drag-to-dismiss
        // Gesture.Pan() wraps the body and intercepts every vertical drag,
        // moving the sheet instead of scrolling its inner ScrollView — which
        // made the macro inputs / "Log Food" button unreachable for both users
        // mid-typing and the e2e flow (BLD-1793: add-food never scrolled to the
        // submit button across 20 runs). Disabling the pan gesture renders a
        // plain, scrollable ScrollView; the sheet is still dismissable via the
        // backdrop tap and the in-form Cancel button.
        disablePanGesture
      >
        <InlineFoodSearch dateKey={dateKey} onFoodLogged={handleFoodLogged} onSnack={handleSnack} />
      </BottomSheet>
      <SaveAsTemplateSheet
        visible={templateSheet.visible}
        onClose={() => setTemplateSheet((s) => ({ ...s, visible: false }))}
        meal={templateSheet.meal}
        items={templateSheet.items}
        onSaved={load}
      />
      <MacroTargetsSheet
        visible={targetsVisible}
        onClose={() => {
          setTargetsVisible(false);
          load();
        }}
      />
      <MealTemplatesSheet
        visible={templatesVisible}
        onClose={() => setTemplatesVisible(false)}
        onLogged={load}
      />
      <WaterAmountSheet
        visible={waterSheetVisible}
        onClose={() => setWaterSheetVisible(false)}
        unit={waterUnit}
        onSubmit={addWater}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 64 },
});
