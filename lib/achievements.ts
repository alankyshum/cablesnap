// Achievement definitions and pure evaluation logic.
// No side effects — all evaluation operates on a pre-built AchievementContext.

export type AchievementCategory =
  | "consistency"
  | "strength"
  | "volume"
  | "nutrition"
  | "body";

export type AchievementContext = {
  totalWorkouts: number;
  workoutDates: string[]; // ISO date strings (YYYY-MM-DD), sorted ascending
  prCount: number;
  maxSessionVolume: number;
  lifetimeVolume: number;
  nutritionDays: string[]; // ISO date strings with daily_log entries, sorted ascending
  bodyWeightCount: number;
  progressPhotoCount: number;
  bodyMeasurementCount: number;
};

export type AchievementEvalResult = {
  earned: boolean;
  progress: number; // 0..1
};

export type AchievementDef = {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  evaluate: (ctx: AchievementContext) => AchievementEvalResult;
};

export type EarnedAchievement = {
  achievement_id: string;
  earned_at: number;
};

// --- Helper functions ---

function countProgress(current: number, target: number): AchievementEvalResult {
  return {
    earned: current >= target,
    progress: Math.min(current / target, 1),
  };
}

/** Compute longest consecutive-day streak from sorted date strings. */
function consecutiveDayStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const unique = [...new Set(dates)].sort();
  let maxStreak = 1;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1] + "T00:00:00Z");
    const curr = new Date(unique[i] + "T00:00:00Z");
    const diffMs = curr.getTime() - prev.getTime();
    if (diffMs === 86400000) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 1;
    }
  }
  return maxStreak;
}

/**
 * Check if user has 4 consecutive ISO weeks with ≥3 sessions each.
 * Groups workout dates by ISO week, then finds 4 consecutive qualifying weeks.
 */
function hasMonthlyGrind(dates: string[]): AchievementEvalResult {
  if (dates.length === 0) return { earned: false, progress: 0 };

  // Group dates by ISO week number + year
  const weekMap = new Map<string, number>();
  for (const d of dates) {
    const dt = new Date(d + "T00:00:00Z");
    const key = isoWeekKey(dt);
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
  }

  // Filter weeks with ≥3 sessions
  const qualifyingWeeks = [...weekMap.entries()]
    .filter(([, count]) => count >= 3)
    .map(([key]) => key)
    .sort();

  if (qualifyingWeeks.length === 0) return { earned: false, progress: 0 };

  // Find longest consecutive qualifying week run
  let maxConsec = 1;
  let consec = 1;
  for (let i = 1; i < qualifyingWeeks.length; i++) {
    if (isNextIsoWeek(qualifyingWeeks[i - 1], qualifyingWeeks[i])) {
      consec++;
      if (consec > maxConsec) maxConsec = consec;
    } else {
      consec = 1;
    }
  }

  return {
    earned: maxConsec >= 4,
    progress: Math.min(maxConsec / 4, 1),
  };
}

/** Returns "YYYY-WNN" ISO week key for a date. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Check if weekB is the ISO week immediately after weekA. */
function isNextIsoWeek(weekA: string, weekB: string): boolean {
  const [yA, wA] = weekA.split("-W").map(Number);
  const [yB, wB] = weekB.split("-W").map(Number);
  if (yA === yB) return wB === wA + 1;
  // Year boundary: last week of yA → first week of yB
  if (yB === yA + 1 && wB === 1) {
    // ISO year can have 52 or 53 weeks
    const lastWeek = getIsoWeeksInYear(yA);
    return wA === lastWeek;
  }
  return false;
}

function getIsoWeeksInYear(year: number): number {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));
  return jan1.getUTCDay() === 4 || dec31.getUTCDay() === 4 ? 53 : 52;
}

// --- Achievement Definitions ---

export const ACHIEVEMENTS: AchievementDef[] = [
  // Consistency
  {
    id: "first_steps",
    name: "First Steps",
    description: "Complete your first workout",
    category: "consistency",
    icon: "🏃",
    evaluate: (ctx) => countProgress(ctx.totalWorkouts, 1),
  },
  {
    id: "getting_started",
    name: "Getting Started",
    description: "Complete 5 workouts",
    category: "consistency",
    icon: "🔥",
    evaluate: (ctx) => countProgress(ctx.totalWorkouts, 5),
  },
  {
    id: "dedicated",
    name: "Dedicated",
    description: "Complete 25 workouts",
    category: "consistency",
    icon: "💪",
    evaluate: (ctx) => countProgress(ctx.totalWorkouts, 25),
  },
  {
    id: "iron_will",
    name: "Iron Will",
    description: "Complete 100 workouts",
    category: "consistency",
    icon: "🏋️",
    evaluate: (ctx) => countProgress(ctx.totalWorkouts, 100),
  },
  {
    id: "legend",
    name: "Legend",
    description: "Complete 500 workouts",
    category: "consistency",
    icon: "👑",
    evaluate: (ctx) => countProgress(ctx.totalWorkouts, 500),
  },
  {
    id: "week_warrior",
    name: "Week Warrior",
    description: "Maintain a 7-day workout streak",
    category: "consistency",
    icon: "⚡",
    evaluate: (ctx) => {
      const streak = consecutiveDayStreak(ctx.workoutDates);
      return countProgress(streak, 7);
    },
  },
  {
    id: "monthly_grind",
    name: "Monthly Grind",
    description: "4 consecutive weeks with 3+ sessions each",
    category: "consistency",
    icon: "🌟",
    evaluate: (ctx) => hasMonthlyGrind(ctx.workoutDates),
  },

  // Strength
  {
    id: "pr_breaker",
    name: "PR Breaker",
    description: "Hit your first personal record",
    category: "strength",
    icon: "📈",
    evaluate: (ctx) => countProgress(ctx.prCount, 1),
  },
  {
    id: "pr_machine",
    name: "PR Machine",
    description: "Hit 10 personal records",
    category: "strength",
    icon: "🎯",
    evaluate: (ctx) => countProgress(ctx.prCount, 10),
  },
  {
    id: "record_setter",
    name: "Record Setter",
    description: "Hit 50 personal records",
    category: "strength",
    icon: "🏆",
    evaluate: (ctx) => countProgress(ctx.prCount, 50),
  },

  // Volume
  {
    id: "ton_club",
    name: "Ton Club",
    description: "Lift 1,000 kg in a single session",
    category: "volume",
    icon: "🪨",
    evaluate: (ctx) => countProgress(ctx.maxSessionVolume, 1000),
  },
  {
    id: "heavy_hitter",
    name: "Heavy Hitter",
    description: "Lift 10,000 kg in a single session",
    category: "volume",
    icon: "💎",
    evaluate: (ctx) => countProgress(ctx.maxSessionVolume, 10000),
  },
  {
    id: "volume_king",
    name: "Volume King",
    description: "Accumulate 100,000 kg lifetime volume",
    category: "volume",
    icon: "🌍",
    evaluate: (ctx) => countProgress(ctx.lifetimeVolume, 100000),
  },

  // Nutrition
  {
    id: "macro_tracker",
    name: "Macro Tracker",
    description: "Log nutrition for 7 consecutive days",
    category: "nutrition",
    icon: "🥗",
    evaluate: (ctx) => {
      const streak = consecutiveDayStreak(ctx.nutritionDays);
      return countProgress(streak, 7);
    },
  },
  {
    id: "nutrition_pro",
    name: "Nutrition Pro",
    description: "Log nutrition for 30 consecutive days",
    category: "nutrition",
    icon: "🍎",
    evaluate: (ctx) => {
      const streak = consecutiveDayStreak(ctx.nutritionDays);
      return countProgress(streak, 30);
    },
  },

  // Body
  {
    id: "progress_pic",
    name: "Progress Pic",
    description: "Take your first progress photo",
    category: "body",
    icon: "📸",
    evaluate: (ctx) => countProgress(ctx.progressPhotoCount, 1),
  },
  {
    id: "body_journal",
    name: "Body Journal",
    description: "Log body weight 10 times",
    category: "body",
    icon: "⚖️",
    evaluate: (ctx) => countProgress(ctx.bodyWeightCount, 10),
  },
  {
    id: "transformation",
    name: "Transformation",
    description: "Log body measurements 5 times",
    category: "body",
    icon: "📐",
    evaluate: (ctx) => countProgress(ctx.bodyMeasurementCount, 5),
  },
];

/**
 * Evaluate all achievements against a context.
 * Returns newly earned achievements (those that evaluate to earned=true
 * and are NOT in the alreadyEarned set).
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyEarnedIds: Set<string>,
): { achievement: AchievementDef; result: AchievementEvalResult }[] {
  const newlyEarned: { achievement: AchievementDef; result: AchievementEvalResult }[] = [];
  for (const a of ACHIEVEMENTS) {
    if (alreadyEarnedIds.has(a.id)) continue;
    const result = a.evaluate(ctx);
    if (result.earned) {
      newlyEarned.push({ achievement: a, result });
    }
  }
  return newlyEarned;
}

/**
 * Get progress for all achievements (for the grid screen).
 */
export function getAllAchievementProgress(
  ctx: AchievementContext,
  earnedMap: Map<string, number>, // achievement_id → earned_at timestamp
): {
  achievement: AchievementDef;
  earned: boolean;
  earnedAt: number | null;
  progress: number;
}[] {
  return ACHIEVEMENTS.map((a) => {
    const earnedAt = earnedMap.get(a.id) ?? null;
    if (earnedAt !== null) {
      return { achievement: a, earned: true, earnedAt, progress: 1 };
    }
    const result = a.evaluate(ctx);
    return { achievement: a, earned: false, earnedAt: null, progress: result.progress };
  });
}
