/**
 * BLD-1122: Query-budget structural test for getPlateauWindowBatch.
 *
 * Verifies the two-step batching pattern by inspecting the implementation
 * source: confirms it does exactly 2 db.select() calls, not N per exercise.
 */
import fs from "fs";
import path from "path";

describe("getPlateauWindowBatch — query budget (structural)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../lib/db/exercise-history.ts"),
    "utf-8"
  );

  // Extract the function body (getPlateauWindowBatch)
  const fnStart = src.indexOf("export async function getPlateauWindowBatch");
  const fnEnd = src.indexOf("\nexport async function getPlateauWindow(", fnStart);
  const fnBody = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

  // Extract the helper region (BLD-1122 section, which includes buildSessionsMap)
  const sectionStart = src.indexOf("// ─── BLD-1122:");
  const sectionEnd = fnEnd > 0 ? fnEnd : src.length;
  const sectionBody = sectionStart >= 0 ? src.slice(sectionStart, sectionEnd) : fnBody;

  it("contains exactly 2 db.select() calls (2-query pattern, not N+1)", () => {
    const selectCalls = (fnBody.match(/\.select\s*\(/g) ?? []).length;
    expect(selectCalls).toBe(2);
  });

  it("uses inArray() for exercise_id filtering (not a per-exercise loop of queries)", () => {
    expect(fnBody).toMatch(/inArray\s*\(\s*workoutSets\.exercise_id/);
  });

  it("uses inArray() for session_id filtering in step 2 (not per-session queries)", () => {
    expect(fnBody).toMatch(/inArray\s*\(\s*workoutSets\.session_id/);
  });

  it("limits sessions per exercise in JS (not SQL LIMIT per row)", () => {
    // The n-limiting logic lives in buildSessionsMap (extracted helper) which
    // is part of the same BLD-1122 section and is called by getPlateauWindowBatch.
    expect(sectionBody).toMatch(/\.length\s*<\s*n/);
  });

  it("returns a Map (not a plain object)", () => {
    expect(fnBody).toMatch(/new Map</);
    expect(fnBody).toMatch(/: Promise<Map<string/);
  });
});
