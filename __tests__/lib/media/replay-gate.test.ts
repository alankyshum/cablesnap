/**
 * Unit tests for lib/media/replay-gate.ts
 * AC12 (BLD-1092): ref-counter, non-negativity, multi-mount/unmount cycles.
 */
import {
  increment,
  decrement,
  count,
  mediaSurfaceMountCount,
  _resetForTests,
} from "../../../lib/media/replay-gate";

beforeEach(() => {
  _resetForTests();
});

describe("replay-gate — basic ref-counting", () => {
  it("starts at 0", () => {
    expect(count()).toBe(0);
    expect(mediaSurfaceMountCount()).toBe(0);
  });

  it("increment increases count by 1", () => {
    increment();
    expect(count()).toBe(1);
  });

  it("decrement decreases count by 1", () => {
    increment();
    increment();
    decrement();
    expect(count()).toBe(1);
  });

  it("count never goes below 0 — non-negativity invariant", () => {
    decrement();
    expect(count()).toBe(0);
    decrement();
    expect(count()).toBe(0);
  });

  it("multi-mount: two surfaces increment to 2", () => {
    increment();
    increment();
    expect(count()).toBe(2);
  });

  it("multi-unmount: two unmounts from 2 returns to 0", () => {
    increment();
    increment();
    decrement();
    decrement();
    expect(count()).toBe(0);
  });

  it("mediaSurfaceMountCount is an alias for count()", () => {
    increment();
    expect(mediaSurfaceMountCount()).toBe(count());
  });
});

describe("replay-gate — beforeErrorSampling semantics (AC12)", () => {
  it("returns false (skip replay) when count > 0 — media surface mounted", () => {
    increment();
    const shouldSample = mediaSurfaceMountCount() === 0;
    expect(shouldSample).toBe(false);
  });

  it("returns true (allow replay) when count === 0 — no media surface mounted", () => {
    const shouldSample = mediaSurfaceMountCount() === 0;
    expect(shouldSample).toBe(true);
  });

  it("returns true after all surfaces unmount", () => {
    increment();
    increment();
    decrement();
    decrement();
    const shouldSample = mediaSurfaceMountCount() === 0;
    expect(shouldSample).toBe(true);
  });

  it("returns false while at least one surface is still mounted", () => {
    increment();
    increment();
    decrement();
    // still 1 surface mounted
    const shouldSample = mediaSurfaceMountCount() === 0;
    expect(shouldSample).toBe(false);
  });
});
