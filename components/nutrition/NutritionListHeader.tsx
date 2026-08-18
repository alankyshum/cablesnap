import { StyleSheet, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import type { MacroTargets } from '@/lib/types';
import { todayKey, formatDateKey } from '@/lib/format';
import type { HydrationUnit } from '@/lib/hydration-units';
import { MacroRow } from './MacroRow';
import { WaterSection } from './WaterSection';
import type { DayType } from '@/lib/training-day-macros';

/**
 * PROHIBITION (AC16/C1): No "earn/earned/bonus/reward/treat/deserve/penalty/punish/
 *   unlock/spend/burn it off/work it off/guilt/cheat" copy in this file.
 * No directional color tokens (red/green/surplus/deficit) on calorie numbers.
 */

// ─── Binding copy strings (psychologist C2 verbatim badge tap — AC14) ─────────
// DO NOT modify these strings without psychologist sign-off.
// Exported so the module-level lexeme-ban grep test (AC16) can import directly.

export const BADGE_COPY = {
  trainingDayLabel: 'Training day · fueled',
  trainingDayLabelMinimal: 'Training day',
  restDayLabel: 'Rest day · recovery',
  restDayLabelMinimal: 'Rest day',
  trainingDayTap: 'Higher target today because you trained — extra fuel for recovery. Your weekly average is unchanged.',
  restDayTap: 'Recovery day — a bit lower to balance your training days. Your weekly average is unchanged.',
} as const;

const DAY_MS = 86_400_000;

function dateLabel(d: Date): string {
  const today = todayKey();
  const yesterday = formatDateKey(Date.now() - DAY_MS);
  const ds = formatDateKey(d.getTime());
  if (ds === today) return 'Today';
  if (ds === yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type Props = {
  date: Date;
  summary: { calories: number; protein: number; carbs: number; fat: number };
  targets: MacroTargets | null;
  waterTotalMl: number;
  waterGoalMl: number;
  waterUnit: HydrationUnit;
  waterPresetsMl: [number, number, number];
  colors: {
    primary: string;
    primaryTextOnSurface: string;
    onSurface: string;
    onSurfaceVariant: string;
    onBackground: string;
    surface: string;
  };
  onPrev: () => void;
  onNext: () => void;
  onEditTargets: () => void;
  onMealTemplates: () => void;
  onWaterPreset: (amountMl: number) => void;
  onWaterCustom: () => void;
  /**
   * Training-Day Macro Adjustment: if set, the targets prop already reflects
   * the effective per-day target (computed by computeEffectiveTargets).
   * The badge shows the day type and a tap explanation.
   * AC21 (QD3): baseCals is shown alongside the effective target.
   * AC18/C4: when pendingNote is set, the day is TODAY before a workout is logged —
   *   targets are BASE (not lowered), badge renders as neutral/pending state.
   */
  trainingDayAdjustment?: {
    /** Classified day type — training or rest. */
    dayType: DayType;
    /** Base (weekly-average) calorie target from macro_targets singleton. */
    baseCals: number;
    /** Whether the feature is active and targets differ from base. */
    adjusted: boolean;
    /** Whether the rest-day target was clamped by the calorie floor. */
    cappedByFloor: boolean;
    /** Compact label mode (for small screens). Default: false → full label */
    compact?: boolean;
    /**
     * C4 / AC18: Set to the verbatim "Fuel updates once you log today's session"
     * string when TODAY + no qualifying workout is logged yet.
     * When set, targets are BASE and the badge renders as neutral/pending.
     */
    pendingNote?: string;
  };
};

export function NutritionListHeader({
  date,
  summary,
  targets,
  waterTotalMl,
  waterGoalMl,
  waterUnit,
  waterPresetsMl,
  colors,
  onPrev,
  onNext,
  onEditTargets,
  onMealTemplates,
  onWaterPreset,
  onWaterCustom,
  trainingDayAdjustment,
}: Props) {
  const adj = trainingDayAdjustment;
  const showBadge = adj?.adjusted === true;
  const showPendingNote = adj?.pendingNote != null;

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onPrev}
          accessibilityLabel="Previous day"
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text variant="title" style={{ color: colors.onBackground }}>
          {dateLabel(date)}
        </Text>
        <TouchableOpacity
          onPress={onNext}
          accessibilityLabel="Next day"
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>
      {targets && (
        <Card style={[styles.card, { backgroundColor: colors.surface }]}>
          <CardContent>
            {/* Day-type badge (AC13, AC14, AC16, AC17, AC21) */}
            {showBadge && adj && (
              <DayTypeBadge
                dayType={adj.dayType}
                baseCals={adj.baseCals}
                effectiveCals={targets.calories}
                cappedByFloor={adj.cappedByFloor}
                compact={adj.compact}
                colors={colors}
              />
            )}
            {/* AC18/C4: today-before-workout pending note — neutral state, not lowered target */}
            {showPendingNote && adj?.pendingNote && (
              <PendingNote
                note={adj.pendingNote}
                colors={colors}
              />
            )}
            <MacroRow
              label="Calories"
              value={summary.calories}
              target={targets.calories}
              colors={colors}
            />
            <MacroRow
              label="Protein"
              value={summary.protein}
              target={targets.protein}
              unit="g"
              colors={colors}
            />
            <MacroRow
              label="Carbs"
              value={summary.carbs}
              target={targets.carbs}
              unit="g"
              colors={colors}
            />
            <MacroRow
              label="Fat"
              value={summary.fat}
              target={targets.fat}
              unit="g"
              colors={colors}
            />
            <WaterSection
              totalMl={waterTotalMl}
              goalMl={waterGoalMl}
              unit={waterUnit}
              presetsMl={waterPresetsMl}
              colors={colors}
              onPresetPress={onWaterPreset}
              onCustomPress={onWaterCustom}
            />
            <TouchableOpacity
              onPress={onEditTargets}
              accessibilityLabel="Edit macro targets"
              accessibilityRole="link"
              style={styles.linkRow}
            >
              <Text variant="caption" style={{ color: colors.primary }}>
                Edit Targets
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={14} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onMealTemplates}
              accessibilityLabel="View meal templates"
              accessibilityRole="link"
              style={[styles.linkRow, { marginTop: 4 }]}
            >
              <Text variant="caption" style={{ color: colors.primary }}>
                Meal Templates
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={14} color={colors.primary} />
            </TouchableOpacity>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── DayTypeBadge ─────────────────────────────────────────────────────────────

/**
 * Neutral day-type badge rendered inside the nutrition card.
 *
 * AC13: accessibilityLabel describes both day type and calorie implication
 * AC14: uses C2 verbatim labels and tap strings
 * AC16: no directional color tokens; badge uses neutral surface color only
 * AC17: rest day renders as a neutral, complete state (not a penalty)
 * AC21 (QD3): shows Base: N alongside effective target
 */
function DayTypeBadge({
  dayType,
  baseCals,
  effectiveCals,
  cappedByFloor,
  compact,
  colors,
}: {
  dayType: DayType;
  baseCals: number;
  effectiveCals: number;
  cappedByFloor: boolean;
  compact?: boolean;
  colors: Props['colors'];
}) {
  const isTraining = dayType === 'training';
  const label = compact
    ? (isTraining ? BADGE_COPY.trainingDayLabelMinimal : BADGE_COPY.restDayLabelMinimal)
    : (isTraining ? BADGE_COPY.trainingDayLabel : BADGE_COPY.restDayLabel);
  const tapCopy = isTraining ? BADGE_COPY.trainingDayTap : BADGE_COPY.restDayTap;

  // AC13: descriptive accessibility label
  const a11yLabel = isTraining
    ? `Training day — calorie target increased to ${effectiveCals} kcal; weekly average unchanged`
    : `Recovery day — calorie target adjusted to ${effectiveCals} kcal; weekly average unchanged`;

  return (
    <TouchableOpacity
      style={[styles.badge, { backgroundColor: colors.onSurface + '10', borderColor: colors.onSurfaceVariant + '40' }]}
      onPress={() => {/* tap shows modal/sheet — AC14 tap copy is accessible via accessibilityHint */}}
      accessibilityLabel={a11yLabel}
      accessibilityHint={tapCopy}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text variant="caption" style={{ color: colors.onSurface, fontWeight: '500' }}>
        {label}
      </Text>
      {/* AC21 (QD3): base calories visible alongside effective */}
      {effectiveCals !== baseCals && (
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>
          {cappedByFloor ? `Base: ${baseCals} kcal (capped)` : `Base: ${baseCals} kcal`}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── PendingNote ─────────────────────────────────────────────────────────────

/**
 * AC18/C4: Renders the neutral "pending" note when today's workout hasn't been logged.
 * Targets remain at BASE — this note signals that fueling will update once trained.
 *
 * PROHIBITION (AC16/C1): No reward/penalty lexemes. No directional color tokens.
 */
function PendingNote({
  note,
  colors,
}: {
  note: string;
  colors: Props['colors'];
}) {
  return (
    <View
      style={[styles.pendingNote, { backgroundColor: colors.onSurface + '08', borderColor: colors.onSurfaceVariant + '30' }]}
      accessibilityLabel={note}
      accessibilityRole="text"
    >
      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  card: { marginBottom: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  pendingNote: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 44,
    paddingVertical: 8,
    marginHorizontal: -8,
    paddingHorizontal: 16,
  },
});
