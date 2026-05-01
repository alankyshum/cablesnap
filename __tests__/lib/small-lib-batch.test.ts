/**
 * Consolidated small pure-logic lib tests.
 *
 * Merged from 5 individual test files to reduce jest startup overhead
 * (BLD-918). Each describe block preserves original assertions.
 *
 * Original files:
 *   - lib/theme-tokens.test.ts
 *   - lib/aggregate-muscles.test.ts
 *   - lib/muscle-theme.test.ts
 *   - lib/rest-constants.test.ts
 *   - lib/render-counter.test.ts
 */
import { Colors, lightColors, darkColors } from "../../theme/colors";
import { aggregateMuscles } from "../../lib/aggregate-muscles";
import type { MuscleGroup } from "../../lib/types";
import { muscle } from "../../constants/theme";
import { REST_MULTIPLIERS } from "../../lib/rest";
import {
  countRender,
  resetRenderCounts,
  dumpRenderCounts,
} from "../../lib/dev/render-counter";
import { csvEscape } from "../../lib/csv";
import { workoutCSV } from "../../lib/csv-format";
import type { WorkoutCSVRow } from "../../lib/db";
import { mlToOz, ozToMl, formatVolume, formatTotalOverGoal, MAX_SINGLE_ENTRY_ML, ML_PER_FL_OZ } from "../../lib/hydration-units";
import { manifest } from "../../assets/exercise-illustrations/manifest.generated";
import { PILOT_EXERCISE_IDS } from "../../assets/exercise-illustrations/pilot-ids";
import { formatDurationEstimate, formatSpokenDuration } from "../../lib/format";
import { RECOVERY_HOURS } from "../../lib/db/recovery";
import { SLUG_MAP } from "../../lib/muscle-map-utils";

// ── Theme color tokens ──────────────────────────────────────────

describe("Theme color tokens", () => {
  it("exports light and dark color sets", () => {
    expect(Colors.light).toBeDefined();
    expect(Colors.dark).toBeDefined();
  });

  it("has banner background tokens in both themes", () => {
    expect(lightColors.warningBanner).toBeDefined();
    expect(lightColors.errorBanner).toBeDefined();
    expect(darkColors.warningBanner).toBeDefined();
    expect(darkColors.errorBanner).toBeDefined();
  });

  it("has shadow and onToast tokens in both themes", () => {
    expect(lightColors.shadow).toBe("#000000");
    expect(darkColors.shadow).toBe("#000000");
    expect(lightColors.onToast).toBe("#FFFFFF");
    expect(darkColors.onToast).toBe("#FFFFFF");
  });

  it("has distinct banner colors for light and dark modes", () => {
    expect(lightColors.warningBanner).not.toBe(darkColors.warningBanner);
    expect(lightColors.errorBanner).not.toBe(darkColors.errorBanner);
  });
});

// ── aggregateMuscles ─────────────────────────────────────────────

describe("aggregateMuscles", () => {
  it("separates primary/secondary, deduplicates, and primary wins over secondary", () => {
    const simple = aggregateMuscles([
      { primary_muscles: ["chest" as MuscleGroup], secondary_muscles: ["triceps" as MuscleGroup] },
    ]);
    expect(simple.primary).toEqual(["chest"]);
    expect(simple.secondary).toEqual(["triceps"]);

    const empty = aggregateMuscles([]);
    expect(empty.primary).toEqual([]);
    expect(empty.secondary).toEqual([]);

    const multi = aggregateMuscles([
      { primary_muscles: ["chest" as MuscleGroup, "shoulders" as MuscleGroup], secondary_muscles: ["triceps" as MuscleGroup] },
      { primary_muscles: ["chest" as MuscleGroup], secondary_muscles: ["shoulders" as MuscleGroup, "core" as MuscleGroup] },
    ]);
    expect(multi.primary).toEqual(expect.arrayContaining(["chest", "shoulders"]));
    expect(multi.primary.filter((m) => m === "chest")).toHaveLength(1);
    expect(multi.secondary).toEqual(expect.arrayContaining(["triceps", "core"]));
    expect(multi.secondary).not.toContain("shoulders");
  });
});

// ── muscle theme colors ──────────────────────────────────────────

describe("muscle theme colors", () => {
  it("defines light mode colors", () => {
    expect(muscle.light.primary).toBeDefined();
    expect(muscle.light.secondary).toBeDefined();
    expect(muscle.light.inactive).toBeDefined();
    expect(muscle.light.outline).toBeDefined();
  });

  it("defines dark mode colors", () => {
    expect(muscle.dark.primary).toBeDefined();
    expect(muscle.dark.secondary).toBeDefined();
    expect(muscle.dark.inactive).toBeDefined();
    expect(muscle.dark.outline).toBeDefined();
  });

  it("light and dark colors differ for contrast", () => {
    expect(muscle.light.primary).not.toBe(muscle.dark.primary);
    expect(muscle.light.secondary).not.toBe(muscle.dark.secondary);
    expect(muscle.light.inactive).not.toBe(muscle.dark.inactive);
  });

  it("primary is red-family and secondary is orange-family", () => {
    expect(muscle.light.primary.toLowerCase()).toMatch(/^#[d-f]/);
    expect(muscle.light.secondary.toLowerCase()).toMatch(/^#f/);
  });
});

// ── REST_MULTIPLIERS v1 snapshot ─────────────────────────────────

describe("REST_MULTIPLIERS v1 snapshot", () => {
  it("set-type multipliers are frozen", () => {
    expect(REST_MULTIPLIERS.setType).toMatchInlineSnapshot(`
{
  "dropset": 0.1,
  "failure": 1.3,
  "normal": 1,
  "warmup": 0.3,
}
`);
  });

  it("RPE bucket multipliers are frozen", () => {
    expect(REST_MULTIPLIERS.rpe).toMatchInlineSnapshot(`
{
  "high": 1.15,
  "low": 0.8,
  "midOrNull": 1,
  "veryHigh": 1.3,
}
`);
  });

  it("category multipliers are frozen", () => {
    expect(REST_MULTIPLIERS.category).toMatchInlineSnapshot(`
{
  "bodyweight": 0.85,
  "cable": 0.8,
  "standard": 1,
}
`);
  });
});

// ── render-counter (BLD-553) ─────────────────────────────────────

describe("render-counter", () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  it("increments per name, sorts desc, resets, and emits integer rpm", () => {
    countRender("A");
    countRender("A");
    countRender("B");
    let rows = dumpRenderCounts();
    expect(rows.find((r) => r.name === "A")?.renders).toBe(2);
    expect(rows.find((r) => r.name === "B")?.renders).toBe(1);
    expect(rows[0].rpm).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(rows[0].rpm)).toBe(true);

    resetRenderCounts();
    countRender("low");
    for (let i = 0; i < 5; i++) countRender("high");
    countRender("mid");
    countRender("mid");
    rows = dumpRenderCounts();
    expect(rows.map((r) => r.name)).toEqual(["high", "mid", "low"]);

    resetRenderCounts();
    expect(dumpRenderCounts()).toEqual([]);
  });
});

// ── setup (infrastructure sanity) ───────────────────────────────

describe("Test infrastructure", () => {
  it("Jest is configured and running", () => {
    expect(1 + 1).toBe(2);
  });
});

// ── csvEscape ───────────────────────────────────────────────────

describe("csvEscape", () => {
  it("returns empty string for null", () => {
    expect(csvEscape(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(csvEscape(undefined)).toBe("");
  });

  it("passes through plain strings unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("Bench Press")).toBe("Bench Press");
  });

  it("converts numbers to strings", () => {
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(0)).toBe("0");
    expect(csvEscape(3.14)).toBe("3.14");
  });

  it("wraps strings containing commas in quotes", () => {
    expect(csvEscape("hello, world")).toBe('"hello, world"');
  });

  it("wraps strings containing newlines in quotes", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps strings containing double quotes and escapes them", () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
  });

  it("handles strings with both commas and quotes", () => {
    expect(csvEscape('"a", "b"')).toBe('"""a"", ""b"""');
  });

  it("handles empty string", () => {
    expect(csvEscape("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(csvEscape(",")).toBe('","');
    expect(csvEscape('"')).toBe('""""');
    expect(csvEscape("\n")).toBe('"\n"');
  });
});

// ── workoutCSV — bodyweight_modifier_kg (BLD-541) ───────────────

describe("workoutCSV — bodyweight_modifier_kg column (BLD-541)", () => {
  const base: Omit<WorkoutCSVRow, "bodyweight_modifier_kg"> = {
    date: "2026-04-20",
    exercise: "Pull-ups",
    set_number: 1,
    weight: 0,
    reps: 8,
    duration_seconds: null,
    notes: "",
    set_rpe: null,
    set_notes: "",
    link_id: null,
    tempo: null,
  };

  it.each([
    { name: "header includes column + positive modifier", modifier: 20, expected: "20" },
    { name: "assisted modifier", modifier: -15, expected: "-15" },
    { name: "null modifier", modifier: null, expected: "" },
    { name: "fractional modifier", modifier: 2.5, expected: "2.5" },
  ])("$name", ({ modifier, expected }) => {
    const row: WorkoutCSVRow = { ...base, bodyweight_modifier_kg: modifier };
    const out = workoutCSV([row]);
    const [header, data] = out.split("\n");
    expect(header).toBe(
      "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg"
    );
    const cells = data.split(",");
    expect(cells[cells.length - 1]).toBe(expected);
  });
});

// ── hydration-units ─────────────────────────────────────────────

describe("hydration-units", () => {
  it.each([
    [0, 0],
    [29.5735, 1],
    [250, 250 / ML_PER_FL_OZ],
    [2000, 2000 / ML_PER_FL_OZ],
    [5000, 5000 / ML_PER_FL_OZ],
  ])("mlToOz(%p) returns ~%p", (ml, expected) => {
    expect(mlToOz(ml)).toBeCloseTo(expected, 5);
  });

  it.each([
    [10, 10 * ML_PER_FL_OZ],
    [67, 67 * ML_PER_FL_OZ],
  ])("ozToMl(%p) returns ~%p", (oz, expected) => {
    expect(ozToMl(oz)).toBeCloseTo(expected, 5);
  });

  it("mlToOz/ozToMl is round-trip consistent", () => {
    for (const ml of [100, 250, 500, 750, 1000, 2000, MAX_SINGLE_ENTRY_ML]) {
      expect(ozToMl(mlToOz(ml))).toBeCloseTo(ml, 5);
    }
  });

  it("formatVolume returns integer ml with thousand separator and unit", () => {
    expect(formatVolume(2250, "ml")).toBe("2,250 ml");
    expect(formatVolume(0, "ml")).toBe("0 ml");
  });

  it("formatVolume returns one-decimal fl oz where useful", () => {
    expect(formatVolume(250, "fl_oz")).toBe("8.5 fl oz");
    expect(formatVolume(67 * ML_PER_FL_OZ, "fl_oz")).toBe("67 fl oz");
  });

  it("formatTotalOverGoal renders both halves in active unit", () => {
    expect(formatTotalOverGoal(1250, 2000, "ml")).toBe("1,250 / 2,000 ml");
    expect(formatTotalOverGoal(2250, 2000, "ml")).toBe("2,250 / 2,000 ml");
    const txt = formatTotalOverGoal(250, 2000, "fl_oz");
    expect(txt).toMatch(/fl oz$/);
    expect(txt).toContain("/");
  });

  it("exposes MAX_SINGLE_ENTRY_ML = 5000", () => {
    expect(MAX_SINGLE_ENTRY_ML).toBe(5000);
  });
});

// ── exercise-illustrations manifest (BLD-561) ──────────────────

describe("exercise-illustrations manifest", () => {
  it("has a valid module shape (empty or populated)", () => {
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe("object");
  });

  it("is deterministic-sorted by id (localeCompare)", () => {
    const ids = Object.keys(manifest);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("every present pilot entry has all four keys", () => {
    for (const id of PILOT_EXERCISE_IDS) {
      const entry = manifest[id];
      if (!entry) continue;
      expect(entry.start).toBeDefined();
      expect(entry.end).toBeDefined();
      expect(typeof entry.startAlt).toBe("string");
      expect(typeof entry.endAlt).toBe("string");
      expect(entry.startAlt.length).toBeGreaterThan(0);
      expect(entry.endAlt.length).toBeGreaterThan(0);
    }
  });

  it("has no stray non-pilot entries", () => {
    const pilotSet = new Set(PILOT_EXERCISE_IDS);
    for (const id of Object.keys(manifest)) {
      expect(pilotSet.has(id)).toBe(true);
    }
  });
});

// ── formatDurationEstimate / formatSpokenDuration ───────────────

describe("formatDurationEstimate", () => {
  it("returns ~5m for very short durations (< 5 min)", () => {
    expect(formatDurationEstimate(0)).toBe("~5m");
    expect(formatDurationEstimate(60)).toBe("~5m");
    expect(formatDurationEstimate(120)).toBe("~5m");
  });

  it("rounds to nearest 5 minutes", () => {
    expect(formatDurationEstimate(150)).toBe("~5m");
    expect(formatDurationEstimate(2700)).toBe("~45m");
    expect(formatDurationEstimate(2820)).toBe("~45m");
    expect(formatDurationEstimate(2940)).toBe("~50m");
  });

  it("formats exactly 60 minutes as ~1h", () => {
    expect(formatDurationEstimate(3600)).toBe("~1h");
  });

  it("formats hours and minutes", () => {
    expect(formatDurationEstimate(4500)).toBe("~1h 15m");
    expect(formatDurationEstimate(5400)).toBe("~1h 30m");
  });

  it("handles very long sessions (3+ hours)", () => {
    expect(formatDurationEstimate(10800)).toBe("~3h");
    expect(formatDurationEstimate(11700)).toBe("~3h 15m");
  });

  it("rounds boundary values correctly", () => {
    expect(formatDurationEstimate(450)).toBe("~10m");
    expect(formatDurationEstimate(750)).toBe("~15m");
    expect(formatDurationEstimate(1950)).toBe("~35m");
  });
});

describe("formatSpokenDuration", () => {
  it("returns 'approximately 5 minutes' for very short durations", () => {
    expect(formatSpokenDuration(60)).toBe("approximately 5 minutes");
  });

  it("returns 'approximately 45 minutes'", () => {
    expect(formatSpokenDuration(2700)).toBe("approximately 45 minutes");
  });

  it("returns 'approximately 1 hour' for exactly 60 min", () => {
    expect(formatSpokenDuration(3600)).toBe("approximately 1 hour");
  });

  it("returns 'approximately 1 hour 15 minutes'", () => {
    expect(formatSpokenDuration(4500)).toBe("approximately 1 hour 15 minutes");
  });

  it("returns 'approximately 2 hours' for 120 min", () => {
    expect(formatSpokenDuration(7200)).toBe("approximately 2 hours");
  });

  it("returns 'approximately 3 hours 15 minutes' for very long sessions", () => {
    expect(formatSpokenDuration(11700)).toBe("approximately 3 hours 15 minutes");
  });
});

// ── recovery + muscle-map-utils ─────────────────────────────────

describe("recovery", () => {
  describe("RECOVERY_HOURS", () => {
    it("defines thresholds for large muscle groups at 72h", () => {
      for (const m of ["quads", "hamstrings", "glutes", "lats", "traps", "back"]) {
        expect(RECOVERY_HOURS[m]).toBe(72);
      }
    });

    it("defines thresholds for medium muscle groups at 48h", () => {
      for (const m of ["chest", "shoulders"]) {
        expect(RECOVERY_HOURS[m]).toBe(48);
      }
    });

    it("defines thresholds for small muscle groups at 36h", () => {
      for (const m of ["biceps", "triceps", "forearms", "calves", "core"]) {
        expect(RECOVERY_HOURS[m]).toBe(36);
      }
    });

    it("does not include full_body", () => {
      expect(RECOVERY_HOURS["full_body"]).toBeUndefined();
    });
  });
});

describe("muscle-map-utils SLUG_MAP", () => {
  const allTrackable: MuscleGroup[] = [
    "chest", "back", "shoulders", "biceps", "triceps",
    "quads", "hamstrings", "glutes", "calves", "core",
    "forearms", "traps", "lats",
  ];

  it("maps every trackable muscle group to at least one slug", () => {
    for (const m of allTrackable) {
      expect(SLUG_MAP[m]).toBeDefined();
      expect(SLUG_MAP[m].length).toBeGreaterThan(0);
    }
  });

  it("maps full_body to many slugs", () => {
    expect(SLUG_MAP.full_body.length).toBeGreaterThan(10);
  });

  it("chest maps to chest slug", () => {
    expect(SLUG_MAP.chest).toEqual(["chest"]);
  });

  it("core maps to abs and obliques slugs", () => {
    expect(SLUG_MAP.core).toEqual(["abs", "obliques"]);
  });

  it("back maps to upper-back and lower-back", () => {
    expect(SLUG_MAP.back).toEqual(["upper-back", "lower-back"]);
  });

  it("all slug values are strings", () => {
    for (const m of Object.keys(SLUG_MAP) as MuscleGroup[]) {
      for (const slug of SLUG_MAP[m]) {
        expect(typeof slug).toBe("string");
      }
    }
  });
});
