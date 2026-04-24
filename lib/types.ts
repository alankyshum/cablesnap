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

export type MountPosition = "high" | "mid" | "low" | "floor";

export type Attachment =
  | "handle"
  | "ring_handle"
  | "ankle_strap"
  | "rope"
  | "bar"
  | "squat_harness"
  | "carabiner";

export type TrainingMode =
  | "weight"
  | "eccentric_overload"
  | "band"
  | "damper"
  | "isokinetic"
  | "isometric"
  | "custom_curves"
  | "rowing";

export type Category =
  | "abs_core"
  | "arms"
  | "back"
  | "chest"
  | "legs_glutes"
  | "shoulders";

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
  deleted_at?: number | null;
  mount_position?: MountPosition;
  attachment?: Attachment;
  training_modes?: TrainingMode[];
  is_voltra?: boolean;
};

export const CATEGORIES: Category[] = [
  "abs_core",
  "arms",
  "back",
  "chest",
  "legs_glutes",
  "shoulders",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  abs_core: "Abs & Core",
  arms: "Arms",
  back: "Back",
  chest: "Chest",
  legs_glutes: "Legs & Glutes",
  shoulders: "Shoulders",
};

export const MOUNT_POSITION_LABELS: Record<MountPosition, string> = {
  high: "High",
  mid: "Mid",
  low: "Low",
  floor: "Floor",
};

export const ATTACHMENT_LABELS: Record<Attachment, string> = {
  handle: "Handle",
  ring_handle: "Ring Handle",
  ankle_strap: "Ankle Strap",
  rope: "Rope",
  bar: "Bar",
  squat_harness: "Squat Harness",
  carabiner: "Carabiner",
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
  is_starter?: boolean;
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
  link_id: string | null;
  link_label: string;
  target_duration_seconds: number | null;
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
  rating: number | null;
};

export type SetType = "normal" | "warmup" | "dropset" | "failure";

export const SET_TYPE_CYCLE: SetType[] = ["normal", "warmup", "dropset", "failure"];

export const SET_TYPE_LABELS: Record<SetType, { label: string; short: string }> = {
  normal: { label: "Normal", short: "" },
  warmup: { label: "Warm-up", short: "W" },
  dropset: { label: "Dropset", short: "D" },
  failure: { label: "Failure", short: "F" },
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
  rpe: number | null;
  notes: string;
  link_id: string | null;
  round: number | null;
  training_mode: TrainingMode | null;
  tempo: string | null;
  swapped_from_exercise_id: string | null;
  set_type: SetType;
  duration_seconds: number | null;
  exercise_position: number;
  bodyweight_modifier_kg?: number | null;
};

export const TRAINING_MODE_LABELS: Record<TrainingMode, { label: string; short: string; description: string }> = {
  weight: { label: "Standard", short: "STD", description: "Normal cable weight resistance — standard lifting" },
  eccentric_overload: { label: "Eccentric", short: "ECC", description: "Heavier resistance on the lowering phase for muscle growth" },
  band: { label: "Band", short: "BND", description: "Resistance band attached for variable tension" },
  damper: { label: "Damper", short: "DMP", description: "Damper provides smooth, constant resistance" },
  isokinetic: { label: "Isokinetic", short: "ISO", description: "Machine controls speed — constant velocity throughout" },
  isometric: { label: "Isometric", short: "ISOM", description: "Hold position against resistance — no movement" },
  custom_curves: { label: "Custom", short: "CRV", description: "Custom resistance profile set on the Volta" },
  rowing: { label: "Rowing", short: "ROW", description: "Rowing movement pattern with cable resistance" },
};

export type LinkedGroup = {
  link_id: string;
  label: string;
  exercises: TemplateExercise[];
};

// --------------- Food Database ---------------

export type FoodCategory = "protein" | "grains" | "dairy" | "fruits" | "vegetables" | "fats" | "other";

export type BuiltinFood = {
  id: string;
  name: string;
  category: FoodCategory;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
};

export const FOOD_CATEGORIES: { id: FoodCategory; label: string }[] = [
  { id: "protein", label: "Protein" },
  { id: "grains", label: "Grains" },
  { id: "dairy", label: "Dairy" },
  { id: "fruits", label: "Fruits" },
  { id: "vegetables", label: "Vegetables" },
  { id: "fats", label: "Fats & Nuts" },
  { id: "other", label: "Other" },
];

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

// --------------- Meal Templates ---------------

export type MealTemplate = {
  id: string;
  name: string;
  meal: Meal;
  cached_calories: number;
  cached_protein: number;
  cached_carbs: number;
  cached_fat: number;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
  items?: MealTemplateItem[];
};

export type MealTemplateItem = {
  id: string;
  template_id: string;
  food_entry_id: string;
  servings: number;
  sort_order: number;
  food?: FoodEntry;
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
  sex: "male" | "female";
  weight_goal: number | null;
  body_fat_goal: number | null;
  updated_at: number;
};

// --------------- Programs ---------------

export type Program = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  is_starter?: boolean;
  current_day_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type ProgramDay = {
  id: string;
  program_id: string;
  template_id: string | null;
  position: number;
  label: string;
  template_name?: string;
};

export type ProgramLog = {
  id: string;
  program_id: string;
  day_id: string;
  session_id: string;
  completed_at: number;
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

// --------------- Interactions ---------------

export type InteractionAction = "navigate" | "tap" | "submit" | "delete" | "create";

export type Interaction = {
  id: string;
  action: InteractionAction;
  screen: string;
  detail: string | null;
  timestamp: number;
};

// --------------- Console Log Buffer ---------------

export type LogLevel = "log" | "warn" | "error";

export type ConsoleLogEntry = {
  level: LogLevel;
  message: string;
  timestamp: number;
};

// --------------- Feedback ---------------

export type ReportType = "bug" | "feature" | "crash";
