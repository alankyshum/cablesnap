// Re-export everything from domain modules for backward compatibility.
// Consumers can import from "lib/db" as before, or from specific modules.

export { getDatabase, isMemoryFallback } from "./helpers";

export {
  getAllExercises,
  getExerciseById,
  createCustomExercise,
  updateCustomExercise,
  softDeleteCustomExercise,
  getTemplatesUsingExercise,
} from "./exercises";

export {
  createTemplate,
  getTemplates,
  getTemplateById,
  deleteTemplate,
  duplicateTemplate,
  duplicateProgram,
  addExerciseToTemplate,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  updateTemplateExercise,
  getTemplateExerciseCount,
  createExerciseLink,
  unlinkExerciseGroup,
  addToExerciseLink,
  unlinkSingleExercise,
  updateLinkLabel,
} from "./templates";

export {
  startSession,
  completeSession,
  cancelSession,
  getRecentSessions,
  getSessionById,
  getSessionSets,
  getActiveSession,
  addSet,
  updateSet,
  completeSet,
  uncompleteSet,
  deleteSet,
  updateSetRPE,
  updateSetNotes,
  updateSetTrainingMode,
  updateSetTempo,
  getPreviousSets,
  getSessionSetCount,
  getSessionAvgRPE,
  getRestSecondsForExercise,
  getRestSecondsForLink,
  getSessionsByMonth,
  searchSessions,
  getAllCompletedSessionWeeks,
  getWeeklySessionCounts,
  getWeeklyVolume,
  getPersonalRecords,
  getCompletedSessionsWithSetCount,
  getMaxWeightByExercise,
  getSessionPRs,
  getRecentPRs,
  getExerciseHistory,
  getExerciseRecords,
  getExerciseChartData,
  getRecentExerciseSets,
  getBestSet,
  getMuscleVolumeForWeek,
  getMuscleVolumeTrend,
  getSessionRepPRs,
  getSessionComparison,
  getSessionWeightIncreases,
} from "./sessions";
export type { ExerciseSession, ExerciseRecords } from "./sessions";

export {
  addFoodEntry,
  getFoodEntries,
  getFavoriteFoods,
  toggleFavorite,
  addDailyLog,
  getDailyLogs,
  deleteDailyLog,
  getMacroTargets,
  updateMacroTargets,
  getDailySummary,
} from "./nutrition";

export {
  getBodySettings,
  updateBodySettings,
  upsertBodyWeight,
  getBodyWeightEntries,
  getBodyWeightCount,
  getLatestBodyWeight,
  getPreviousBodyWeight,
  deleteBodyWeight,
  getBodyWeightChartData,
  upsertBodyMeasurements,
  getLatestMeasurements,
  getBodyMeasurementEntries,
  deleteBodyMeasurements,
} from "./body";

export {
  getWorkoutCSVData,
  getNutritionCSVData,
  getCSVCounts,
  getBodyWeightCSVData,
  getBodyMeasurementsCSVData,
} from "./csv";
export type {
  WorkoutCSVRow,
  NutritionCSVRow,
  BodyWeightCSVRow,
  BodyMeasurementsCSVRow,
} from "./csv";

export {
  getAppSetting,
  setAppSetting,
  isOnboardingComplete,
  getSchedule,
  setScheduleDay,
  clearSchedule,
  getTodaySchedule,
  isTodayCompleted,
  getWeekAdherence,
  insertInteraction,
  getInteractions,
  clearInteractions,
} from "./settings";
export type { ScheduleEntry } from "./settings";

export { exportAllData, importData } from "./import-export";
