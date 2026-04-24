/**
 * BLD-553: Unit tests for the dev-only render counter.
 */
import {
  countRender,
  resetRenderCounts,
  dumpRenderCounts,
} from "../../lib/dev/render-counter";

describe("render-counter", () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  it("increments per name, sorts desc, resets, and emits integer rpm", () => {
    // increment
    countRender("A");
    countRender("A");
    countRender("B");
    let rows = dumpRenderCounts();
    expect(rows.find((r) => r.name === "A")?.renders).toBe(2);
    expect(rows.find((r) => r.name === "B")?.renders).toBe(1);
    expect(rows[0].rpm).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(rows[0].rpm)).toBe(true);

    // sort order (on a fresh reset)
    resetRenderCounts();
    countRender("low");
    for (let i = 0; i < 5; i++) countRender("high");
    countRender("mid");
    countRender("mid");
    rows = dumpRenderCounts();
    expect(rows.map((r) => r.name)).toEqual(["high", "mid", "low"]);

    // reset clears
    resetRenderCounts();
    expect(dumpRenderCounts()).toEqual([]);
  });
});
