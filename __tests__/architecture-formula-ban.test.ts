/**
 * @jest-environment node
 */
/**
 * BLD-1191: Architecture formula-ban grep-test (AC #267, second half).
 *
 * AC #267 scope split (per techlead/CEO ruling 2026-05-11T23:58Z + 2026-05-12T00:07Z):
 *   - BLD-1170: db.update(workoutSets) exclusivity (enforced in architecture-set-write-path.test.ts)
 *   - BLD-1174 → BLD-1191: formula ban — weight*reps / weight*(1+reps/30)
 *
 * These formulas are banned outside the approved paths because analytics and
 * hook files MUST read from the pre-computed cached_volume_kg / cached_e1rm_kg
 * columns written by lib/db/sets.ts, not recompute values ad-hoc. Ad-hoc
 * computation silently breaks for advanced-set types (rest_pause, cluster,
 * myo_reps) where segments are aggregated differently than a single parent row.
 *
 * APPROVED formula sites (exempted from this test):
 *   - lib/db/sets.ts — the ONLY authorised computation path; writes cached cols
 *   - lib/rm.ts — pure canonical 1RM formula definitions (imported by external callers)
 *   - lib/db/migrations.ts — historical SQL backfill migration; append-only
 */

import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";

const PROJECT_ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), "utf8");
}

function findFiles(pattern: string, ignore: string[] = []): string[] {
  return glob.sync(pattern, {
    cwd: PROJECT_ROOT,
    absolute: false,
    ignore: ["node_modules/**", "dist/**", "__tests__/**", ...ignore],
  }).filter((relPath) => fs.statSync(path.join(PROJECT_ROOT, relPath)).isFile());
}

/**
 * Strip single-line `//` comments from TypeScript source before pattern matching
 * so that documentation comments referencing the banned patterns (e.g.
 * "// fallback to weight*reps for legacy rows") do not trigger false positives.
 */
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const commentIdx = line.indexOf("//");
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join("\n");
}

/**
 * Patterns matching inline ad-hoc formula computation.
 *
 * We match the literal parameter names `weight` and `reps` to target
 * the specific banned patterns identified in AC #267:
 *   - volume:  weight * reps   (any spacing)
 *   - e1RM:    weight * (1 + reps / 30)  (Epley formula, any spacing)
 *
 * Note: lib/db/sets.ts itself uses renamed locals (`w`, `r`, `segWeight`,
 * `seg.reps`) so it is not matched by these patterns even without exemption —
 * but it is still included in the exemption list for clarity and future safety.
 */
const BANNED_FORMULA_PATTERNS = [
  // Raw volume: weight * reps
  /\bweight\s*\*\s*reps\b/,
  // Epley e1RM: weight * (1 + reps / 30)
  /\bweight\s*\*\s*\(\s*1\s*\+\s*reps\s*\/\s*30\s*\)/,
];

/**
 * Files that are explicitly permitted to contain the above patterns.
 * See module-level comment for rationale on each exemption.
 */
const EXEMPT_FILES = new Set([
  "lib/db/sets.ts",
  "lib/rm.ts",
  "lib/db/migrations.ts",
]);

describe("Architecture: formula ban — weight*reps / weight*(1+reps/30) outside approved paths (BLD-1191)", () => {
  const allFiles = findFiles("{lib,hooks}/**/*.{ts,tsx}", [...EXEMPT_FILES]);

  it("no lib/ or hooks/ file outside the approved set contains an inline volume formula (weight * reps)", () => {
    const violations: string[] = [];

    for (const relPath of allFiles) {
      const content = stripLineComments(readFile(relPath));
      if (BANNED_FORMULA_PATTERNS[0].test(content)) {
        violations.push(relPath);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "Inline volume formula 'weight * reps' found outside approved paths.\n" +
        "Analytics and hook files MUST read cached_volume_kg from the DB;\n" +
        "they must NOT recompute volume ad-hoc (breaks advanced set types).\n" +
        "Route all set mutations through lib/db/sets.ts.\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });

  it("no lib/ or hooks/ file outside the approved set contains an inline e1RM formula (weight * (1 + reps / 30))", () => {
    const violations: string[] = [];

    for (const relPath of allFiles) {
      const content = stripLineComments(readFile(relPath));
      if (BANNED_FORMULA_PATTERNS[1].test(content)) {
        violations.push(relPath);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        "Inline Epley e1RM formula 'weight * (1 + reps / 30)' found outside approved paths.\n" +
        "Analytics and hook files MUST read cached_e1rm_kg from the DB;\n" +
        "they must NOT recompute e1RM ad-hoc (breaks advanced set types with >12 reps).\n" +
        "Route all set mutations through lib/db/sets.ts.\n\n" +
        "Violations:\n" + violations.map((v) => `  - ${v}`).join("\n")
      );
    }
  });
});
