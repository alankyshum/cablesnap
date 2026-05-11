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
  getProgressionChain,
  getProgressionSuggestion,
  type ProgressionChainExercise,
  type ProgressionSuggestion,
  updateExerciseNote,
  updateMaxPulleyPins,
  getMaxPulleyPins,
  getDefaultTempo,
  setDefaultTempo,
  dismissExerciseBackfill,
  getExerciseBackfillCandidate,
  getExerciseNotesBatch,
  type BackfillCandidate,
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
  buildInitialSetsFromTemplate,
  parseTemplateTargetReps,
  importCoachTemplates,
  syncTemplateFromSession,
  undoTemplateSyncFromSession,
  type TemplateSyncResult,
  type TemplateSyncChange,
} from "./templates";

export { exportCoachTemplate } from "./templates-export";

export {
  startSession,
  getTemplateDurationEstimates,
  completeSession,
  cancelSession,
  deleteCompletedSession,
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
  updatePulleyPin,
  updateSetNotes,
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
  getRestContext,
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
  checkSetBodyweightModifierPR,
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
  getTemplatesWithSessions,
  getMuscleGroupsWithSessions,
  getFilteredSessions,
  getE1RMTrends,
  getWeeklyE1RMTrends,
  getRecentSessionRPEs,
  getRecentSessionRatings,
  updateSession,
  createTemplateFromSession,
  swapExerciseInSession,
  undoSwapInSession,
  editCompletedSession,
  EditCompletedSessionError,
  getSourceSessionSets,
  updateExercisePositions,
  exerciseHasHistoricalRpe,
} from "./sessions";
export type { RestContext } from "./sessions";
export type { SessionEditPayload, SessionEditSetPatch } from "./sessions";
export type { TemplateOption, DatePreset, HistoryFilters } from "./sessions";
export type { ExerciseCategory, RestInputs, RestFactor, RestBreakdown } from "../rest";
export type { ExerciseSession, ExerciseRecords, SourceSessionSet, VariantScope } from "./sessions";
export { getVariantSetCount, buildVariantSql } from "./sessions";
export type { E1RMTrendRow, WeeklyE1RMRow, SessionRPERow, SessionRatingRow } from "./sessions";

export {
  getGymProfiles,
  listGymProfiles,
  getGymProfile,
  createGymProfile,
  setDefaultGym,
  updateGymProfile,
  deleteGymProfile,
  softDeleteGymProfile,
  getCableStacksForGym,
  listCableStacks,
  getCableStack,
  createCableStack,
  updateCableStack,
  deleteCableStack,
  softDeleteCableStack,
  getCalibrationsByStack,
  listCalibrations,
  upsertCalibration,
  deleteCalibration,
  getDefaultGym,
  getActiveGymCount,
  getSessionsByGym,
} from "./gym-profiles";
export type {
  GymProfileRow,
  CableStackRow,
  StackCalibrationRow,
  GymProfile,
  CableStack,
  StackCalibration,
} from "./gym-profiles";

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
  getExercisesCSVData,
} from "./csv";
export type {
  WorkoutCSVRow,
  NutritionCSVRow,
  BodyWeightCSVRow,
  BodyMeasurementsCSVRow,
  ExerciseCSVRow,
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
  getBackupCategoryCounts,
  getPresentBackupCategories,
  BACKUP_TABLE_LABELS,
  IMPORT_TABLE_ORDER,
  BACKUP_CATEGORY_LABELS,
  BACKUP_CATEGORY_ORDER,
} from "./import-export";
export { validateCoachTemplateImportData } from "../schemas";
export type {
  BackupV3,
  BackupV7,
  BackupFile,
  BackupCategoryName,
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

export { getMonthlyReport } from "./monthly-report";
export type {
  MonthlyReportData,
  MonthlyWorkoutSummary,
  MonthlyPR,
  MonthlyMuscleVolume,
  MonthlyMostImproved,
  MonthlyBodySummary,
  MonthlyNutritionSummary,
} from "./monthly-report";

export {
  buildAchievementContext,
  getEarnedAchievements,
  getEarnedAchievementIds,
  getEarnedAchievementMap,
  saveEarnedAchievements,
  getEarnedCount,
  hasSeenRetroactiveBanner,
  markRetroactiveBannerSeen,
  hasSeenRpeCaptureNudge,
  markRpeCaptureNudgeSeen,
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
  getCurrentBestWeightsByExercise,
  getCurrentBestReps,
  getCurrentBestRepsByExercise,
} from "./strength-goals";
export type { StrengthGoalRow, CreateGoalInput, UpdateGoalInput } from "./strength-goals";

export {
  getPRStats,
  getRecentPRsWithDelta,
  getAllTimeBests,
} from "./pr-dashboard";
export type { PRStats, RecentPR, AllTimeBest } from "./pr-dashboard";

export {
  addWaterLog,
  deleteWaterLog,
  updateWaterLog,
  getWaterLogsForDate,
  getDailyTotalMl,
} from "./hydration";
export type { WaterLog } from "./hydration";

export {
  addQuickAddSet,
  removeQuickAddSet,
  getTodayQuickAddSummary,
  listRecentQuickAddExercises,
  listDaySessionsForDate,
  listRecentDaySessions,
  localMidnightMs,
  todayDateKey,
} from "./day-session";
export type {
  QuickAddExerciseChip,
  TodayGtgSummaryRow,
  AddQuickAddSetParams,
  AddQuickAddSetResult,
  DaySessionEntry,
} from "./day-session";

export {
  getMonthlyGtgOnlyDates,
} from "./calendar";
