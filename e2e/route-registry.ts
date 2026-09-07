/**
 * Shared route registry used by design-quality and screenshot specs.
 * Dynamic routes use deterministic seed IDs so their screens render content.
 */

export type Screen = {
  name: string;
  path: string;
  waitFor?: string;
};

export const TAB_SCREENS: Screen[] = [
  { name: "Workouts", path: "/" },
  { name: "Exercises", path: "/exercises" },
  { name: "Nutrition", path: "/nutrition" },
  { name: "Progress", path: "/progress" },
  { name: "Settings", path: "/settings" },
];

export const AI_SCREENS: Screen[] = [
  { name: "AI Coach", path: "/ai-coach" },
  { name: "AI Provider Settings", path: "/settings/ai-key" },
];

export const STORE_SCREENS: Screen[] = [
  { name: "Workouts", path: "/" },
  { name: "Nutrition", path: "/nutrition" },
  { name: "Progress", path: "/progress" },
];

export const TOOL_SCREENS: Screen[] = [
  { name: "Tools Hub", path: "/tools" },
  { name: "1RM Calculator", path: "/tools/rm" },
  { name: "Plate Calculator", path: "/tools/plates" },
  { name: "Interval Timer", path: "/tools/timer" },
  { name: "Cable Finder", path: "/tools/cable-finder" },
];

export const STANDALONE_SCREENS: Screen[] = [
  { name: "Workout History", path: "/history" },
  { name: "Feedback", path: "/feedback" },
  { name: "Error Log", path: "/errors" },
  { name: "Body Measurements", path: "/body/measurements" },
  { name: "Body Goals", path: "/body/goals" },
  { name: "Body Compare", path: "/body/compare" },
  { name: "Body Photos", path: "/body/photos" },
  { name: "New Exercise", path: "/exercise/create" },
  { name: "New Template", path: "/template/create" },
  { name: "New Program", path: "/program/create" },
  { name: "Pick Template", path: "/program/pick-template" },
  { name: "Nutrition Templates", path: "/nutrition/templates" },
  { name: "Water", path: "/nutrition/water" },
  { name: "Progress Achievements", path: "/progress/achievements" },
  { name: "Progress Records", path: "/progress/records" },
  { name: "Strava Callback", path: "/strava-callback" },
];

export const SETTINGS_SCREENS: Screen[] = [
  { name: "Advanced Sets Settings", path: "/settings/advanced-sets" },
  { name: "Backups Settings", path: "/settings/backups" },
  { name: "Gym Profiles Settings", path: "/settings/gym-profiles" },
  { name: "Import Backup Settings", path: "/settings/import-backup" },
  { name: "Import Workouts Settings", path: "/settings/import-workouts" },
  { name: "Language Settings", path: "/settings/language" },
  { name: "Macro Coach Settings", path: "/settings/macro-coach" },
  { name: "Training Day Macros Settings", path: "/settings/training-day-macros" },
];

export const DYNAMIC_SCREENS: Screen[] = [
  { name: "Exercise Detail", path: "/exercise/voltra-001" },
  { name: "Edit Exercise", path: "/exercise/edit/voltra-001" },
  { name: "Template Detail", path: "/template/starter-tpl-1" },
  { name: "Program Detail", path: "/program/starter-prog-1" },
  { name: "Nutrition Template Detail", path: "/nutrition/template/starter-tpl-1" },
  { name: "Active Session", path: "/session/scenario-session-1" },
  { name: "Session Detail", path: "/session/detail/scenario-session-1" },
  { name: "Session Summary", path: "/session/summary/scenario-session-1" },
  { name: "Day Session", path: "/day-session/scenario-day-session-1" },
];

export const ALL_SCREENS: Screen[] = [
  ...TAB_SCREENS,
  ...AI_SCREENS,
  ...TOOL_SCREENS,
  ...STANDALONE_SCREENS,
  ...SETTINGS_SCREENS,
  ...DYNAMIC_SCREENS,
];

export const ONBOARDING_SCREENS: Screen[] = [
  { name: "Onboarding Welcome", path: "/onboarding/welcome" },
  { name: "Onboarding Setup", path: "/onboarding/setup" },
  { name: "Onboarding Recommend", path: "/onboarding/recommend" },
];

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function buildSlugMap(): Map<string, Screen> {
  const map = new Map<string, Screen>();
  for (const screen of [...ALL_SCREENS, ...ONBOARDING_SCREENS]) {
    map.set(slugify(screen.name), screen);
  }
  return map;
}
