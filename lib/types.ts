export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms"
  | "traps"
  | "lats"
  | "full_body";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "other";

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type Category =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "legs"
  | "core"
  | "cardio"
  | "full_body";

export type Exercise = {
  id: string;
  name: string;
  category: Category;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  instructions: string;
  difficulty: Difficulty;
  is_custom: boolean;
};

export const CATEGORIES: Category[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "core",
  "cardio",
  "full_body",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  core: "Core",
  cardio: "Cardio",
  full_body: "Full Body",
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  machine: "Machine",
  bodyweight: "Bodyweight",
  kettlebell: "Kettlebell",
  band: "Band",
  other: "Other",
};

export const EQUIPMENT_LIST: Equipment[] = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
];

export const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const MUSCLE_GROUPS_BY_REGION: { label: string; muscles: MuscleGroup[] }[] = [
  { label: "Upper Body", muscles: ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "traps", "lats"] },
  { label: "Lower Body", muscles: ["quads", "hamstrings", "glutes", "calves"] },
  { label: "Core", muscles: ["core"] },
  { label: "Full Body", muscles: ["full_body"] },
];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  forearms: "Forearms",
  traps: "Traps",
  lats: "Lats",
  full_body: "Full Body",
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  exercises?: TemplateExercise[];
};

export type TemplateExercise = {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
  exercise?: Exercise;
};

export type WorkoutSession = {
  id: string;
  template_id: string | null;
  name: string;
  started_at: number;
  completed_at: number | null;
  duration_seconds: number | null;
  notes: string;
};

export type WorkoutSet = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
  completed_at: number | null;
};

// --------------- Nutrition ---------------

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export type FoodEntry = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: string;
  is_favorite: boolean;
  created_at: number;
};

export type DailyLog = {
  id: string;
  food_entry_id: string;
  date: string;
  meal: Meal;
  servings: number;
  logged_at: number;
  food?: FoodEntry;
};

export type MacroTargets = {
  id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  updated_at: number;
};

// --------------- Body Tracking ---------------

export type BodyWeight = {
  id: string;
  weight: number;
  date: string;
  notes: string;
  logged_at: number;
};

export type BodyMeasurements = {
  id: string;
  date: string;
  waist: number | null;
  chest: number | null;
  hips: number | null;
  left_arm: number | null;
  right_arm: number | null;
  left_thigh: number | null;
  right_thigh: number | null;
  left_calf: number | null;
  right_calf: number | null;
  neck: number | null;
  body_fat: number | null;
  notes: string;
  logged_at: number;
};

export type BodySettings = {
  id: string;
  weight_unit: "kg" | "lb";
  measurement_unit: "cm" | "in";
  weight_goal: number | null;
  body_fat_goal: number | null;
  updated_at: number;
};

// --------------- Error Log ---------------

export type ErrorEntry = {
  id: string;
  message: string;
  stack: string | null;
  component: string | null;
  fatal: boolean;
  timestamp: number;
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
};
