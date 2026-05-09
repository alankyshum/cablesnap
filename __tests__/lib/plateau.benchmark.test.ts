/**
 * BLD-1122: Benchmark test for classifyPlateau.
 * Asserts median runtime ≤ 5ms for 4 sessions of data.
 */
import { classifyPlateau } from "../../lib/plateau";
import type { PlateauSessionRow } from "../../lib/plateau";

function makeRows(n: number): PlateauSessionRow[] {
  return Array.from({ length: n }, (_, i) => ({
    session_id: `s${i}`,
    started_at: i * 1000,
    top_set_weight: 80 + (i % 3) * 2.5,
    top_set_reps: 5,
    top_set_rpe: 7,
    avg_rpe: 7,
    all_completed: true,
    set_count: 3,
    bodyweight_modifier_kg: null,
  }));
}

describe("classifyPlateau — performance benchmark", () => {
  it("classifies 4 sessions in ≤ 5ms median over 100 iterations", () => {
    const sessions = makeRows(4);
    const ITERATIONS = 100;
    const timings: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      classifyPlateau(sessions, false, 2.5);
      timings.push(performance.now() - start);
    }

    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(ITERATIONS / 2)];
    expect(median).toBeLessThanOrEqual(5);
  });
});
