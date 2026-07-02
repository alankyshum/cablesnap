/**
 * AC16 module-level lexeme-ban guard + no-directional-color guard
 * Training-Day Macro Adjustment (BLD-2641 PR5)
 *
 * Why this test exists:
 *   Coupling food to exercise is disordered-eating adjacent ("earn-your-food").
 *   The psychologist-binding criterion C1 prohibits 14 reward/penalty lexeme stems
 *   from appearing in ANY Training-Day copy. This test is the durable machine-readable
 *   enforcement of that prohibition.
 *
 *   The shipped copy (C2 verbatim) is already correct. This test GUARDS future edits:
 *   if a future contributor adds a banned word anywhere in BADGE_COPY or settings COPY,
 *   this test turns red before it ships.
 *
 * Pattern:
 *   Mirrors __tests__/help-copy-tone.test.ts (BLD-1176 ADVANCED_SET banlist — proven pattern).
 *   Imports copy constants directly from source (not rendered props) so every string
 *   in BADGE_COPY and settings COPY is scanned — labels, tap strings, settings body,
 *   off-ramp line, logged-workouts note.
 *
 * Critical false-positive guard:
 *   The approved C2 settings body contains the phrase
 *   "This is about fueling recovery, not a reward for exercising."
 *   The `reward` pattern uses a negative lookahead (?!\s+for exercising) so that
 *   the approved negation phrase is explicitly allowed, while reward-framing like
 *   "+250 reward" or "earned as a reward" remains banned.
 *
 * @see PLAN-BLD-2634.md §C1, AC16
 * @see BLD-2650 — test-guard gap fix issue
 * @see BLD-1176 — canonical pattern source (help-copy-tone.test.ts)
 */

import * as fs from "fs";
import * as path from "path";
import { BADGE_COPY } from "../components/nutrition/NutritionListHeader";
import { COPY } from "../app/settings/training-day-macros";

// ─── Source file paths for directional-color source scan ──────────────────────

const ROOT = path.resolve(__dirname, "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), "utf-8");
}

// ─── Build allCopy: flatten ALL string values from both exported objects ───────
// Include every surface where copy can appear: badge labels, minimal labels,
// tap strings (badge), settings body, off-ramp line, logged-workouts note.

const allCopy = [
  // Badge strings (NutritionListHeader)
  BADGE_COPY.trainingDayLabel,
  BADGE_COPY.trainingDayLabelMinimal,
  BADGE_COPY.restDayLabel,
  BADGE_COPY.restDayLabelMinimal,
  BADGE_COPY.trainingDayTap,
  BADGE_COPY.restDayTap,
  // Settings strings (training-day-macros settings screen)
  COPY.settingsOptInBody,
  COPY.offRampLine,
  COPY.loggedWorkoutsNote,
].join("\n");

// ─── BANLIST — 14 C1 stems ────────────────────────────────────────────────────
// Each entry: token name, \\b-bounded case-insensitive pattern, fail fixtures, pass fixtures.
// fail[] = strings that SHOULD be caught (pattern must match them).
// pass[] = strings that MUST NOT be caught (pattern must not match them).

interface BanEntry {
  token: string;
  pattern: RegExp;
  fails: string[];
  passes: string[];
}

const BANLIST: BanEntry[] = [
  // ── earn ─────────────────────────────────────────────────────────────────────
  {
    token: "earn",
    pattern: /\bearn\b/i,
    fails: ["earn your food", "You earn extra calories", "Earn a treat"],
    passes: ["earnings aside", "earning potential of training"],
  },
  // ── earned ───────────────────────────────────────────────────────────────────
  {
    token: "earned",
    pattern: /\bearned\b/i,
    fails: ["+250 earned", "You earned this", "earned bonus calories"],
    passes: ["unearned adjustment", "learning from training"],
  },
  // ── bonus ─────────────────────────────────────────────────────────────────────
  {
    token: "bonus",
    pattern: /\bbonus\b/i,
    fails: ["bonus calories", "+250 bonus", "no bonus on rest days"],
    passes: ["bonuses paid out separately", "no extra charge"],
  },
  // ── reward (with negative lookahead to allow approved "not a reward for exercising") ──
  {
    token: "reward",
    // Bans "reward" in reward-framing context.
    // Explicitly allows "not a reward for exercising" (approved C2 negation phrase).
    pattern: /\breward\b(?!\s+for exercising)/i,
    fails: ["+250 reward", "reward yourself", "reward for working out", "a reward day"],
    // The approved C2 phrase "not a reward for exercising" must NOT be caught.
    passes: ["not a reward for exercising", "a reward for exercising is not the goal"],
  },
  // ── treat ─────────────────────────────────────────────────────────────────────
  {
    token: "treat",
    pattern: /\btreat\b/i,
    fails: ["treat yourself", "treat calories", "treat day for training"],
    passes: ["treatment plan", "treats you get"],
  },
  // ── deserve ───────────────────────────────────────────────────────────────────
  {
    token: "deserve",
    pattern: /\bdeserv/i,
    fails: ["you deserve more calories", "deserve a treat", "deserved bonus"],
    passes: ["suitable for your goals", "appropriate adjustment"],
  },
  // ── penalty ───────────────────────────────────────────────────────────────────
  {
    token: "penalty",
    pattern: /\bpenalt/i,
    fails: ["penalty calories", "a penalty for rest days", "no penalty"],
    passes: ["penultimate step", "no reduction framing"],
  },
  // ── punish ────────────────────────────────────────────────────────────────────
  {
    token: "punish",
    pattern: /\bpunish/i,
    fails: ["punish yourself", "punishing rest days", "punishment for skipping"],
    passes: ["publish your results", "replenish stores"],
  },
  // ── unlock ────────────────────────────────────────────────────────────────────
  {
    token: "unlock",
    pattern: /\bunlock\b/i,
    fails: ["unlock more calories", "unlock training bonuses", "unlock your potential"],
    passes: ["lock in your target", "block your intake"],
  },
  // ── spend ─────────────────────────────────────────────────────────────────────
  {
    token: "spend",
    pattern: /\bspend\b/i,
    fails: ["spend your calories", "spend this budget", "calories to spend"],
    passes: ["spending time on recovery", "suspend adjustments"],
  },
  // ── burn it off ───────────────────────────────────────────────────────────────
  {
    token: "burn it off",
    pattern: /\bburn it off\b/i,
    fails: ["burn it off at the gym", "need to burn it off", "you can burn it off"],
    passes: ["burn off steam", "metabolic burn rate"],
  },
  // ── work it off ───────────────────────────────────────────────────────────────
  {
    token: "work it off",
    pattern: /\bwork it off\b/i,
    fails: ["work it off tomorrow", "work it off with exercise"],
    passes: ["work it out", "it works off a weekly average"],
  },
  // ── guilt ────────────────────────────────────────────────────────────────────
  {
    token: "guilt",
    pattern: /\bguilt/i,
    fails: ["guilt-free calories", "guilt about rest days", "no guilt needed"],
    passes: ["gilt edge training", "built around balance"],
  },
  // ── cheat ─────────────────────────────────────────────────────────────────────
  {
    token: "cheat",
    pattern: /\bcheat\b/i,
    fails: ["cheat day", "cheat calories", "no cheat days"],
    passes: ["heat from training", "each training day"],
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Training-Day Macro copy tone — AC16 lexeme-ban (14 C1 stems)", () => {
  it("BADGE_COPY and COPY are non-empty (sanity check — source imports work)", () => {
    // Ensure the imported objects are the real exported constants, not stubs.
    expect(typeof BADGE_COPY.trainingDayLabel).toBe("string");
    expect(BADGE_COPY.trainingDayLabel.length).toBeGreaterThan(0);
    expect(typeof COPY.settingsOptInBody).toBe("string");
    expect(COPY.settingsOptInBody.length).toBeGreaterThan(0);
    // allCopy must include the full settings body (proves join worked)
    expect(allCopy).toContain("fueling recovery");
  });

  it("allCopy covers all badge labels and tap strings (AC16 scope guard)", () => {
    expect(allCopy).toContain("Training day · fueled");
    expect(allCopy).toContain("Rest day · recovery");
    expect(allCopy).toContain("Higher target today because you trained");
    expect(allCopy).toContain("Recovery day — a bit lower to balance");
    expect(allCopy).toContain("Your weekly average is unchanged");
  });

  it.each(BANLIST)(
    "banned token «$token» is absent from all Training-Day copy",
    ({ pattern, fails, passes }) => {
      // 1. Pattern must catch the fail fixtures (validates regex correctness)
      for (const sample of fails) {
        expect(pattern.test(sample)).toBe(true);
      }
      // 2. Pattern must NOT catch the pass fixtures (validates false-positive guard)
      for (const sample of passes) {
        expect(pattern.test(sample)).toBe(false);
      }
      // 3. Production copy must not match — the actual AC16 enforcement
      expect(allCopy).not.toMatch(pattern);
    }
  );
});

// ─── AC16: No-directional-color source scan ────────────────────────────────────
//
// The badge component must use only neutral surface tokens for coloring calorie
// values and the badge itself. Directional color tokens (surplus, deficit, red,
// green, warning) encode whether the user is "good" or "bad" relative to a
// calorie target — the psychologist verdict prohibits this framing.
//
// This is a SOURCE-LEVEL scan: we verify the DayTypeBadge source does not
// contain any of the banned directional color token names. Any color applied
// to calorie values inside the badge must come from onSurface/onSurfaceVariant
// (neutral surface tokens), never from surplus/deficit/warning/error tokens.

describe("Training-Day badge — AC16 no-directional-color (source scan)", () => {
  const badgeSrc = readSrc("components/nutrition/NutritionListHeader.tsx");

  // Directional color token names that must NOT appear in the badge source.
  // These tokens encode "good/bad" calorie framing (surplus = green, deficit = red).
  const BANNED_COLOR_TOKENS = [
    "surplus",
    "deficit",
    "colors.error",
    "colors.warning",
    // Raw color strings that might bypass the token system
    //"#ff",    // too broad — omit to avoid false positives on valid hex
    "isAbove",    // common pattern used for conditional surplus/deficit coloring
    "isBelow",    // common pattern used for conditional deficit coloring
    "colorClass",
    "directionColor",
  ];

  it("DayTypeBadge does not use directional surplus/deficit color tokens (AC16)", () => {
    // Extract the DayTypeBadge function scope from source
    // (from the DayTypeBadge function definition to the end of the component)
    const badgeStart = badgeSrc.indexOf("function DayTypeBadge");
    expect(badgeStart).toBeGreaterThan(-1); // guard: function must exist

    const badgeScope = badgeSrc.slice(badgeStart);

    for (const token of BANNED_COLOR_TOKENS) {
      expect(badgeScope).not.toContain(token);
    }
  });

  it("DayTypeBadge uses only neutral surface color tokens (onSurface/onSurfaceVariant)", () => {
    const badgeStart = badgeSrc.indexOf("function DayTypeBadge");
    const badgeScope = badgeSrc.slice(badgeStart);

    // Badge MUST use onSurface and/or onSurfaceVariant — these are the neutral tokens
    const usesNeutralToken =
      badgeScope.includes("colors.onSurface") || badgeScope.includes("colors.onSurfaceVariant");
    expect(usesNeutralToken).toBe(true);
  });

  it("calorie values in badge are not conditionally colored (no ternary color on effectiveCals)", () => {
    const badgeStart = badgeSrc.indexOf("function DayTypeBadge");
    const badgeScope = badgeSrc.slice(badgeStart);

    // There must be no pattern like `effectiveCals > X ? color1 : color2`
    // which would encode directional calorie framing in the badge
    expect(badgeScope).not.toMatch(/effectiveCals\s*[><=!]+\s*\w+\s*\?\s*colors/);
    expect(badgeScope).not.toMatch(/baseCals\s*[><=!]+\s*\w+\s*\?\s*colors/);
  });
});
