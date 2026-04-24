/**
 * BLD-560: Dev-only drizzle/SQLite query counter for perf investigation.
 *
 * Companion to `lib/dev/render-counter.ts`. Accepted criterion rolled from
 * BLD-553 QD review: the perf harness must report per-session drizzle query
 * invocation counts so we can catch N+1 patterns introduced by cascading
 * store updates (e.g. auto-prefill in BLD-542) before they ship.
 *
 * ## Usage
 *
 *   import { countQuery } from "@/lib/dev/query-counter";
 *
 *   // instrument a raw helper
 *   export async function query<T>(sql: string) {
 *     if (__DEV__) countQuery("query");
 *     // ...
 *   }
 *
 * ## Profiling window discipline (same as render-counter)
 *
 * Callers MUST call `resetQueryCounts()` at the start of each profiling
 * window. The module-level `startedAt` is set on first import or on the
 * most recent reset; if you never reset, the qpm denominator spans the
 * entire app lifetime and reports misleadingly low rates.
 *
 * Recommended shape:
 *
 *   resetQueryCounts();
 *   // ... run the workload ...
 *   dumpQueryCounts();
 *
 * ## Bundle hygiene
 *
 * All counter calls are gated by `__DEV__` so Metro removes references in
 * production bundles — see the bundle-hygiene pattern in
 * `verify-scenario-hook-not-in-bundle.sh`.
 */

const counts = new Map<string, number>();
let startedAt = Date.now();

/** Known kinds; free-form string accepted so callers can add domain tags. */
export type QueryKind =
  | "query"
  | "queryOne"
  | "execute"
  | "transaction"
  | "drizzle";

export function countQuery(kind: QueryKind | string): void {
  if (!__DEV__) return;
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

export function resetQueryCounts(): void {
  counts.clear();
  startedAt = Date.now();
}

/**
 * Dump query counts + rate-per-minute to the console.
 * Returns the snapshot for programmatic inspection (tests, harness).
 */
export function dumpQueryCounts(): Array<{
  kind: string;
  count: number;
  qpm: number;
}> {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const rows = Array.from(counts.entries())
    .map(([kind, count]) => ({
      kind,
      count,
      qpm: Math.round((count * 60000) / elapsedMs),
    }))
    .sort((a, b) => b.count - a.count);

  if (__DEV__) {
    const elapsedS = (elapsedMs / 1000).toFixed(1);
    // eslint-disable-next-line no-console
    console.log(`[query-counter] ${elapsedS}s elapsed`);
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.kind.padEnd(16)} ${String(r.count).padStart(6)} queries  (${r.qpm}/min)`,
      );
    }
  }
  return rows;
}
