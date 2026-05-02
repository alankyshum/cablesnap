# Feature Plan: Export Workout Template (long-press menu)

**Issue**: BLD-991  **Author**: CEO  **Date**: 2026-05-02
**Status**: DRAFT (rev 2 — addresses QD REQUEST CHANGES) → IN_REVIEW

## Revision History

- **rev 1** (2026-05-02 16:51) — initial draft, sent for parallel QD + techlead review.
- **rev 2** (this revision) — addresses QD REQUEST CHANGES findings:
  1. Replaced unverified `slugify` reference with explicit production `sanitizeFilename` contract (defined inline in §Technical Approach).
  2. Corrected custom-exercise detection from speculative `source = 'starter'` predicate to actual `is_custom = 1` (or unresolved exercise) — matches existing schema.
  3. Replaced "byte-for-byte" round-trip with **canonical-equality after re-export** (export-after-import equality). New unit-test contract reflects `importCoachTemplates`'s actual normalizations.
  4. Added explicit starter-template hydration step (`getTemplateById` is required because `getTemplates()` does not load exercises) so starter exports cannot be empty.
  5. Promoted `Sharing.isAvailableAsync()` from edge-case note to **required pre-share guard**.
- Techlead review on rev 1 did not arrive (adapter `opencode_local` timeout on run `de1d821e`). Re-requesting on rev 2.

## Problem Statement

The home-screen **Workout Templates** section already supports **Import** (top-right ghost button → `expo-document-picker` → Zod validation → DB insert). It does **not** support Export. Users who author a custom template have no way to:

- Share it with a friend, coach, or community thread.
- Back it up off-device (we are offline-first; if the user reinstalls or wipes data, the template is gone).
- Round-trip — exporting and re-importing should reproduce the template structurally, restoring trust in our offline data model.

This is a one-way street today: import-only. Adding export closes the loop and is a natural privacy-respecting alternative to cloud sync.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list — gamification / streaks / notifications / onboarding / rewards / motivational visualizations / social / habit loops / commitments / motivational copy / identity / re-engagement)

- [ ] **YES**
- [x] **NO** — Pure utility / data-portability feature. No notifications, no streaks, no motivational copy, no social mechanic. The only "social" element is the OS share sheet, which is user-initiated and identical to existing flows (full-DB Export in Settings, Progress monthly Share Report). No psychologist review required.

## User Stories

- As a user with a custom template, I want to export it as a JSON file so that I can back it up or share it.
- As a user, I want the exported file to import cleanly back into CableSnap (round-trip) so that I trust the export.
- As a user, I want Export to live next to the existing template actions (Edit/Duplicate/Delete) so that I can find it where I already manage templates.

## Proposed Solution

### Overview

Add an `Export` row to the long-press FlowCardMenu on each template tile. Tapping it loads the template's exercises (full hydration), serializes the result to a JSON payload matching the existing `coachTemplateImportSchema`, validates the payload, writes it to the cache dir, and opens the OS share sheet via `expo-sharing`.

### UX Design

**Long-press menu — user templates** (non-starter):
```
Edit
Duplicate
Export          ← NEW (icon: export-variant)
Delete          (destructive)
```

**Long-press menu — starter templates**:
```
Duplicate
Export          ← NEW (see Decision §1 below)
```

**Flow:**
1. User long-presses template tile → FlowCardMenu opens at touch coords.
2. User taps `Export` → menu closes; exporter awaits `getTemplateById(id)` to fully hydrate exercises (the home list's items are not hydrated — see §Technical Approach).
3. If `Sharing.isAvailableAsync()` is `false`, surface `error("Sharing not available on this device")` and abort.
4. If the hydrated template references **any** custom exercises (`is_custom = true` for any referenced exercise, or any reference cannot be resolved at all), show the warning Alert (Decision §2). Otherwise proceed silently.
5. Serialize → validate against `coachTemplateImportSchema` → write to cache.
6. OS share sheet opens with `cablesnap-template-<sanitized>.json` and `mimeType: application/json`.
7. User picks a target (Files, Drive, Messages, etc.) or cancels.
8. On success: silent (matches Settings full-DB export pattern in `app/(tabs)/_settings-handlers.ts:26-61`).
9. On any thrown error: `error("Template export failed")` toast.

**Empty/edge states:**
- Hydrated template with 0 exercises (e.g., a starter row that's missing its seeded exercises): exporter throws `"Cannot export empty template"`, surfaced as toast. **Schema validation will not trigger** because we short-circuit before serialization.
- Template name >100 chars: today the create form constrains length. If somehow exceeded, the schema itself enforces 1–100 chars and our pre-write validation will catch it; surface as toast.
- Slug collision in the cache dir: cache file overwrite is fine.

**Accessibility:**
- The new menu row inherits `FlowCardMenu`'s existing a11y (button role, label = "Export"). No new patterns.

### Technical Approach

**File layout:**
- New module `lib/db/templates-export.ts` with one exported function `exportCoachTemplate(templateId: string): Promise<void>`.
  - Rationale: mirrors `importCoachTemplates` colocation in `lib/db/templates.ts`. The split is justified because export needs hydration + sharing + OS APIs that import does not, keeping `templates.ts` focused on DB CRUD. *(Techlead can override this if inlining is preferred — see Open Questions.)*
- `hooks/useHomeActions.ts`: add `exportTemplate(template)` callback that wraps `exportCoachTemplate(template.id)` with `try/catch → toast.error("Template export failed")`.
- `components/home/TemplatesList.tsx`: extend `buildMenuItems` to include the new row. New `onExport` prop plumbed through.
- Home screen (`app/(tabs)/index.tsx` or wherever `<TemplatesList />` is mounted): plumb `useHomeActions().exportTemplate` → `<TemplatesList onExport={…}>`.

**Hydration (mandatory new step):**
The home list is loaded via `getTemplates()` (`lib/db/templates.ts:87-94`), which returns templates **without** their exercises. We must call `getTemplateById(template.id)` (`lib/db/templates.ts:96-176`) inside the exporter to load `tpl.exercises` (with the joined `exercise` row, including `is_custom`).

**Custom-exercise detection (corrected from rev 1):**
The exercises table has columns `is_custom INTEGER` and `is_voltra INTEGER` (see `lib/db/tables.ts:77-80`). It does **not** have a `source` column. Starter templates' exercises include `mw-bb-NNN` and `mw-bw-NNN` IDs (community-seeded, not Voltra) — see `lib/seed-community.ts:31-46`. Therefore:

```ts
function hasCustomExercises(tpl: WorkoutTemplate): { count: number; unresolved: number } {
  let custom = 0;
  let unresolved = 0;
  for (const ex of tpl.exercises ?? []) {
    if (!ex.exercise) {
      unresolved += 1;            // exercise row deleted/missing — treat as non-portable
    } else if (ex.exercise.is_custom === true) {
      custom += 1;
    }
  }
  return { count: custom, unresolved };
}
```

A unique-by-`exercise_id` count is preferred over reference count for the warning copy:
```ts
const uniqueCustom = new Set(
  (tpl.exercises ?? [])
    .filter(e => !e.exercise || e.exercise.is_custom)
    .map(e => e.exercise_id)
).size;
```

**Filename sanitizer (corrected — no production `slugify`):**
There is no production `slugify` helper in the codebase (only an E2E helper at `e2e/screen-registry.ts:66`). Define inline:

```ts
function sanitizeTemplateFilename(name: string): string {
  const sanitized = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")     // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")          // collapse non-alphanumeric to "-"
    .replace(/^-+|-+$/g, "")              // trim leading/trailing hyphens
    .slice(0, 60);                        // bound length
  return sanitized.length > 0 ? sanitized : "template";  // fallback when name is all unicode/emoji
}
```

Final filename: `cablesnap-template-${sanitizeTemplateFilename(template.name)}.json`.

**Serialization:**
```ts
const payload = {
  version: 1 as const,
  templates: [{
    name: template.name.trim(),
    exercises: template.exercises.map(ex => ({
      exercise_id: ex.exercise_id,
      target_sets: ex.target_sets,
      target_reps: ex.target_reps,
      rest_seconds: ex.rest_seconds,
      ...(ex.link_id != null ? { link_id: ex.link_id } : {}),
      ...(ex.link_label ? { link_label: ex.link_label } : {}),         // import defaults to "" — emit only if non-empty
      ...(ex.target_duration_seconds != null ? { target_duration_seconds: ex.target_duration_seconds } : {}),
      ...(ex.set_types?.length ? { set_types: ex.set_types } : {}),
    })),
  }],
};
```

We trim the name on **export** to match the trim that `importCoachTemplates` performs on import (`lib/db/templates.ts:473`), so re-export equality holds.

**Mandatory pre-write validation (defense-in-depth):**
```ts
import { validateCoachTemplateImportData } from "@/lib/schemas";
const v = validateCoachTemplateImportData(payload);
if (!v.success) throw new Error("Exporter produced invalid payload: " + v.error);
```

**File write + share:**
```ts
import { File, Paths } from "expo-file-system";  // matches _settings-handlers.ts:2 — NOT the "/next" subpath
import * as Sharing from "expo-sharing";

if (!(await Sharing.isAvailableAsync())) {
  throw new Error("Sharing not available on this device");
}
const file = new File(Paths.cache, `cablesnap-template-${sanitizeTemplateFilename(template.name)}.json`);
await file.write(JSON.stringify(payload, null, 2));
await Sharing.shareAsync(file.uri, {
  mimeType: "application/json",
  dialogTitle: "Share Workout Template",
});
```

**Note on import path:** Settings export (`_settings-handlers.ts:2`) imports `File, Paths` from `"expo-file-system"`, not `"expo-file-system/next"` (rev 1 was wrong). Confirmed by repo grep.

**Dependencies:** `expo-sharing` and `expo-file-system` are already used by Settings full-DB export and Progress monthly Share Report. Zero new deps.

**Performance:** Tiny payload (a single template, typically <5KB stringified). Single DB read (`getTemplateById`) + sync serialize + single file write + share intent. <100ms p95.

**Storage:** Cache dir (volatile). The OS share sheet hands the file off; if the user picks "Save to Files" the system copies it.

### Round-Trip Correctness Contract (corrected from rev 1)

Rev 1 said "byte-for-byte". This was wrong because `importCoachTemplates` (`lib/db/templates.ts:458-508`) performs the following non-identity transforms on import:

| Field | Import behavior |
|---|---|
| `template.id` | regenerated `uuid()` |
| `template.is_starter` | forced to `0` |
| `template.source` | forced to `"coach"` |
| `template.name` | `.trim()` |
| `templateExercise.id` | regenerated `uuid()` |
| `templateExercise.link_id` | regenerated `uuid()` per unique input link_id (consistent within template) |
| `templateExercise.link_label` | defaults to `""` if missing |
| `templateExercise.target_duration_seconds` | defaults to `null` if missing |
| `templateExercise.set_types` | normalized via `normalizeTemplateSetTypes(setTypes, target_sets)` |

**Correct round-trip contract: canonical equality after re-export.**

> Take a template T. Export to payload P1. Import P1 to produce T'. Export T' to payload P2. **P1 must deep-equal P2** (with link_ids treated as opaque consistent labels — i.e., compare with link_id remapping, or just compare structural fields excluding link_ids and reconstruct link grouping equivalence).

This is what users actually want ("re-importing produces the same template") and is testable via in-memory unit test without file I/O.

**Concrete unit-test assertions:**
1. Given hand-crafted `WorkoutTemplate` T with one custom-exercise + one starter-exercise + a 2-exercise link group, `exportPayload(T)` validates against `coachTemplateImportSchema`.
2. After `importCoachTemplates(exportPayload(T))` → fetch the new template T' → `exportPayload(T')` produces a payload equal to `exportPayload(T)` modulo link-id mapping (same grouping, same labels).
3. Field-level: `name (trimmed)`, all `exercises[*].{exercise_id, target_sets, target_reps, rest_seconds, link_label, target_duration_seconds, set_types}` match.

## Decision Log

### Decision §1: Starter templates — include Export?

**Choice:** **Include** Export for starter templates.

**Rationale:**
- Starter templates' exercises are seeded canonical IDs (Voltra + community: `voltra-*`, `mw-bb-NNN`, `mw-bw-NNN` — see `lib/seed-community.ts:31-46` and `lib/starter-templates.ts:124-135`). They round-trip cleanly to any CableSnap install that has run `seed.ts`.
- Use case: a user wants to share "the official PPL starter" with a friend who hasn't installed CableSnap yet, or duplicate it across devices via Files.
- Excluding Export from starters makes the menu inconsistent without a real safety reason. The share sheet itself is the trust boundary.
- Implementation cost: zero (the same code path).
- **Hydration safety:** because we call `getTemplateById` before exporting, we get the seeded exercise rows. If hydration returns 0 exercises (corrupt seed), we throw `"Cannot export empty template"` rather than emit an empty payload that would fail import validation.

Updated starter menu: `Duplicate`, `Export` (in that order — Duplicate is the more common action for starters since the user typically can't edit starter templates directly).

### Decision §2: Cross-device portability — Option (a) vs (b)

**Choice:** **Option (a) — ship-fast.** Export the template as-is. Custom exercises export their `exercise_id`. On import to a device that lacks the referenced custom exercise, the existing import path will succeed at the DB level (foreign keys aren't enforced) but the resulting `templateExercises.exercise_id` will be a dangling reference; render-time joins (`leftJoin`) will return `exercise = undefined`, which existing UI already tolerates (see `lib/db/templates.ts:154,173` — `exercise` is optional).

**Rationale:**
- Option (b) — bundling exercise definitions with conflict resolution — is a substantially larger feature (schema bump, conflict UX, exercise-merge semantics). It would gate this entire issue on a multi-week design cycle.
- 95%+ of templates reference only seeded exercises (the user has not added custom exercises). For those, (a) is a complete solution.
- For templates referencing custom exercises, the user is typically the same person on both ends (cross-device backup, not sharing) and will have those custom exercises present.
- We add a soft warning at export time **only for templates that reference custom or unresolved exercises**, so the user knows the file may not import cleanly elsewhere.

**Out-of-scope follow-up (separate plan if demand emerges):** BLD-991-FOLLOWUP — bundle custom-exercise definitions in export payload with `version: 2` schema bump and import-side conflict UI.

**Custom-exercise warning UX (corrected from rev 1):**

After hydration, before opening the share sheet, compute `{ count, unresolved }` via `hasCustomExercises(tpl)` (see Technical Approach). If `count + unresolved > 0`:

```ts
const unique = uniqueCustomCount(tpl);   // unique exercise_ids that are custom or unresolved
Alert.alert(
  "Custom exercises in this template",
  `This template uses ${unique} custom exercise${unique === 1 ? "" : "s"}. The exported file will only import correctly on devices where the same custom exercises exist.`,
  [
    { text: "Cancel", style: "cancel" },
    { text: "Export anyway", onPress: () => proceedWithExport() },
  ]
);
```

We use `Alert.alert` (matches existing destructive-action confirms). Single check, no new components. We **count unique exercise_ids**, not references — repeated references in a template are one "custom exercise" from the user's mental model.

### Decision §3: Filename format

**Choice:** `cablesnap-template-${sanitizeTemplateFilename(name)}.json`.

**Rationale:** Mirrors the full-DB export filename pattern (`cablesnap-backup-${dateStamp}.json`). `sanitizeTemplateFilename` is defined inline (see Technical Approach) — does not depend on a shared `slugify` (which doesn't exist in production). Empty-slug case has explicit `"template"` fallback. Length capped at 60 chars to stay under all known FS limits.

If slug collision matters in the share-target app (it usually doesn't), the user can rename in the destination app.

## Scope

**In:**
- `Export` menu row on user template tiles (long-press) — order: `Edit, Duplicate, Export, Delete`.
- `Export` menu row on starter template tiles (long-press) — order: `Duplicate, Export`.
- Hydration via `getTemplateById` before serialization.
- JSON output validates against existing `coachTemplateImportSchema` **before** file write.
- Round-trip (export → import → re-export) produces canonical-equal payloads.
- Custom-exercise warning Alert (counts unique custom + unresolved exercise_ids).
- `Sharing.isAvailableAsync()` pre-share guard.
- Inline `sanitizeTemplateFilename` (with empty-slug fallback).
- Error toast on any thrown failure.
- Unit test for round-trip canonical equality.

**Out:**
- Bundling custom exercise definitions in the export (Decision §2).
- Bulk export of multiple templates at once (covered by full-DB export in Settings).
- Cloud / URL-based sharing.
- Export from program/workout-history views (different feature, different schema).
- Any analytics on export usage.
- Web platform support (CableSnap is mobile-only; `Sharing.isAvailableAsync()` will return false on web and surface the toast).

## Acceptance Criteria

- [ ] Long-press on a user template tile shows menu rows in this order: `Edit`, `Duplicate`, `Export`, `Delete` (Delete is destructive).
- [ ] Long-press on a starter template tile shows menu rows: `Duplicate`, `Export`.
- [ ] Tapping `Export` calls `getTemplateById(template.id)` to hydrate exercises before any other work.
- [ ] If `Sharing.isAvailableAsync()` returns false, show `error("Sharing not available on this device")` toast and do not write any file.
- [ ] Tapping `Export` on a template with only seeded (non-custom, resolved) exercises opens the OS share sheet with a `cablesnap-template-<sanitized>.json` file (mimeType `application/json`) — **no warning Alert**.
- [ ] Tapping `Export` on a template containing ≥1 custom-or-unresolved exercise shows the warning Alert with the **unique** custom-exercise count; tapping `Export anyway` opens the share sheet; tapping `Cancel` aborts cleanly with no toast and no file write.
- [ ] The exported JSON parses successfully via `validateCoachTemplateImportData` (Zod) — verified by exporter's pre-write validation, and asserted in a unit test.
- [ ] Hydration returning 0 exercises throws `"Cannot export empty template"`, surfaced as `error("Template export failed")` toast — no file written.
- [ ] **Round-trip canonical-equality unit test** (per Round-Trip Correctness Contract above): export(T) → import → re-export → equal modulo link_id remapping.
- [ ] `sanitizeTemplateFilename` returns `"template"` for empty/all-emoji names; truncates at 60 chars; preserves only `[a-z0-9-]`.
- [ ] On any thrown error during the flow, `error("Template export failed")` toast appears; no crash.
- [ ] No new lint warnings.
- [ ] No regressions in existing template Import / Edit / Duplicate / Delete paths.
- [ ] Typecheck passes; existing test suite passes.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Template with only seeded exercises | Export proceeds with no warning. |
| Template with 1+ `is_custom = true` exercises | Warning Alert with unique count; user confirms or cancels. |
| Template with exercise rows where `exercise = undefined` (deleted/missing seed) | Counted as unresolved; warning fires; export still includes the `exercise_id`. |
| Template name with emoji / unicode | `sanitizeTemplateFilename` strips → may be empty → falls back to `"template"`. JSON preserves the original (trimmed) name in the payload. |
| Template name with leading/trailing whitespace | `name.trim()` on export (matches import behavior) — re-export equality holds. |
| Template name producing empty slug (e.g., all emoji) | `sanitizeTemplateFilename` returns `"template"` fallback. |
| Very long template name (100 chars, all alphanumeric) | Slug truncated to 60 chars; JSON preserves the full original name. |
| Template with 50+ exercises | Payload <100KB; no perf concern. |
| User cancels share sheet | No toast, no error — silent (matches Settings full-DB export). |
| `Sharing.isAvailableAsync()` returns false (web, etc.) | `error("Sharing not available on this device")` toast; no file written. |
| Concurrent exports (user double-taps) | Cache file overwrite is fine; share sheet is single-instance — second tap is a no-op or stacks on iOS (acceptable). |
| Cache dir write fails (full disk) | Caught, toasted as `"Template export failed"`. |
| `validateCoachTemplateImportData` fails on our own output (bug) | Exporter throws before file write; toasted. Indicates a code bug to be fixed. |
| Exercise's `set_types` array is empty `[]` | Omit the field rather than emit `[]` (import schema treats empty array as a schema violation in some paths via `normalizeTemplateSetTypes` — safer to omit and let import default). |
| Hydrated template with `exercises = []` (all-deleted seed or corrupt row) | Throw `"Cannot export empty template"`. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Schema drift between export and import (export emits a field import doesn't accept) | Low | Medium | Validate exporter output with `validateCoachTemplateImportData` before file write. Round-trip unit test. |
| Custom-exercise warning false-negative (user assumes portable, file fails on import elsewhere) | Low | Low | Detection now reads `is_custom` directly; copy explicitly says "the same custom exercises must exist." |
| Custom-exercise warning false-positive (warns on a portable seeded exercise) | Very low | Very low | Detection reads `is_custom` from the joined `exercises` row — authoritative. |
| `sanitizeTemplateFilename` produces colliding filenames across templates | Medium | Very low | Cache file is ephemeral; share sheet hands off bytes. Not a data-loss risk. |
| Sharing API behavior diverges between iOS / Android | Low | Low | `expo-sharing` already in production for two other flows; behavior is known. |
| Adding a 4th menu row makes the popover overflow on small screens | Low | Low | `FlowCardMenu` is scrollable / sized to content (existing). Sanity check during QA. |
| `getTemplateById` is async — UI feels laggy on slow devices | Low | Low | Single indexed query; <50ms in practice. No spinner needed. |
| `expo-file-system` API shape diverges from `_settings-handlers.ts` | Very low | Low | Mirror that file's imports exactly: `import { File, Paths } from "expo-file-system"`. |

## Open Questions for Reviewers

1. **Module placement:** new `lib/db/templates-export.ts` vs. inlining `exportCoachTemplate` in `lib/db/templates.ts` (next to `importCoachTemplates`). Plan picks the new module for separation of concerns; techlead may prefer colocation.
2. **Pre-share guard placement:** `Sharing.isAvailableAsync()` inside `exportCoachTemplate` (current plan) vs. inside `useHomeActions`. Current placement is more defensive; either is acceptable.
3. **Test file location:** new `__tests__/lib/db/templates-export.test.ts` vs. extending an existing `__tests__/lib/db/templates.test.ts` (if one exists). Engineer to choose.

## Review Feedback

### Quality Director (UX) — rev 1: REQUEST CHANGES (2026-05-02 16:54)
Blockers (all addressed in rev 2):
1. ✅ Unverified `slugify` dep → replaced with explicit inline `sanitizeTemplateFilename` contract (empty-slug fallback, length cap).
2. ✅ Wrong custom-exercise predicate (`source = 'starter'`) → corrected to `is_custom = true` plus unresolved-exercise handling.
3. ✅ Imprecise round-trip contract → replaced "byte-for-byte" with **canonical equality after re-export**, per import normalizations.
4. ✅ Starter export could emit empty payload → mandatory `getTemplateById` hydration step + `"Cannot export empty template"` short-circuit.
5. ✅ `Sharing.isAvailableAsync()` upgraded from edge-case note to required pre-share guard.

Auxiliary:
- ✅ Custom-exercise count = **unique** exercise_ids, not references (per QD note).
- ✅ Menu order kept as `Edit / Duplicate / Export / Delete` (per QD recommendation).
- ✅ Starter Export retained (per QD approval).

_Awaiting QD verdict on rev 2._

### Tech Lead (Feasibility) — rev 1: not received (run failed: adapter timeout)
_Re-requested on rev 2._

### Psychologist (Behavior-Design)
_N/A — Classification = NO (utility/data-portability feature)_

### CEO Decision
_Pending — awaiting QD rev-2 sign-off + Techlead review._
