/**
 * @jest-environment node
 */
/**
 * BLD-1170 / BLD-1186: Architecture invariants for workout_sets and workout_set_segments write-path.
 *
 * These tests enforce the architectural constraint that:
 *   1. Only lib/db/sets.ts may write directly to workout_set_segments (insert/update/delete).
 *   2. No code in hooks/ or components/ bypasses the DB layer to write to workout_sets directly.
 *   3. The specific session-sets.ts write functions that affect volume (updateSet,
 *      updateSetsBatch, updateSetWarmup, updateSetType, updateSetStackMarker,
 *      updateSetManualWeight) no longer contain direct db.update(workoutSets) calls —
 *      they delegate to lib/db/sets.ts.
 *   4. lib/db/sessions.ts db.update(workoutSets) calls are limited to non-volume
 *      functions only — applyEditUpdate MUST delegate to lib/db/sets.ts
 *      (updateSetForSessionEdit), not write workoutSets directly.
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
// AC #267 (BLD-1170 scope — write-path ban): Only lib/db/sets.ts may call
// db.update(workoutSets) for volume-affecting fields. lib/db/session-sets.ts
// retains db.update(workoutSets) for NON-volume fields (notes, tempo, rpe,
// duration, variant, etc.) — explicitly allowed.
//
// lib/db/sessions.ts retains db.update(workoutSets) ONLY for:
//   - swapExerciseInSession / undoSwapInSession (exercise_id swaps — non-volume)
//   - renumberSessionSets (set_number only — non-volume)
// applyEditUpdate MUST NOT contain db.update(workoutSets) — it delegates to
// updateSetForSessionEdit in lib/db/sets.ts (BLD-1186).
//
// Per tech-lead ruling (BLD-1170, 2026-05-11): AC #267 is split between slices:
//   - BLD-1170 (this slice): write-path ban — db.update(workoutSets) exclusivity
//   - BLD-1174 (analytics slice): formula ban — raw weight*reps / e1RM formulas
// The formula ban is out of scope here and will be enforced by BLD-1174.

describe("Architecture: db.update(workoutSets) only from approved files (BLD-1170 AC#267)", () => {
  it("no file outside lib/db/sets.ts, lib/db/session-sets.ts, and lib/db/sessions.ts calls db.update(workoutSets)", () => {
    // lib/db/session-sets.ts is explicitly allowed because it retains legitimate
    // non-volume writes (notes, tempo, duration, rpe, variant, etc.). The individual
    // volume-write functions in session-sets.ts are verified by Test 3 above.
    // lib/db/sessions.ts is explicitly allowed because it contains non-volume writes
    // (exercise_id swaps and set_number renumbering). The applyEditUpdate function
    // in sessions.ts is verified below (Test 5) to have NO db.update(workoutSets).
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
        "Only lib/db/sets.ts (volume writes), lib/db/session-sets.ts (non-volume writes),\n" +
        "and lib/db/sessions.ts (swap + renumber only) may call db.update(workoutSets).\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });
});

// ─── Test 5: sessions.ts applyEditUpdate delegates to sets.ts (BLD-1186) ─────
//
// applyEditUpdate is the only function in sessions.ts that writes
// volume-affecting columns (weight, reps, set_type). After BLD-1186 it must
// delegate all writes to updateSetForSessionEdit in lib/db/sets.ts, so there
// is no direct db.update(workoutSets) inside its body.
//
// The ALLOWED functions in sessions.ts that may retain db.update(workoutSets):
//   - swapExerciseInSession   (exercise_id swap — non-volume)
//   - undoSwapInSession       (exercise_id undo — non-volume)
//   - renumberSessionSets     (set_number only — non-volume)

describe("Architecture: sessions.ts applyEditUpdate delegates to sets.ts (BLD-1186)", () => {
  const sessionsContent = readFile("lib/db/sessions.ts");

  function extractFunctionBody(source: string, funcName: string): string {
    // Match both `export async function foo` and `async function foo`
    const pattern = new RegExp(
      `(?:export )?async function ${funcName}\\b[^{]*\\{`,
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

  it("applyEditUpdate does not contain direct db.update(workoutSets)", () => {
    const body = extractFunctionBody(sessionsContent, "applyEditUpdate");
    expect(body).not.toBe(""); // function must exist
    expect(body).not.toMatch(/\bdb\.update\(workoutSets\)/);
  });

  it("applyEditUpdate calls updateSetForSessionEdit from lib/db/sets.ts", () => {
    const body = extractFunctionBody(sessionsContent, "applyEditUpdate");
    expect(body).not.toBe(""); // function must exist
    expect(body).toMatch(/\bupdateSetForSessionEdit\b/);
  });

  // Verify the non-volume functions that are allowed to retain db.update(workoutSets)
  const ALLOWED_WITH_DIRECT_UPDATE = [
    "swapExerciseInSession",
    "undoSwapInSession",
    "renumberSessionSets",
  ];

  for (const funcName of ALLOWED_WITH_DIRECT_UPDATE) {
    it(`${funcName} still uses db.update(workoutSets) for non-volume writes`, () => {
      const body = extractFunctionBody(sessionsContent, funcName);
      expect(body).not.toBe(""); // function must exist
      expect(body).toMatch(/\bdb\.update\(workoutSets\)/);
    });
  }
});

// ─── Test 6: sessions.ts — column-based ban on volume writes (BLD-1201) ───────
//
// Test 5 (above) is function-name-based: it checks that the NAMED functions
// applyEditUpdate / swapExerciseInSession / undoSwapInSession / renumberSessionSets
// behave correctly. But if a NEW function is added to lib/db/sessions.ts that
// writes weight / reps / set_type directly via db.update(workoutSets), neither
// Test 4 nor Test 5 would catch it.
//
// This test enforces a column-based invariant: NO call to
// db.update(workoutSets).set({...}) in lib/db/sessions.ts may include the
// volume-affecting columns weight, reps, set_type (or set_type underscore form).
// The allowlist is zero — if the column appears in the .set({}) argument, it fails.

describe("Architecture: sessions.ts — no volume-column writes via db.update(workoutSets) (BLD-1201)", () => {
  const sessionsContent = readFile("lib/db/sessions.ts");

  it("no db.update(workoutSets).set(...) in sessions.ts writes weight, reps, or set_type", () => {
    // Find every occurrence of `db.update(workoutSets)` in the file.
    // For each, extract the subsequent `.set({ ... })` argument text and
    // fail if it contains any volume-affecting column name.
    //
    // Match both explicit key-value syntax (`weight: expr`) and shorthand
    // property syntax (`{ weight, reps }`) — the shorthand form is detected
    // by requiring the identifier to be followed by a comma, closing brace,
    // or end-of-line without a colon (the colon arm covers explicit values).
    const VOLUME_COLUMNS =
      /\b(?:weight|reps|set_type|setType)(?:\s*:|(?=\s*[,}\n\r]))/;
    const updatePattern = /db\.update\(workoutSets\)/g;
    const violations: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = updatePattern.exec(sessionsContent)) !== null) {
      const afterMatch = sessionsContent.slice(match.index);

      // Find the opening `{` of the `.set({` call — walk forward to `.set(`
      const setCallStart = afterMatch.indexOf(".set(");
      if (setCallStart === -1) continue;

      // Capture balanced braces starting from the `{` after `.set(`
      const braceStart = afterMatch.indexOf("{", setCallStart);
      if (braceStart === -1) continue;

      let depth = 1;
      let pos = braceStart + 1;
      while (pos < afterMatch.length && depth > 0) {
        if (afterMatch[pos] === "{") depth++;
        else if (afterMatch[pos] === "}") depth--;
        pos++;
      }
      const setContent = afterMatch.slice(braceStart, pos);

      if (VOLUME_COLUMNS.test(setContent)) {
        const lineNum = sessionsContent.slice(0, match.index).split("\n").length;
        violations.push(
          `lib/db/sessions.ts:${lineNum}: ${afterMatch.slice(0, 120).trim()}`
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "lib/db/sessions.ts: db.update(workoutSets) with volume-affecting columns (weight/reps/set_type).\n" +
        "All volume writes in sessions.ts MUST route through updateSetForSessionEdit() in lib/db/sets.ts.\n" +
        "This ensures recomputeSetCaches() is always invoked after every volume mutation.\n\n" +
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
