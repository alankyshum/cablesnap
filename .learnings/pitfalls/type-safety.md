# TypeScript Type Safety Pitfalls

## Learnings

### Double-Cast Through `unknown` for Unrelated Type Assertions
**Source**: BLD-112 — Fix 14 pre-existing TypeScript errors on main branch
**Date**: 2026-04-15
**Context**: Code cast `window as Record<string, unknown>` to access a custom property. TypeScript 5.x rejected this with TS2352 because `Window` and `Record<string, unknown>` have insufficient overlap.
**Learning**: When casting between two types with no structural overlap, TypeScript requires a two-step cast through `unknown`: `(value as unknown as TargetType)`. A single `as` fails when the source and target types are too different. This commonly occurs with `window`, `globalThis`, or DOM elements where you need to access injected properties.
**Action**: When adding custom properties to `window` or other global objects, always use the double-cast pattern: `(window as unknown as Record<string, unknown>).myProp`. Better yet, declare a global type augmentation in a `.d.ts` file to avoid casts entirely.
**Tags**: typescript, type-assertion, unknown, window, double-cast, TS2352

### `Array.includes()` Fails on Readonly Tuple Types
**Source**: BLD-112 — Fix 14 pre-existing TypeScript errors on main branch
**Date**: 2026-04-15
**Context**: A const array `[5, 10, 15, 20, 25, 35, 45] as const` was used with `.includes(num)` where `num: number`. TypeScript rejected this with TS2345 because the tuple's element type is the union literal `5 | 10 | 15 | ...`, not `number`.
**Learning**: TypeScript's `ReadonlyArray<T>.includes(searchElement: T)` requires the search argument to match `T` exactly. For `as const` arrays, `T` is a narrow literal union, so passing a `number` fails. The fix is to widen the array type at the call site: `(arr as readonly number[]).includes(num)`. This does NOT weaken runtime behavior — it only relaxes the compile-time check.
**Action**: When calling `.includes()` on a `const` array with a wider-typed variable, cast the array: `(constArr as readonly BaseType[]).includes(value)`. Avoid casting the value itself, as that hides potential type errors elsewhere.
**Tags**: typescript, array-includes, readonly, const-assertion, tuple, TS2345, type-narrowing

### Drizzle $inferSelect Does Not Cover JOIN Results or Union-Narrowed Types
**Source**: BLD-370 — Define Drizzle schema and replace manual Row types (schema-only, no query changes)
**Date**: 2026-04-19
**Context**: When replacing 10 manual Row types with Drizzle `$inferSelect` types, two categories of types could NOT be replaced: (1) types representing JOIN query results that combine columns from multiple tables (e.g., SetRow, TemplateExerciseRow, DailyLogRow), and (2) domain types that narrow a text column to a string literal union (e.g., StravaSyncLog with `status: "pending" | "synced" | "failed"` — Drizzle infers `string | null`).
**Learning**: `$inferSelect` produces the TypeScript type for a single-table SELECT *. It cannot express: (a) result shapes from JOINs that combine columns from multiple tables — these remain manually defined, and (b) columns where the domain type is narrower than the storage type (e.g., `text()` → `string`, but the domain needs `"a" | "b" | "c"`). Attempting to force these through `$inferSelect` either creates incorrect types or requires unsafe casts.
**Action**: When adopting Drizzle `$inferSelect`, audit Row types into three buckets: (1) single-table types → replace with `$inferSelect`, (2) JOIN result types → keep manual, (3) union-narrowed domain types → keep manual. Document which types remain manual and why, so future developers don't repeatedly attempt to replace them.
**Tags**: drizzle, inferSelect, type-safety, join, union-types, orm, typescript, manual-types
