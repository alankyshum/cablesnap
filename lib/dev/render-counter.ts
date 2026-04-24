/**
 * BLD-553: Dev-only render counter for battery/perf investigation.
 *
 * Usage (inside a component, gated by __DEV__):
 *
 *   import { countRender } from "@/lib/dev/render-counter";
 *   export function GroupCardHeader(props) {
 *     if (__DEV__) countRender("GroupCardHeader");
 *     // ...
 *   }
 *
 * ## Profiling window discipline (IMPORTANT)
 *
 * **Callers MUST call `resetRenderCounts()` at the start of each profiling
 * window.** The module-level `startedAt` is set on first import (or on the
 * most recent reset), so if you never reset, the rpm denominator spans the
 * entire app lifetime — not the interval you actually care about. A 10-render
 * burst that happened 30 minutes ago will report ~0 rpm even though it
 * corresponds to a real hot path during the window you meant to sample.
 *
 * Recommended shape:
 *
 *   resetRenderCounts();   // denominator starts now
 *   // ... run the workload (1 min real workout / N simulated ticks) ...
 *   dumpRenderCounts();    // reads counts / elapsed-since-last-reset
 *
 * Then from a React Native dev menu / console:
 *   require("@/lib/dev/render-counter").dumpRenderCounts();
 *
 * The counter is guarded by `__DEV__` at the call site so Metro removes all
 * references in production bundles (see verify-scenario-hook-not-in-bundle.sh
 * for the bundle-hygiene pattern). This file is still importable in prod
 * bundles but is a no-op there because callers never invoke it.
 *
 * To investigate BLD-553 (battery drain during workout):
 *   1. Instrument the suspected hot components (GroupCardHeader, SetRow,
 *      SessionHeaderToolbar) with `countRender("Name")` behind `__DEV__`.
 *   2. Call `resetRenderCounts()` immediately before starting the window.
 *   3. Run a real workout for ~1 min with timer active.
 *   4. Call `dumpRenderCounts()` — anything re-rendering >60x/min while idle
 *      is a hot path and a battery-drain candidate.
 *   5. After profiling, remove the instrumentation (or leave only behind a
 *      feature flag) so the prod bundle stays clean.
 */

const counts = new Map<string, number>();
let startedAt = Date.now();

export function countRender(name: string): void {
  if (!__DEV__) return;
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function resetRenderCounts(): void {
  counts.clear();
  startedAt = Date.now();
}

/**
 * Dump render counts + rate-per-minute to the console.
 * Returns the snapshot for programmatic inspection (tests).
 */
export function dumpRenderCounts(): Array<{
  name: string;
  renders: number;
  rpm: number;
}> {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const rows = Array.from(counts.entries())
    .map(([name, renders]) => ({
      name,
      renders,
      rpm: Math.round((renders * 60000) / elapsedMs),
    }))
    .sort((a, b) => b.renders - a.renders);

  if (__DEV__) {
    const elapsedS = (elapsedMs / 1000).toFixed(1);
    // eslint-disable-next-line no-console
    console.log(`[render-counter] ${elapsedS}s elapsed`);
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(`  ${r.name.padEnd(32)} ${String(r.renders).padStart(6)} renders  (${r.rpm}/min)`);
    }
  }
  return rows;
}
