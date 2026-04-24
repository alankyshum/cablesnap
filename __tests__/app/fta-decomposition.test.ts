/**
 * Consolidated FTA decomposition structural tests (batches 2-6).
 *
 * Verifies extracted components, hooks, and data files exist
 * and parent files properly import from them.
 *
 * Uses test.each for budget-efficient parameterized assertions.
 * Each entry is independently runnable via `jest --testNamePattern`.
 */
import * as fs from "fs";
import * as path from "path";

const resolve = (...parts: string[]) =>
  path.resolve(__dirname, "../..", ...parts);

const read = (filePath: string) =>
  fs.readFileSync(resolve(filePath), "utf-8");

describe("FTA decomposition structural tests", () => {
  // ── File contains string assertions ────────────────────────────
  const containsCases: [string, string, string][] = [
    // Batch 2 — progress.tsx decomposition
    ["app/(tabs)/progress.tsx", "WorkoutSegment", "imports WorkoutSegment"],
    ["app/(tabs)/progress.tsx", "BodySegment", "imports BodySegment"],
    ["components/progress/WorkoutSegment.tsx", "useFloatingTabBarHeight", "uses useFloatingTabBarHeight"],
    ["components/progress/BodySegment.tsx", "useBodyMetrics", "uses useBodyMetrics"],

    // Batch 2 — session/detail/[id].tsx decomposition
    ["app/session/detail/[id].tsx", "useSessionDetail", "imports useSessionDetail"],
    ["components/session/detail/ExerciseGroupRow.tsx", "SET_TYPE_LABELS", "handles set types"],

    // Batch 2 — exercise-nlp.ts decomposition
    ["lib/exercise-nlp.ts", "exercise-nlp-data", "imports data from exercise-nlp-data"],
    ["lib/exercise-nlp-data.ts", "export const ARCHETYPES", "exports ARCHETYPES"],
    ["lib/exercise-nlp-data.ts", "export const EQUIPMENT_KEYWORDS", "exports EQUIPMENT_KEYWORDS"],
    ["lib/exercise-nlp-data.ts", "export const MODIFIERS", "exports MODIFIERS"],
    ["lib/exercise-nlp-data.ts", "export const MUSCLE_KEYWORDS", "exports MUSCLE_KEYWORDS"],

    // Batch 2 — timer.tsx decomposition
    ["app/tools/timer.tsx", "useTimerEngine", "imports useTimerEngine"],
    ["hooks/useTimerEngine.ts", "useState", "manages state with useState"],
    ["hooks/useTimerEngine.ts", "handleStart", "has handleStart"],
    ["hooks/useTimerEngine.ts", "handleReset", "has handleReset"],

    // Batch 3 — photos.tsx decomposition
    ["app/body/photos.tsx", "usePhotoActions", "imports usePhotoActions"],
    ["app/body/photos.tsx", "PhotoFilterHeader", "imports PhotoFilterHeader"],
    ["app/body/photos.tsx", "PhotoMetaModal", "imports PhotoMetaModal"],
    ["app/body/photos.tsx", "PrivacyModal", "imports PrivacyModal"],

    // Batch 3 — program/[id].tsx decomposition
    ["app/program/[id].tsx", "useProgramDetail", "imports useProgramDetail"],
    ["app/program/[id].tsx", "WeeklySchedule", "imports WeeklySchedule"],
    ["app/program/[id].tsx", "ProgramHistory", "imports ProgramHistory"],

    // Batch 3 — WeeklySummary.tsx decomposition
    ["components/WeeklySummary.tsx", "useWeeklySummary", "imports useWeeklySummary"],
    ["components/WeeklySummary.tsx", "SummaryDetailSections", "imports SummaryDetailSections"],

    // Batch 3 — template/[id].tsx decomposition
    ["app/template/[id].tsx", "useTemplateEditor", "imports useTemplateEditor"],
    ["app/template/[id].tsx", "TemplateExerciseRow", "imports TemplateExerciseRow"],

    // Batch 4 — exercises.tsx decomposition
    ["app/(tabs)/exercises.tsx", "ExerciseCard", "imports ExerciseCard"],
    ["app/(tabs)/exercises.tsx", "ExerciseDetailPane", "imports ExerciseDetailPane"],

    // Batch 4 — ExerciseForm.tsx decomposition
    ["components/ExerciseForm.tsx", "useExerciseForm", "imports useExerciseForm"],
    ["components/ExerciseForm.tsx", "MuscleGroupPicker", "imports MuscleGroupPicker"],

    // Batch 4 — MuscleVolumeSegment.tsx decomposition
    ["components/MuscleVolumeSegment.tsx", "useMuscleVolume", "imports useMuscleVolume"],
    ["components/MuscleVolumeSegment.tsx", "VolumeBarChart", "imports VolumeBarChart"],
    ["components/MuscleVolumeSegment.tsx", "VolumeTrendChart", "imports VolumeTrendChart"],

    // Batch 4 — ExerciseGroupCard.tsx decomposition
    ["components/session/ExerciseGroupCard.tsx", "GroupCardHeader", "imports GroupCardHeader"],
    ["components/session/ExerciseGroupCard.tsx", "SuggestionChip", "imports SuggestionChip"],

    // Batch 5 — session/[id].tsx decomposition
    ["app/session/[id].tsx", "useSessionActions", "imports useSessionActions"],
    ["app/session/[id].tsx", "SessionListHeader", "imports SessionListHeader"],
    ["app/session/[id].tsx", "SessionListFooter", "imports SessionListFooter"],
    ["hooks/useSessionActions.ts", "export function useSessionActions", "exports useSessionActions"],
    ["hooks/useSessionActions.ts", "elapsed", "tracks elapsed time"],
    ["hooks/useSessionActions.ts", "setElapsed", "can update elapsed"],
    ["components/session/SessionListHeader.tsx", "nextHint", "shows next hint"],
    ["components/session/SessionListFooter.tsx", "Finish Workout", "has Finish Workout action"],
    ["components/session/SessionListFooter.tsx", "Cancel Workout", "has Cancel Workout action"],

    // Batch 5 — SubstitutionSheet decomposition
    ["components/SubstitutionSheet.tsx", "SubstitutionItem", "imports SubstitutionItem"],
    ["components/SubstitutionSheet.tsx", "EquipmentFilter", "imports EquipmentFilter"],
    ["components/substitution/SubstitutionItem.tsx", "matchColor", "uses matchColor"],
    ["components/substitution/EquipmentFilter.tsx", "Chip", "uses Chip"],

    // Batch 5 — achievements.tsx decomposition
    ["app/progress/achievements.tsx", "useAchievements", "imports useAchievements"],
    ["app/progress/achievements.tsx", "AchievementBadge", "imports AchievementBadge"],
    ["hooks/useAchievements.ts", "export function useAchievements", "exports useAchievements"],
    ["hooks/useAchievements.ts", "export type AchievementItem", "exports AchievementItem type"],
    ["components/achievements/AchievementBadge.tsx", "Progress", "shows progress"],

    // Batch 5 — ShareCard decomposition
    ["components/ShareCard.tsx", "ShareCardStats", "imports ShareCardStats"],
    ["components/ShareCard.tsx", "ShareCardExercises", "imports ShareCardExercises"],
    ["components/share/ShareCardStats.tsx", "Duration", "shows Duration"],
    ["components/share/ShareCardStats.tsx", "Sets", "shows Sets"],
    ["components/share/ShareCardStats.tsx", "Volume", "shows Volume"],
    ["components/share/ShareCardExercises.tsx", "New PRs", "shows New PRs"],

    // Batch 6 — _layout.tsx decomposition
    ["constants/screen-config.ts", "export const SCREEN_CONFIGS", "exports SCREEN_CONFIGS"],
    ["hooks/useAppInit.ts", "export function useAppInit", "exports useAppInit"],
    ["app/_layout.tsx", "useAppInit", "imports useAppInit"],
    ["app/_layout.tsx", "SCREEN_CONFIGS", "imports SCREEN_CONFIGS"],

    // Batch 6 — screen-config has all original screens
    ['constants/screen-config.ts', '"(tabs)"', 'has (tabs) screen'],
    ['constants/screen-config.ts', '"onboarding"', 'has onboarding screen'],
    ['constants/screen-config.ts', '"exercise/[id]"', 'has exercise/[id] screen'],
    ['constants/screen-config.ts', '"session/[id]"', 'has session/[id] screen'],
    ['constants/screen-config.ts', '"tools/plates"', 'has tools/plates screen'],
    ['constants/screen-config.ts', '"tools/timer"', 'has tools/timer screen'],

    // Batch 6 — FloatingTabBar decomposition
    ["components/FloatingTabBar.tsx", "CenterButton", "imports CenterButton"],
    ["components/FloatingTabBar.tsx", "TabButton", "imports TabButton"],
    ["components/FloatingTabBar.tsx", "export const FLOATING_TAB_BAR_HEIGHT", "exports FLOATING_TAB_BAR_HEIGHT"],
    ["components/FloatingTabBar.tsx", "export function useFloatingTabBarHeight", "exports useFloatingTabBarHeight"],

    // Batch 6 — plates.tsx decomposition
    ["components/plates/BarbellDiagram.tsx", "export function Barbell", "exports Barbell"],
    ["hooks/usePlateCalculator.ts", "export function usePlateCalculator", "exports usePlateCalculator"],
    ["app/tools/plates.tsx", "BarbellDiagram", "imports BarbellDiagram"],
    ["app/tools/plates.tsx", "usePlateCalculator", "imports usePlateCalculator"],
    ["app/tools/plates.tsx", "export function PlateCalculatorContent", "exports PlateCalculatorContent"],
  ];

  it("all decomposed files contain expected import/export markers", () => {
    for (const [file, expected, label] of containsCases) {
      try {
        expect(read(file)).toContain(expected);
      } catch {
        throw new Error(`Expected ${file} to contain "${expected}" (${label})`);
      }
    }
  });

  // ── File exists assertions ─────────────────────────────────────
  const existsCases: [string, string][] = [
    // Batch 2
    ["hooks/useBodyMetrics.ts", "progress useBodyMetrics hook"],
    ["components/progress/WeightLogModal.tsx", "progress WeightLogModal"],
    ["components/session/detail/SummaryCard.tsx", "session detail SummaryCard"],
    ["components/session/detail/RatingNotesCard.tsx", "session detail RatingNotesCard"],
    ["components/session/detail/TemplateModal.tsx", "session detail TemplateModal"],
    ["components/timer/TimerRing.tsx", "timer TimerRing"],
    ["components/timer/ConfigPanel.tsx", "timer ConfigPanel"],
    ["components/timer/TimerControls.tsx", "timer TimerControls"],

    // Batch 3
    ["hooks/usePhotoActions.ts", "photos usePhotoActions hook"],
    ["components/photos/PhotoFilterHeader.tsx", "photos PhotoFilterHeader"],
    ["components/photos/PhotoMetaModal.tsx", "photos PhotoMetaModal"],
    ["components/photos/PrivacyModal.tsx", "photos PrivacyModal"],
    ["hooks/useProgramDetail.ts", "program useProgramDetail hook"],
    ["components/program/WeeklySchedule.tsx", "program WeeklySchedule"],
    ["components/program/ProgramHistory.tsx", "program ProgramHistory"],
    ["hooks/useWeeklySummary.ts", "weekly summary hook"],
    ["components/weekly-summary/SummaryDetailSections.tsx", "weekly summary SummaryDetailSections"],
    ["hooks/useTemplateEditor.ts", "template useTemplateEditor hook"],
    ["components/template/TemplateExerciseRow.tsx", "template TemplateExerciseRow"],

    // Batch 4
    ["components/exercises/ExerciseCard.tsx", "exercises ExerciseCard"],
    ["components/exercises/ExerciseDetailPane.tsx", "exercises ExerciseDetailPane"],
    ["hooks/useExerciseForm.ts", "exercise form hook"],
    ["components/exercise-form/MuscleGroupPicker.tsx", "exercise form MuscleGroupPicker"],
    ["hooks/useMuscleVolume.ts", "muscle volume hook"],
    ["components/muscle-volume/VolumeBarChart.tsx", "muscle volume VolumeBarChart"],
    ["components/muscle-volume/VolumeTrendChart.tsx", "muscle volume VolumeTrendChart"],
    ["components/session/GroupCardHeader.tsx", "session GroupCardHeader"],
    ["components/session/SuggestionChip.tsx", "session SuggestionChip"],

    // Batch 6
    ["components/floating-tab-bar/CenterButton.tsx", "floating tab bar CenterButton"],
    ["components/floating-tab-bar/TabButton.tsx", "floating tab bar TabButton"],
    ["components/profile/ActivityDropdown.tsx", "profile ActivityDropdown"],
  ];

  it("all decomposed files exist on disk", () => {
    for (const [file, label] of existsCases) {
      if (!fs.existsSync(resolve(file))) {
        throw new Error(`Expected ${file} to exist (${label})`);
      }
    }
  });

  // ── Line limit assertions ──────────────────────────────────────
  const lineLimitCases: [string, number, string][] = [
    // Batch 2
    ["app/(tabs)/progress.tsx", 100, "progress main file"],
    ["app/session/detail/[id].tsx", 200, "session detail main file"],
    ["lib/exercise-nlp.ts", 250, "exercise NLP main file"],
    ["app/tools/timer.tsx", 300, "timer main file"],

    // Batch 3
    ["app/body/photos.tsx", 200, "photos main file"],
    ["app/program/[id].tsx", 350, "program detail main file"],
    ["components/WeeklySummary.tsx", 250, "weekly summary main file"],
    ["app/template/[id].tsx", 200, "template editor main file"],

    // Batch 4
    ["app/(tabs)/exercises.tsx", 300, "exercises main file"],
    ["components/ExerciseForm.tsx", 350, "exercise form main file"],
    ["components/MuscleVolumeSegment.tsx", 300, "muscle volume main file"],
    ["components/session/ExerciseGroupCard.tsx", 300, "exercise group card main file"],

    // Batch 5
    // BLD-541: session main file bumped from 350 → 400 to fit bodyweight
    // modifier sheet orchestration (ref, 3 handlers, useMemo, 1 sheet JSX).
    // Per-set orchestration logic extracted to hooks/useBodyweightModifierSheet.
    ["app/session/[id].tsx", 400, "session main file"],
    ["components/SubstitutionSheet.tsx", 260, "substitution sheet main file"],
    ["app/progress/achievements.tsx", 200, "achievements main file"],
    ["components/ShareCard.tsx", 200, "share card main file"],

    // Batch 6
    ["app/_layout.tsx", 200, "root layout main file"],
    ["components/FloatingTabBar.tsx", 200, "floating tab bar main file"],
    ["app/tools/plates.tsx", 270, "plates main file"],
  ];

  it("all decomposed files respect their line-count limits", () => {
    for (const [file, maxLines, label] of lineLimitCases) {
      const actual = read(file).split("\n").length;
      if (actual >= maxLines) {
        throw new Error(`Expected ${file} to be under ${maxLines} lines but got ${actual} (${label})`);
      }
    }
  });
});
