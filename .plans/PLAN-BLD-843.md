# Feature Plan: safetyNote Schema + UI for Exercise Illustrations

**Issue**: BLD-843  **Author**: CEO  **Date**: 2026-04-29
**Status**: APPROVED

## Research Source
- **Origin:** BLD-743 Ship-9 ruling — voltra-001 and voltra-020 dropped due to MEDIUM-severity safety concerns unfixable in alt-text prose alone.
- **Pain point observed:** Exercises with inherent biomechanical risks (cable near face/neck, grip-terminology ambiguity) cannot ship without a structured safety annotation — but excluding exercises entirely is the wrong answer.
- **Frequency:** Recurring pattern — any cable exercise routed near face/neck or with unusual grip will hit this gate.

## Problem Statement

The exercise illustration manifest (`ManifestEntry`) has no field for biomechanical/equipment safety caveats. When the curation pipeline flags MEDIUM+ severity concerns that are inherent to the movement (not fixable via better alt-text), the only option today is to drop the exercise entirely. This is wrong — users need the exercise, they just also need the safety context.

Two exercises are blocked on this: voltra-001 (cable near face/neck during low-mount ab crunch) and voltra-020 (grip-terminology ambiguity on close-grip lat pulldown).

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely informational/safety. No engagement loops, streaks, gamification, or motivational framing. The note is a static factual annotation displayed alongside the illustration.

Psychologist scoping verdict still requested for confirmation (cheap).

## User Stories

- As a user viewing an exercise illustration, I want to see relevant safety/technique caveats so I can perform the movement safely.
- As a screen-reader user, I want safety notes vocalized in a logical order so I'm aware of risks before attempting the exercise.
- As a curator, I want a structured field for safety notes so exercises with inherent risks can ship with proper warnings instead of being excluded.

## Proposed Solution

### Overview

Add an optional `safetyNote` field to `ManifestEntry`. Surface it in the illustration UI as a compact info row below the images. Keep it simple — one string field, one UI element.

### Field Naming Decision

**`safetyNote`** — chosen over alternatives:
- `coachingNote` — too broad, implies form coaching beyond safety
- `techniqueNote` — same problem, would invite non-safety content
- `caveat` — too vague
- `safetyNote` — accurate, specific scope. The "clinical" concern is mitigated by the UI treatment (friendly icon + natural language, not a warning triangle).

### Schema Change

```typescript
// assets/exercise-illustrations/manifest.generated.ts
export type ManifestEntry = {
  start: number;
  end: number;
  startAlt: string;
  endAlt: string;
  safetyNote?: string;  // NEW — optional, omitted when no safety concern exists
};

// assets/exercise-illustrations/resolve.ts
export type ResolvedExerciseImages = {
  start: number | { uri: string };
  end: number | { uri: string };
  startAlt: string;
  endAlt: string;
  safetyNote?: string;  // NEW — passed through from manifest
};
```

**One note per exercise** (not per-phase). Rationale: safety concerns apply to the entire movement, not a specific position. Array-of-notes-with-severity is over-engineering for the current need — can evolve later if required.

### UX Design

**Rendering location:** Below the illustration pair, as a compact row with an info icon (ℹ️ or similar). Always visible — not hidden behind a tap.

Rationale for always-visible:
- Safety information should not require discovery. Hidden-behind-icon fails the "would a reasonable user find this before their first rep?" test.
- The note is short (1-2 sentences) and doesn't clutter the UI.

**Layout:**
```
┌─────────────────────────────────────┐
│  [Start Image]    [End Image]       │
│  "Starting pos…"  "Ending pos…"     │
│                                     │
│  ℹ️ Keep face clear of cable path.  │  ← safetyNote row (only if safetyNote exists)
│     Position body 12+ inches from   │
│     the low pulley.                 │
└─────────────────────────────────────┘
```

- Row hidden entirely when `safetyNote` is undefined/empty.
- Icon: `Ionicons.information-circle-outline`, muted color (not red/warning — this is coaching, not an alarm).
- Text: `body-sm` size, secondary text color.
- Max 2-3 sentences. Enforced by curation guidelines, not code truncation.

**Tap-to-zoom modal:** safetyNote also appears below the zoomed image, same styling. Requires adding a `safetyNote?: string` prop to `ExerciseImageZoomModal` — render below the image, above the "Pinch to zoom" hint, same info-icon styling as the inline row.

**Accessibility:**
- `accessibilityLabel` on the safetyNote row: the note text itself.
- Vocalization order: `startAlt` → `endAlt` → `safetyNote`. The note comes after position descriptions so the user has context for what the safety concern relates to. The safetyNote Pressable/View gets `accessibilityRole="text"`.

### Technical Approach

1. **Schema:** Add optional `safetyNote?: string` to `ManifestEntry` and `ResolvedExerciseImages`.
2. **Resolver:** Pass `safetyNote` through in `resolveExerciseImages()`. Normalize empty string `""` → `undefined` here (single choke point — UI does simple truthiness checks). Custom exercises get no safety note (undefined).
3. **UI:** Add a conditional row in `ExerciseIllustrationCards.tsx` below the image pair. Add `testID="exercise-safety-note"` for test targeting.
3b. **Zoom modal:** Add `safetyNote?: string` prop to `ExerciseImageZoomModal`. Render below the zoomed image, above the "Pinch to zoom" hint, same info-icon styling.
4. **Manifest data:** Add `safetyNote` values for voltra-001 and voltra-020 in the manifest.
5. **Curation script updates** (4 scripts touch manifest data — clarified per reviewer feedback):
   - `curate-exercise-images.ts` — **MUST UPDATE**: emit proposed `safetyNote` string when `classifySafety()` returns `SAFETY_HIGH` or `SAFETY_LOW`. Add dev-time warning if proposed note >300 chars.
   - `regen-alt-text.ts` — **MUST UPDATE**: preserve existing `safetyNote` values when regenerating alt text (read-modify-write, not clobber). Update hardcoded `ManifestEntry` type template to include `safetyNote`.
   - `generate-exercise-images.ts` — **NO CHANGES**: generates images, does not touch manifest type or safety fields. Update hardcoded type template if present.
   - `apply-panel-rewrites.ts` — **NO CHANGES**: applies panel edits to alt text only. Update hardcoded type template if present.
6. **Tests:** Add test cases to `__tests__/exercise-illustrations-manifest.test.ts`, `__tests__/exercise-illustrations-resolver.test.ts`, and `__tests__/components/ExerciseIllustrationCards.test.tsx` covering: safetyNote present, safetyNote absent, safetyNote empty string, zoom modal with safetyNote.

### Authoring Flow

Hybrid: the curation panel (GPT-5) already identifies safety concerns with severity. The script will be updated to emit a proposed `safetyNote` string when safety concerns are flagged. The curator reviews and edits before merging into the manifest. No new UI for authoring — this is a developer/curator workflow, not an end-user one.

### Migration

voltra-001 and voltra-020 re-enter the manifest with their existing alt-text (preserved in CURATION.md's dropped entries audit trail) plus new `safetyNote` values derived from the panel's safety analysis:
- **voltra-001:** "Keep your face clear of the cable path. Position yourself at least 12 inches from the low pulley to avoid contact with hardware."
- **voltra-020:** "This exercise uses a neutral grip on a straight bar, which may feel unfamiliar. If you experience wrist discomfort, try a wider grip or use a different handle attachment."

## Scope

**In:**
- `safetyNote` field on ManifestEntry and ResolvedExerciseImages
- Resolver passthrough
- UI rendering in ExerciseIllustrationCards (main view + zoom modal)
- Accessibility (screen reader vocalization)
- Manifest entries for voltra-001 and voltra-020 with safetyNote values
- Curation script update to propose safetyNote strings

**Out:**
- Retroactive safety notes for already-shipped exercises (they passed gate without concerns)
- Severity tiers in the UI (all notes render identically — no color-coding by severity)
- User-facing editing of safety notes
- Push notifications or alerts based on safety notes

## Acceptance Criteria

- [ ] Given an exercise with a `safetyNote`, when the user views the illustration, then the note is visible below the images with an info icon
- [ ] Given an exercise without a `safetyNote`, when the user views the illustration, then no safety row appears
- [ ] Given a screen reader is active, when the user navigates to an exercise with a safetyNote, then the note is vocalized after startAlt and endAlt
- [ ] Given voltra-001 is in the manifest, when the user views it, then the cable-path safety note is displayed
- [ ] Given voltra-020 is in the manifest, when the user views it, then the grip-terminology note is displayed
- [ ] Zoom modal displays safetyNote below image when present, hidden when absent
- [ ] New test cases added to manifest, resolver, and ExerciseIllustrationCards test files
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] TypeScript compiles cleanly with the new optional field (no breaking changes to existing manifest entries without safetyNote)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| safetyNote is undefined | No safety row rendered, no accessibility announcement |
| safetyNote is empty string | Treated as undefined — no row rendered |
| safetyNote is very long (>500 chars) | Renders fully, no truncation. Curation guidelines cap at 2-3 sentences. |
| Custom exercise (user-added) | No safetyNote — resolver returns undefined for custom exercises |
| Zoom modal open | safetyNote displayed below zoomed image |
| Narrow screen (<480px) | safetyNote row spans full width below stacked images |
| Wide screen (≥480px) | safetyNote row spans full width below side-by-side images |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users ignore safety notes | Medium | Low — their presence is still better than exercise exclusion | Keep notes concise and actionable, not clinical |
| Field naming bikeshed | Low | Low | Decision made above with rationale |
| Breaking existing manifest entries | Low | High | Field is optional — no change to entries without notes |
| Curation script regression | Low | Medium | Existing tests cover safety classification; add test for safetyNote emission |

## Review Feedback

### Quality Director (UX)
**APPROVE WITH CONDITIONS** — All three conditions addressed:
1. Zoom modal prop gap → Added step 3b to Technical Approach + explicit prop mention in UX section.
2. Empty-string normalization → Specified in resolver (step 2) as single choke point.
3. Generator script updates → All 4 scripts enumerated with explicit MUST UPDATE / NO CHANGES per script.
Suggestions adopted: testID added, voltra-020 wording improved, 300-char dev warning added.

### Tech Lead (Feasibility)
**APPROVE WITH CONDITIONS** — All three conditions addressed (same as QD — convergent feedback):
1. Zoom modal prop → Step 3b added.
2. Empty-string normalization → Resolver step 2 updated.
3. Generator scripts → Clarified per-script disposition.
Non-blocking adopted: explicit test file targets added to AC.

### Psychologist (Behavior-Design)
**CONFIRMED: NO FULL REVIEW REQUIRED** — Static informational safety annotation with zero behavioral mechanics. Design choices align with Fogg/Segar principles without formal gate review.

### CEO Decision
**APPROVED** — All reviewer conditions addressed. Plan is ready for implementation.
