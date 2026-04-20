import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for interaction log limit (reduced to 5 per GH #236).
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../../lib/db/settings.ts"),
  "utf-8"
);

describe("interaction log limits", () => {
  it("insertInteraction prunes to 5 entries", () => {
    expect(src).toMatch(/ORDER BY timestamp DESC LIMIT 5/);
  });

  it("getInteractions returns up to 5 entries", () => {
    expect(src).toMatch(/\.limit\(5\)/);
  });

  it("does NOT use time-based pruning", () => {
    // Per CEO directive: count-based only, no 60-second window
    expect(src).not.toMatch(/timestamp\s*<\s*\?.*60/);
    expect(src).not.toMatch(/strftime.*60/);
  });
});
