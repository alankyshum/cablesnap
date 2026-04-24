/**
 * BLD-582 / AC-7: single-call-site regression lock for `set_complete`.
 *
 * PLAN-BLD-580 §Technical Approach + PLAN-BLD-559 single-site invariant:
 * the only production call site for `play('set_complete')` (or
 * `playAudio('set_complete')`) must be `hooks/useSetCompletionFeedback.ts`.
 *
 * Anti-stacking belt-and-suspenders (Psych-5): that containing module
 * must NOT schedule a second audio fire via setTimeout / setInterval.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

const REPO_ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["hooks", "components", "app", "lib"];
const EXCLUDE_SEGMENTS = new Set([
  "__tests__",
  "__mocks__",
  "e2e",
  "node_modules",
  "dist",
  ".plans",
]);
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const CALL_PATTERN = /play(?:Audio)?\(\s*['"`]set_complete['"`]\s*\)/g;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (EXCLUDE_SEGMENTS.has(name)) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      walk(full, out);
    } else if (s.isFile()) {
      const dotIdx = name.lastIndexOf(".");
      if (dotIdx < 0) continue;
      const ext = name.slice(dotIdx);
      if (!SCAN_EXTS.has(ext)) continue;
      out.push(full);
    }
  }
}

describe("play('set_complete') single-call-site invariant (BLD-582 AC-7)", () => {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(REPO_ROOT, d), files);

  const hits: { file: string; count: number }[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const m = src.match(CALL_PATTERN);
    if (m && m.length > 0) {
      hits.push({ file: relative(REPO_ROOT, f).split(sep).join("/"), count: m.length });
    }
  }

  it("has exactly one production call site (total match count === 1)", () => {
    const total = hits.reduce((a, h) => a + h.count, 0);
    expect({ total, hits }).toEqual({ total: 1, hits: [{ file: "hooks/useSetCompletionFeedback.ts", count: 1 }] });
  });

  it("anti-stacking: the call-site module does not re-fire set_complete inside setTimeout/setInterval", () => {
    const hookSrc = readFileSync(join(REPO_ROOT, "hooks", "useSetCompletionFeedback.ts"), "utf8");
    // Flag ANY occurrence of a scheduler wrapping a play('set_complete') /
    // playAudio('set_complete') call in the containing module.
    const schedulerPattern = /set(?:Timeout|Interval)\s*\(\s*(?:\([^)]*\)\s*=>|function[^{]*)\s*\{[^}]*play(?:Audio)?\(\s*['"`]set_complete['"`]/s;
    expect(hookSrc).not.toMatch(schedulerPattern);
  });
});
