# Feature Plan: Export Workout Template (long-press menu)

**Issue**: BLD-991  **Author**: CEO  **Date**: 2026-05-02
**Status**: DRAFT → IN_REVIEW

## Problem Statement

The home-screen **Workout Templates** section already supports **Import** (top-right ghost button → `expo-document-picker` → Zod validation → DB insert). It does **not** support Export. Users who author a custom template have no way to:

- Share it with a friend, coach, or community thread.
- Back it up off-device (we are offline-first; if the user reinstalls or wipes data, the template is gone).
- Round-trip — exporting and re-importing should reproduce the template byte-for-byte, restoring trust in our offline data model.

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

Add an `Export` row to the long-press FlowCardMenu on each user template tile. Tapping it serializes the template to a JSON payload matching the existing `coachTemplateImportSchema`, writes it to the cache dir, and opens the OS share sheet via `expo-sharing`.

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
2. User taps `Export` → menu closes, brief processing (no spinner needed; serialization is sync + tens of ms for the file write).
3. OS share sheet opens with `cablesnap-template-<slug>.json` and `mimeType: application/json`.
4. User picks a target (Files, Drive, Messages, etc.) or cancels.
5. On success: silent (matches Settings full-DB export pattern in `app/(tabs)/_settings-handlers.ts:26-61`).
6. On error: `error("Template export failed")` toast (matches existing import-error UX copy register).

**Empty/edge states:**
- Template with 0 exercises: should not occur (templates require exercises by construction; `coachTemplateImportSchema` enforces `.min(1)`). If it somehow happens, the schema's own `.min(1)` will be violated by our exporter — we add a guard that errors with `"Cannot export empty template"` and short-circuits.
- Template name >100 chars: trim/truncate-on-export is wrong (data loss). The template was created in-app, where the create form already constrains name length. If a future migration loosens the constraint, we surface the schema error verbatim.
- Slug collision in the cache dir: the cache file is overwritten each export — acceptable (it's the cache).

**Accessibility:**
- The new menu row inherits `FlowCardMenu`'s existing a11y (button role, label = "Export"). No new patterns.

### Technical Approach

**File layout:**
- New module `lib/db/templates-export.ts` with one exported function `exportCoachTemplate(template: WorkoutTemplate): Promise<void>`.
  - Rationale: mirrors `lib/db/templates-import.ts` (already exists for import) and keeps `useHomeActions` thin.
- `hooks/useHomeActions.ts`: add `exportTemplate` callback that wraps `exportCoachTemplate` with toast on error.
- `components/home/TemplatesList.tsx`: extend `buildMenuItems` signature with an `onExport` callback and prepend the row (Edit / Duplicate / **Export** / Delete order matches the flow above).
- Home screen (`app/(tabs)/index.tsx` or wherever `<TemplatesList />` is mounted): plumb `useHomeActions().exportTemplate` → `<TemplatesList onExport={…}>`.

**Serialization:**
```ts
const payload = {
  version: 1 as const,
  templates: [{
    name: template.name,
    exercises: template.exercises.map(ex => ({
      exercise_id: ex.exercise_id,
      target_sets: ex.target_sets,
      target_reps: ex.target_reps,
      rest_seconds: ex.rest_seconds,
      ...(ex.link_id != null ? { link_id: ex.link_id } : {}),
      ...(ex.link_label != null ? { link_label: ex.link_label } : {}),
      ...(ex.target_duration_seconds != null ? { target_duration_seconds: ex.target_duration_seconds } : {}),
      ...(ex.set_types?.length ? { set_types: ex.set_types } : {}),
    })),
  }],
};
```

**Important:** Optional fields are only emitted when present — this matches the import schema's optionality and avoids polluting the JSON with `null` placeholders that would then need to round-trip back as `null`. We validate the produced payload against `coachTemplateImportSchema` **before** writing the file (defense-in-depth — catches our own bugs).

**File write + share:**
```ts
import { File, Paths } from "expo-file-system/next";
import * as Sharing from "expo-sharing";

const file = new File(Paths.cache, `cablesnap-template-${slugify(template.name)}.json`);
file.write(JSON.stringify(payload, null, 2));
await Sharing.shareAsync(file.uri, {
  mimeType: "application/json",
  dialogTitle: "Share Workout Template",
});
```

`slugify` already exists at `lib/format.ts` (used by full-DB export). Reuse it.

**Dependencies:** `expo-sharing` and `expo-file-system/next` are already used by Settings full-DB export (`_settings-handlers.ts:26-61`) and Progress monthly Share Report (BLD-988 / existing). Zero new deps.

**Performance:** Tiny payload (a single template, typically <5KB stringified). Synchronous serialize + a single file write + share intent. No measurable cost.

**Storage:** Cache dir, not Documents — we do not retain export artifacts. The OS share sheet hands the file off; if the user picks "Save to Files" the system copies it.

## Decision Log

### Decision §1: Starter templates — include Export?

**Choice:** **Include** Export for starter templates.

**Rationale:**
- Starter templates have stable Voltra-curated `exercise_id`s, so they round-trip cleanly to any CableSnap install.
- Use case: a user wants to share "the official PPL starter" with a friend who hasn't installed CableSnap yet, or duplicate it across devices via Files.
- Excluding Export from starters makes the menu inconsistent without a real safety reason. The share sheet itself is the trust boundary.
- Implementation cost: zero (the same code path).

Updated starter menu: `Duplicate`, `Export` (in that order — Duplicate is the more common action for starters since the user typically can't edit starter templates directly).

### Decision §2: Cross-device portability — Option (a) vs (b)

**Choice:** **Option (a) — ship-fast.** Export the template as-is. Custom exercises export their `exercise_id`. On import to a device that lacks the referenced custom exercise, the existing import path will fail validation or produce a dangling reference.

**Rationale:**
- Option (b) — bundling exercise definitions with conflict resolution — is a substantially larger feature (schema bump, conflict UX, exercise-merge semantics). It would gate this entire issue on a multi-week design cycle.
- 95%+ of templates reference only stock Voltra exercises (the user has not added custom exercises). For those, (a) is a complete solution.
- For templates referencing custom exercises, the user is typically the same person on both ends (cross-device backup, not sharing) and will have those custom exercises present.
- We add a soft warning at export time **only for templates that reference custom exercises** (heuristic: `exercise_id` not in the starter Voltra ID set), so the user knows the file may not import cleanly elsewhere.

**Out-of-scope follow-up (separate plan if demand emerges):** BLD-991-FOLLOWUP — bundle custom-exercise definitions in export payload with `version: 2` schema bump and import-side conflict UI.

**Custom-exercise warning UX:**

Before opening the share sheet, if any exercise in the template has an `exercise_id` not in the bundled starter set:

```
Alert.alert(
  "Custom exercises in this template",
  "This template uses N custom exercise(s). The exported file will only import correctly on devices where the same custom exercises exist.",
  [
    { text: "Cancel", style: "cancel" },
    { text: "Export anyway", onPress: () => proceedWithExport() },
  ]
)
```

`N` is the count of custom-exercise references. We use `Alert.alert` (matches existing destructive-action confirms in the codebase, e.g., delete template). A single check, no new components.

Heuristic for "custom": query is `exercise_id NOT IN (SELECT id FROM exercises WHERE source = 'starter')` — or equivalent in the in-memory exercise registry. Implementation detail for the engineer; the contract is "warn iff any exercise is non-starter."

### Decision §3: Filename format

**Choice:** `cablesnap-template-<slugified-name>.json`.

**Rationale:** Mirrors the full-DB export filename pattern. Slug is filesystem-safe across Files / Drive / Messages targets. No timestamp — one template per file, name-disambiguated.

If slug collision matters in the share-target app (it usually doesn't — the share sheet doesn't prevent collisions), the user can rename in the destination app.

## Scope

**In:**
- `Export` menu row on user template tiles (long-press).
- `Export` menu row on starter template tiles (long-press).
- JSON output validates against existing `coachTemplateImportSchema`.
- Round-trip (export → import same device) reproduces template byte-for-byte (modulo regenerated UUIDs on the import side, which is the existing import behavior).
- Custom-exercise warning Alert before share sheet.
- Error toast on failure.

**Out:**
- Bundling custom exercise definitions in the export (Decision §2).
- Bulk export of multiple templates at once (covered by full-DB export in Settings).
- Cloud / URL-based sharing.
- Export from program/workout-history views (different feature, different schema).
- Any analytics on export usage.

## Acceptance Criteria

- [ ] Long-press on a user template tile shows menu rows in this order: `Edit`, `Duplicate`, `Export`, `Delete` (Delete is destructive).
- [ ] Long-press on a starter template tile shows menu rows: `Duplicate`, `Export`.
- [ ] Tapping `Export` on a template with only starter exercises opens the OS share sheet with a `cablesnap-template-<slug>.json` file (mimeType `application/json`) — **no warning Alert**.
- [ ] Tapping `Export` on a template containing ≥1 custom exercise shows the custom-exercise warning Alert; tapping `Export anyway` opens the share sheet; tapping `Cancel` aborts cleanly.
- [ ] The exported JSON parses successfully via `validateCoachTemplateImportData` (Zod) — verified with a unit test.
- [ ] Import flow (existing) consumes the exported file and recreates the template such that `name`, `exercises[].exercise_id`, `target_sets`, `target_reps`, `rest_seconds`, `link_id`, `link_label`, `target_duration_seconds`, and `set_types` are all preserved — verified with a unit test (in-memory round-trip, no file I/O needed for the assertion).
- [ ] On serialization or share failure, an `error("Template export failed")` toast appears; no crash.
- [ ] No new lint warnings.
- [ ] No regressions in existing template Import / Edit / Duplicate / Delete paths.
- [ ] Typecheck passes; existing test suite passes.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Template with only starter exercises | Export proceeds with no warning. |
| Template with 1+ custom exercises | Warning Alert; user confirms or cancels. |
| Template name with emoji / unicode | `slugify` handles (existing behavior); JSON preserves the original name in the payload. |
| Template name producing empty slug (e.g., all emoji) | `slugify` returns `"template"` fallback (must verify or add fallback in exporter). |
| Very long template name (edge-case 100 chars) | Slug truncated to safe filename length (`slugify` already does this); JSON preserves full name. |
| Template with 50+ exercises | Payload still <50KB; no perf concern. |
| User cancels share sheet | No toast, no error — silent (matches Settings full-DB export). |
| `expo-sharing` unavailable on this platform (web) | `Sharing.isAvailableAsync()` check; if false, fall back to `error("Sharing not available on this device")` toast. (CableSnap is mobile-only today, but defense-in-depth.) |
| Concurrent exports (user double-taps) | Cache file overwrite is fine; share sheet is single-instance — second tap is a no-op or stacks on iOS (acceptable). |
| Cache dir write fails (full disk) | Caught, toasted as `"Template export failed"`. |
| Exercise's `set_types` array is empty | Per import schema, optional + min not enforced on the array itself; we omit the field rather than emit `[]`. Verify schema accepts both (currently does — field is optional). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Schema drift between export and import (export emits a field import doesn't accept) | Low | Medium | Validate exporter output with `validateCoachTemplateImportData` before file write. Unit test for round-trip. |
| Custom-exercise warning false-negative (user assumes portable, file fails on import elsewhere) | Medium | Low | Alert copy explicitly says "the same custom exercises must exist." |
| Custom-exercise heuristic false-positive (warns on a coach-source exercise that is actually portable) | Low | Low | Slight friction at most; Export anyway works. |
| `slugify` returns colliding names across two different templates | Medium | Very low | Cache file is ephemeral; share sheet hands off bytes. Not a data-loss risk. |
| Sharing API behavior diverges between iOS / Android | Low | Low | `expo-sharing` already in production for two other flows; behavior is known. |
| Adding a 4th menu row makes the popover overflow on small screens | Low | Low | `FlowCardMenu` is scrollable / sized to content (existing). Sanity check during QA. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_N/A — Classification = NO (utility/data-portability feature)_

### CEO Decision
_Pending — awaiting QD + Techlead approvals_
