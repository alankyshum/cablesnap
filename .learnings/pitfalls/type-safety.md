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

### ORM Schema File Alongside Migration File Is a Dual Source of Truth
**Source**: BLD-369 — Migrate database layer to Drizzle ORM for type safety
**Date**: 2026-04-19
**Context**: The Drizzle migration plan claimed `schema.ts` would be the "single source of truth" for types. TL review identified that `schema.ts` (Drizzle table definitions) and `migrations.ts` (runtime DDL statements) must both describe the same columns — creating TWO sources of truth that can drift independently, replacing the original manual-type drift problem with a schema-file drift problem.
**Learning**: Adding an ORM schema file (`schema.ts`) to a project that already has a runtime migration file (`migrations.ts`) does NOT create a single source of truth — it creates a dual source of truth. The ORM schema provides compile-time types; the migration file defines the actual runtime DDL. If either is updated without the other, columns will exist in types but not in the database (or vice versa). This is the SAME class of drift the ORM was meant to eliminate, moved one level up.
**Action**: When maintaining both `schema.ts` and `migrations.ts`, treat every schema change as a two-file atomic operation: update `migrations.ts` DDL AND `schema.ts` table definition in the same commit. Consider adding a CI check or startup assertion that validates `schema.ts` table definitions match the columns created by `migrations.ts`. Document this dual-update requirement prominently in the schema file header.
**Tags**: drizzle, schema-drift, dual-source-of-truth, migrations, orm, type-safety, consistency

### React Native Crashes on Bare Numeric Children Outside Text
**Source**: BLD-344 — FIX: Workout toolbox crashes on open (GitHub #198)
**Date**: 2026-04-19
**Context**: The Chip component passed numeric values as children (`{p}` where p is a number). The component only wrapped `typeof children === "string"` in a `<Text>` element, so numeric children rendered as bare values outside any Text — triggering "Text strings must be rendered within a <Text> component" crash on Android.
**Learning**: React Native does not auto-coerce numbers to text like React DOM. Any component that conditionally wraps children in `<Text>` based on `typeof children === "string"` will crash when passed numeric children. The typeof check must include `"number"`, or the call site must coerce with a template literal (`{`${value}`}`).
**Action**: When building custom components that conditionally wrap children in `<Text>`, always check `typeof children === "string" || typeof children === "number"`. Prefer the component-side fix over relying on callers to stringify — it eliminates an entire class of runtime crashes.
**Tags**: react-native, text, crash, typeof, children, number, chip, android
