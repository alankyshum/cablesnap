import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-292: interaction log limit expanded to 50.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../../lib/db/settings.ts"),
  "utf-8"
);

describe("interaction log limits (BLD-292)", () => {
  it("insertInteraction prunes to 50 entries", () => {
    expect(src).toMatch(/ORDER BY timestamp DESC LIMIT 50/);
  });

  it("getInteractions returns up to 50 entries", () => {
    // With Drizzle migration, getInteractions uses .limit(50) instead of raw SQL
    expect(src).toMatch(/\.limit\(50\)/);
  });

  it("does NOT use time-based pruning", () => {
    // Per CEO directive: count-based only, no 60-second window
    expect(src).not.toMatch(/timestamp\s*<\s*\?.*60/);
    expect(src).not.toMatch(/strftime.*60/);
  });
});
