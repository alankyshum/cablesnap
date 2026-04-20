// Re-export everything from domain modules for backward compatibility.
// Consumers can import from "lib/db" as before, or from specific modules.

export { getDatabase, getDrizzle, isMemoryFallback } from "./helpers";

export {
  getAllExercises,
  getExerciseById,
  getExercisesByIds,
  createCustomExercise,
  updateCustomExercise,
  softDeleteCustomExercise,
  getTemplatesUsingExercise,
} from "./exercises";

export {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplateName,
  deleteTemplate,
  duplicateTemplate,
  duplicateProgram,
  addExerciseToTemplate,
  removeExerciseFromTemplate,
  reorderTemplateExercises,
  updateTemplateExercise,
  getTemplateExerciseCount,
  getTemplateExerciseCounts,
  getTemplatePrimaryMuscles,
  createExerciseLink,
  unlinkExerciseGroup,
  addToExerciseLink,
  unlinkSingleExercise,
  updateLinkLabel,
} from "./templates";

export {
  startSession,
  getTemplateDurationEstimates,
  completeSession,
  cancelSession,
  getRecentSessions,
  getSessionById,
  getSessionSets,
  getActiveSession,
  addSet,
  addSetsBatch,
  addWarmupSets,
  updateSet,
  updateSetsBatch,
  updateSetDuration,
  completeSet,
  uncompleteSet,
  deleteSet,
  deleteSetsBatch,
  updateSetRPE,
  updateSetNotes,
  updateSetTrainingMode,
  updateSetTempo,
  updateSetWarmup,
  updateSetType,
  getPreviousSets,
  getPreviousSetsBatch,
  getSessionSetCount,
  getSessionSetCounts,
  getSessionAvgRPE,
  getSessionAvgRPEs,
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
  checkSetPR,
  getRecentPRs,
  getExerciseHistory,
  getExerciseRecords,
  getExerciseChartData,
  getExerciseDurationChartData,
  getExercise1RMChartData,
  getRecentExerciseSets,
  getRecentExerciseSetsBatch,
  getBestSet,
  getMuscleVolumeForWeek,
  getMuscleVolumeTrend,
  getSessionRepPRs,
  getSessionComparison,
  getSessionWeightIncreases,
  getSessionDurationPRs,
  getSessionCountsByDay,
  getTotalSessionCount,
  getE1RMTrends,
  updateSession,
  createTemplateFromSession,
  swapExerciseInSession,
  undoSwapInSession,
  getSourceSessionSets,
  updateExercisePositions,
} from "./sessions";
export type { ExerciseSession, ExerciseRecords, SourceSessionSet } from "./sessions";
export type { E1RMTrendRow } from "./sessions";

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
  findDuplicateFoodEntry,
} from "./nutrition";

export {
  getBodySettings,
  updateBodySettings,
  updateBodySex,
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
  deleteAppSetting,
  isOnboardingComplete,
  getSchedule,
  getTodaySchedule,
  isTodayCompleted,
  getWeekAdherence,
  getWeeklyCompletedCount,
  insertInteraction,
  getInteractions,
  clearInteractions,
} from "./settings";
export type { ScheduleEntry } from "./settings";

export {
  exportAllData,
  importData,
  estimateExportSize,
  validateBackupFileSize,
  validateBackupData,
  getBackupCounts,
  BACKUP_TABLE_LABELS,
  IMPORT_TABLE_ORDER,
} from "./import-export";
export type {
  BackupV3,
  BackupTableName,
  ExportProgress,
  ImportProgress,
  ImportResult,
  ValidationError,
} from "./import-export";

export {
  insertPhoto,
  getPhotos,
  getPhotoById,
  getPhotoCount,
  softDeletePhoto,
  restorePhoto,
  permanentlyDeletePhoto,
  cleanupDeletedPhotos,
  cleanupOrphanFiles,
  updatePhotoMeta,
  getPhotosByMonth,
  ensurePhotoDirs,
  getPhotoDir,
  getThumbnailDir,
} from "./photos";
export type { ProgressPhoto, PoseCategory } from "./photos";

export {
  getWeeklySummary,
  getWeeklyWorkouts,
  getWeeklyPRs,
  getWeeklyNutrition,
  getWeeklyBody,
  getWeeklyStreak,
  NUTRITION_ON_TARGET_TOLERANCE,
} from "./weekly-summary";
export type {
  WeeklySummaryData,
  WeeklyWorkoutSummary,
  WeeklyPR,
  WeeklyNutritionSummary,
  WeeklyBodySummary,
} from "./weekly-summary";

export {
  buildAchievementContext,
  getEarnedAchievements,
  getEarnedAchievementIds,
  getEarnedAchievementMap,
  saveEarnedAchievements,
  getEarnedCount,
  hasSeenRetroactiveBanner,
  markRetroactiveBannerSeen,
} from "./achievements";

export {
  getStravaConnection,
  saveStravaConnection,
  deleteStravaConnection,
  createSyncLogEntry,
  markSyncSuccess,
  markSyncFailed,
  markSyncPermanentlyFailed,
  getPendingOrFailedSyncs,
  getSyncLogForSession,
} from "./strava";
export type { StravaConnection, StravaSyncLog, StravaSyncStatus } from "./strava";

export {
  createHCSyncLogEntry,
  markHCSyncSuccess,
  markHCSyncFailed,
  markHCSyncPermanentlyFailed,
  getHCPendingOrFailedSyncs,
  getHCSyncLogForSession,
  markAllHCPendingAsFailed,
} from "./health-connect";
export type { HCSyncLog, HCSyncStatus } from "./health-connect";

export {
  getDailyNutritionTotals,
  getWeeklyNutritionAverages,
  getNutritionAdherence,
  getNutritionTargets,
} from "./nutrition-progress";
export type {
  DailyNutritionTotal,
  WeeklyNutritionAverage,
  NutritionAdherence,
} from "./nutrition-progress";

export {
  createMealTemplate,
  getMealTemplates,
  getMealTemplateById,
  updateMealTemplate,
  deleteMealTemplate,
  logFromTemplate,
  undoLogFromTemplate,
} from "./meal-templates";
export type {
  CreateMealTemplateInput,
  UpdateMealTemplateInput,
  LogFromTemplateResult,
} from "./meal-templates";

export { getMuscleRecoveryStatus, RECOVERY_HOURS } from "./recovery";
export type { MuscleRecoveryStatus, RecoveryStatus } from "./recovery";

export { getStrengthOverview } from "./strength-overview";
export type { StrengthOverviewRow } from "./strength-overview";

export {
  getActiveGoals,
  getGoalForExercise,
  createGoal,
  updateGoal,
  achieveGoal,
  deleteGoal,
  getCompletedGoals,
  getCurrentBestWeight,
  getCurrentBestReps,
} from "./strength-goals";
export type { StrengthGoalRow, CreateGoalInput, UpdateGoalInput } from "./strength-goals";
