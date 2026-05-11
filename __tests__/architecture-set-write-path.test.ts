/**
 * @jest-environment node
 */
/**
 * BLD-1170: Architecture invariants for workout_sets and workout_set_segments write-path.
 *
 * These tests enforce the architectural constraint that:
 *   1. Only lib/db/sets.ts may write directly to workout_set_segments (insert/update/delete).
 *   2. No code in hooks/ or components/ bypasses the DB layer to write to workout_sets directly.
 *   3. The specific session-sets.ts write functions that affect volume (updateSet,
 *      updateSetsBatch, updateSetWarmup, updateSetType, updateSetStackMarker,
 *      updateSetManualWeight) no longer contain direct db.update(workoutSets) calls —
 *      they delegate to lib/db/sets.ts.
 *
 * If any of these tests fail, it means a new write site was added without routing
 * through recomputeSetCaches(), which would silently desync cached_volume_kg /
 * cached_e1rm_kg from the actual segment data.
 */

import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";

const PROJECT_ROOT = path.resolve(__dirname, "..");

/** Read the text content of a file relative to project root. */
function readFile(relPath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), "utf8");
}

/** Find all .ts/.tsx files matching a glob pattern under PROJECT_ROOT. */
function findFiles(pattern: string, ignore: string[] = []): string[] {
  return glob.sync(pattern, {
    cwd: PROJECT_ROOT,
    absolute: false,
    ignore: ["node_modules/**", "dist/**", "__tests__/**", ...ignore],
  }).filter((relPath) => fs.statSync(path.join(PROJECT_ROOT, relPath)).isFile());
}

// ─── Test 1: workout_set_segments DML is exclusive to lib/db/sets.ts ─────────

const SEGMENT_DML_PATTERNS = [
  /db\.(insert|update|delete)\(workoutSetSegments\)/,
  /INSERT\s+INTO\s+workout_set_segments/i,
  /UPDATE\s+workout_set_segments/i,
  /DELETE\s+FROM\s+workout_set_segments/i,
];

describe("Architecture: workout_set_segments write-path exclusivity (BLD-1170)", () => {
  it("no file outside lib/db/sets.ts writes directly to workout_set_segments", () => {
    const allTsFiles = findFiles("**/*.{ts,tsx}", ["lib/db/sets.ts"]);
    const violations: string[] = [];

    for (const relPath of allTsFiles) {
      const content = readFile(relPath);
      for (const pattern of SEGMENT_DML_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: matches ${pattern}`);
          break;
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "workout_set_segments DML found outside lib/db/sets.ts.\n" +
        "All segment mutations MUST route through lib/db/sets.ts so that\n" +
        "recomputeSetCaches() runs and keeps cached_volume_kg / cached_e1rm_kg in sync.\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });
});

// ─── Test 2: hooks/ do not directly write to workout_sets schema ──────────────
//
// Hooks should call lib/db functions, not bypass the abstraction layer by
// importing and writing to the schema table directly.

describe("Architecture: hooks do not bypass DB layer for workout_sets (BLD-1170)", () => {
  it("no hook file calls db.update(workoutSets) or db.insert(workoutSets) directly", () => {
    const hookFiles = findFiles("hooks/**/*.{ts,tsx}");
    const violations: string[] = [];

    const DIRECT_DB_PATTERNS = [
      /db\.(update|insert)\(workoutSets\)/,
      /UPDATE\s+workout_sets/i,
    ];

    for (const relPath of hookFiles) {
      const content = readFile(relPath);
      for (const pattern of DIRECT_DB_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: matches ${pattern}`);
          break;
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "Direct workout_sets writes found in hooks/.\n" +
        "Hooks must call lib/db/ functions, not write to workout_sets directly.\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });

  it("no component file calls db.update(workoutSets) or db.insert(workoutSets) directly", () => {
    const componentFiles = findFiles("components/**/*.{ts,tsx}");
    const violations: string[] = [];

    const DIRECT_DB_PATTERNS = [
      /db\.(update|insert)\(workoutSets\)/,
    ];

    for (const relPath of componentFiles) {
      const content = readFile(relPath);
      for (const pattern of DIRECT_DB_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: matches ${pattern}`);
          break;
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "Direct workout_sets writes found in components/.\n" +
        "Components must call lib/db/ functions, not write to workout_sets directly.\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });
});

// ─── Test 4: repo-wide db.update(workoutSets) exclusivity to lib/db/sets.ts ──
//
// AC #267 (partial — write-path half): Only lib/db/sets.ts may call
// db.update(workoutSets) for volume-affecting fields. session-sets.ts retains
// db.update(workoutSets) for NON-volume fields (notes, tempo, rpe, duration,
// variant, etc.) — those are intentional and excluded via per-file allowlist.
//
// NOTE: The e1RM formula ban (`weight * reps`, `weight * (1 + reps/30)`) is NOT
// enforced here because the analytics surfaces (lib/db/e1rm-trends.ts,
// lib/db/monthly-report.ts, etc.) still use raw formulas pending BLD-1174
// (Slice 5: analytics surfaces → cached columns). Adding that check here would
// break CI before BLD-1174 merges. The formula ban will be enforced by BLD-1174's
// architecture test once those files are migrated to read cached_volume_kg /
// cached_e1rm_kg directly.

describe("Architecture: db.update(workoutSets) only from approved files (BLD-1170 AC#267)", () => {
  it("no file outside lib/db/sets.ts and lib/db/session-sets.ts calls db.update(workoutSets)", () => {
    // lib/db/session-sets.ts is explicitly allowed because it retains legitimate
    // non-volume writes (notes, tempo, duration, rpe, variant, etc.). The individual
    // volume-write functions in session-sets.ts are verified by Test 3 above.
    // lib/db/sessions.ts is explicitly allowed because it contains:
    //   - swapExerciseInSession / undoSwapInSession (exercise_id swaps — non-volume)
    //   - applyEditUpdate (inside editCompletedSession transaction — recomputed post-TX)
    //   - set renumbering (set_number — non-volume)
    const APPROVED_FILES = new Set([
      "lib/db/sets.ts",
      "lib/db/session-sets.ts",
      "lib/db/sessions.ts",
    ]);
    const allTsFiles = findFiles("**/*.{ts,tsx}");
    const violations: string[] = [];

    for (const relPath of allTsFiles) {
      if (APPROVED_FILES.has(relPath)) continue;
      const content = readFile(relPath);
      if (/\bdb\.update\(workoutSets\)/.test(content)) {
        violations.push(relPath);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "db.update(workoutSets) found outside approved files.\n" +
        "Only lib/db/sets.ts (volume writes) and lib/db/session-sets.ts (non-volume writes)\n" +
        "may call db.update(workoutSets). All other callers must use a lib/db/sets.ts helper.\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });
});

//
// Verify that the specific functions in session-sets.ts that update volume-affecting
// fields no longer contain direct db.update(workoutSets) calls. They must delegate
// to lib/db/sets.ts to guarantee recomputeSetCaches() is invoked.

describe("Architecture: session-sets.ts volume-write delegation to sets.ts (BLD-1170)", () => {
  const sessionSetsContent = readFile("lib/db/session-sets.ts");

  /**
   * Extract the body of a function by finding it with a simple heuristic:
   * find the function declaration line, then capture until the matching closing brace.
   * This is intentionally simple — it works for these specific functions.
   */
  function extractFunctionBody(source: string, funcName: string): string {
    const pattern = new RegExp(
      `export async function ${funcName}\\b[^{]*\\{`,
    );
    const match = pattern.exec(source);
    if (!match) return "";

    let depth = 1;
    let pos = match.index + match[0].length;
    const start = pos;
    while (pos < source.length && depth > 0) {
      if (source[pos] === "{") depth++;
      else if (source[pos] === "}") depth--;
      pos++;
    }
    return source.slice(start, pos - 1);
  }

  const VOLUME_WRITE_FUNCTIONS = [
    "updateSetsBatch",
    "updateSet",
    "updateSetRepsAndDuration",
    "updateSetWarmup",
    "updateSetType",
    "updateSetStackMarker",
    "updateSetManualWeight",
  ];

  for (const funcName of VOLUME_WRITE_FUNCTIONS) {
    it(`${funcName} does not contain direct db.update(workoutSets)`, () => {
      const body = extractFunctionBody(sessionSetsContent, funcName);
      expect(body).not.toBe(""); // function must exist
      expect(body).not.toMatch(/\bdb\.update\(workoutSets\)/);
    });
  }
});
