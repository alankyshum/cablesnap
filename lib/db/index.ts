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
  updateTemplateName,
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
  addSetsBatch,
  updateSet,
  updateSetsBatch,
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
  getExercise1RMChartData,
  getRecentExerciseSets,
  getBestSet,
  getMuscleVolumeForWeek,
  getMuscleVolumeTrend,
  getSessionRepPRs,
  getSessionComparison,
  getSessionWeightIncreases,
  getSessionCountsByDay,
  getTotalSessionCount,
  updateSession,
  createTemplateFromSession,
  swapExerciseInSession,
  undoSwapInSession,
  getSourceSessionSets,
} from "./sessions";
export type { ExerciseSession, ExerciseRecords, SourceSessionSet } from "./sessions";

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
  getTodaySchedule,
  isTodayCompleted,
  getWeekAdherence,
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
