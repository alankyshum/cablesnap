/**
 * Shared screen registry used by both design-quality and screenshot-capture specs.
 * Single source of truth for all app screens and their routes.
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

/** Subset of tabs that render well on web for store screenshots */
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
];

export const STANDALONE_SCREENS: Screen[] = [
  { name: "Workout History", path: "/history" },
  { name: "Feedback", path: "/feedback" },
  { name: "Error Log", path: "/errors" },
  { name: "Body Measurements", path: "/body/measurements" },
  { name: "Body Goals", path: "/body/goals" },
  { name: "New Exercise", path: "/exercise/create" },
  { name: "New Template", path: "/template/create" },
  { name: "New Program", path: "/program/create" },
  { name: "Pick Template", path: "/program/pick-template" },
];

export const DYNAMIC_SCREENS: Screen[] = [
  { name: "Exercise Detail", path: "/exercise/voltra-001" },
  { name: "Edit Exercise", path: "/exercise/edit/voltra-001" },
  { name: "Template Detail", path: "/template/starter-tpl-1" },
  { name: "Program Detail", path: "/program/starter-prog-1" },
];

export const ALL_SCREENS: Screen[] = [
  ...TAB_SCREENS,
  ...TOOL_SCREENS,
  ...STANDALONE_SCREENS,
  ...DYNAMIC_SCREENS,
];

export const ONBOARDING_SCREENS: Screen[] = [
  { name: "Onboarding Welcome", path: "/onboarding/welcome" },
  { name: "Onboarding Setup", path: "/onboarding/setup" },
  { name: "Onboarding Recommend", path: "/onboarding/recommend" },
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Build a lookup from slug to Screen for manifest generation.
 * Covers ALL_SCREENS + ONBOARDING_SCREENS.
 */
export function buildSlugMap(): Map<string, Screen> {
  const map = new Map<string, Screen>();
  for (const screen of [...ALL_SCREENS, ...ONBOARDING_SCREENS]) {
    map.set(slugify(screen.name), screen);
  }
  return map;
}
