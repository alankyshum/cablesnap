/**
 * BLD-559 AC-12 (static-source grep regression lock).
 *
 * `hooks/usePRCelebration.ts` must NOT contain:
 *   - `Haptics.impact`
 *   - `Haptics.notification`
 *   - any import or require of `lib/audio`
 *
 * This locks the ownership-inversion guarantee: set-completion is the
 * sole haptic + audio site. Future well-meaning refactors that re-add a
 * PR-specific haptic will trip this test and must go through psych
 * re-review per `.plans/PLAN-BLD-559.md`.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE_PATH = join(__dirname, "..", "..", "hooks", "usePRCelebration.ts");

describe("usePRCelebration regression lock (BLD-559)", () => {
  // Load outside the loop so a read failure surfaces as a single clear
  // error rather than repeated I/O errors per pattern.
  const source = readFileSync(SOURCE_PATH, "utf8");
  // Strip full-line code comments so the in-file doc-comment that NAMES
  // the banned APIs (for future readers) does not defeat the regression
  // lock. Comment content is documentation, not executable behavior.
  const executable = source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith("//")) return false;
      if (t.startsWith("*")) return false;
      if (t.startsWith("/*")) return false;
      return true;
    })
    .join("\n");

  const BANNED: ReadonlyArray<{ label: string; pattern: RegExp }> = [
    { label: "Haptics.impact", pattern: /Haptics\.impact/ },
    { label: "Haptics.notification", pattern: /Haptics\.notification/ },
    { label: "import from lib/audio", pattern: /from\s+['"][^'"]*lib\/audio['"]/ },
    { label: "require of lib/audio", pattern: /require\(\s*['"][^'"]*lib\/audio['"]/ },
  ];

  it.each(BANNED.map((b) => [b.label, b.pattern] as const))(
    "executable source contains no %s",
    (_label, pattern) => {
      expect(executable).not.toMatch(pattern);
    }
  );
});
