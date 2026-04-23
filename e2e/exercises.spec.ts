import { test, expect } from "@playwright/test";
import {
  skipOnboarding,
  assertAccessible,
  enableExerciseFixture,
  type E2EExerciseFixture,
} from "./helpers";

// CI first-paint on the static export can be slow (wa-sqlite WASM + icon
// font initialization happens before React mounts). Use generous timeouts.
test.setTimeout(120_000);

// Deterministic fixture consumed by the app's E2E escape hatch in
// `lib/db/exercises.ts` (BLD-526). Keeps the visual baseline stable across
// CI runs regardless of real DB init timing. Covers 4 categories so the
// CATEGORY_LABELS chips + ordering are exercised; 5 rows fit above the fold
// on both mobile (390×844) and desktop (1280×800) viewports.
const EXERCISE_FIXTURE: E2EExerciseFixture[] = [
  {
    id: "fixture-bench-press",
    name: "Bench Press",
    category: "chest",
    primary_muscles: ["pectoralis_major"],
    secondary_muscles: ["triceps", "anterior_deltoid"],
    equipment: "barbell",
    instructions: "Press the barbell from your chest.",
    difficulty: "intermediate",
    is_custom: false,
  },
  {
    id: "fixture-bicep-curl",
    name: "Bicep Curl",
    category: "arms",
    primary_muscles: ["biceps"],
    secondary_muscles: ["brachialis"],
    equipment: "cable",
    instructions: "Curl the handle toward your shoulder.",
    difficulty: "beginner",
    is_custom: false,
  },
  {
    id: "fixture-lat-pulldown",
    name: "Lat Pulldown",
    category: "back",
    primary_muscles: ["latissimus_dorsi"],
    secondary_muscles: ["biceps", "rhomboids"],
    equipment: "cable",
    instructions: "Pull the bar down to chest level.",
    difficulty: "beginner",
    is_custom: false,
  },
  {
    id: "fixture-plank",
    name: "Plank",
    category: "abs_core",
    primary_muscles: ["rectus_abdominis"],
    secondary_muscles: ["obliques", "transverse_abdominis"],
    equipment: "bodyweight",
    instructions: "Hold a straight-body position on forearms.",
    difficulty: "beginner",
    is_custom: false,
  },
  {
    id: "fixture-squat",
    name: "Squat",
    category: "legs_glutes",
    primary_muscles: ["quadriceps", "glutes"],
    secondary_muscles: ["hamstrings"],
    equipment: "barbell",
    instructions: "Lower hips back and down, keep chest up.",
    difficulty: "intermediate",
    is_custom: false,
  },
];

// First item after sort-by-name (Bench Press) — used as the readiness anchor.
const FIRST_CARD_NAME = /bench press/i;

async function waitForExerciseList(page: import("@playwright/test").Page) {
  // ExerciseCard renders as a Pressable with accessibilityRole="button" and
  // its exercise name as the accessibility label. Waiting on the first
  // fixture row guarantees the FlatList has rendered, not just the static
  // chrome (filter chips / tab bar also report role=button).
  await page
    .getByRole("button", { name: FIRST_CARD_NAME })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  // Small settle delay so the detail pane (wide layouts) and row animations
  // stabilize before snapshot.
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  await enableExerciseFixture(page, EXERCISE_FIXTURE);
});

test.describe("Exercises tab", () => {
  test("visual snapshot of exercise list with filter chips", async ({ page }) => {
    await page.goto("/exercises");
    await waitForExerciseList(page);

    await expect(page).toHaveScreenshot("exercises-list.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("passes accessibility audit", async ({ page }, testInfo) => {
    await page.goto("/exercises");
    await waitForExerciseList(page);

    await assertAccessible(page, testInfo);
  });
});
