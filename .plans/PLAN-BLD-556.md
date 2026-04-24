# Feature Plan: Visual Exercise Illustrations (Start/End Positions)

**Issue**: BLD-556  **Author**: CEO  **Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW
**Source**: GitHub #332 (alankyshum) — "For each of the exercise showing instruction in plain text isn't helpful"

## Problem Statement

Exercise instructions today are a numbered text list (e.g. 5 steps for "Abdominal Crunches"). For users who don't already know the movement, text alone is ambiguous — "attach handle to low mount", "curl torso upward" don't communicate posture, cable path, or range of motion. The owner explicitly requested "at least some AI generated illustrations of the start and end positions" for each exercise.

~128 seeded exercises today (56 Voltra cable + 72 community) × 2 positions = up to ~256 images required for full coverage. Custom user exercises have no image coverage.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES** — behavior-shaping
- [x] **NO** — purely informational / functional. Showing a picture of a movement is exercise instruction, not a manipulation trigger (no streaks, notifications, gamification, identity framing, etc). Psychologist review **N/A**.

## User Stories

- As a user unfamiliar with a cable exercise, I want to see the start and end positions at a glance so I can set up correctly without reading 5 text steps.
- As a user picking an exercise from the detail drawer, I want the image to appear inline so I don't tab away to YouTube.
- As a user on a slow/offline network, I want the image to already be on device so the session screen never blocks.

## Proposed Solution

### Overview

Ship a static, bundled image pair (`start.png`, `end.png`) per seeded exercise, rendered in `ExerciseDetailDrawer` and `ExerciseDetailPane` above the existing text steps. Text stays — images augment, never replace (accessibility + when image is missing). Custom user exercises show text only; an empty-state hint explains why.

### Image sourcing strategy

Three options evaluated. **Decision owner: techlead; surface trade-offs in review.**

**Option A — AI-generated illustrations (owner's request).**
- Pipeline: one-shot script (not runtime) using an image model (e.g. gpt-image-1, Imagen, Flux). Prompt template driven by exercise name + mount_position + attachment + instructions.
- Pros: matches owner's explicit ask; fully ownable license; consistent visual style.
- Cons: generation cost (~$0.02–$0.05 per image × 256 = $5–$13 one-shot, tolerable); quality variance on anatomy/cable geometry; iteration required; must be hand-reviewed to reject broken poses (extra fingers, wrong cable path).

**Option B — MIT-licensed `free-exercise-db` (yuhonas/free-exercise-db).**
- Pros: 800+ exercises with GIFs already, MIT-licensed, zero generation cost.
- Cons: coverage is mostly barbell/bodyweight; cable-specific illustrations (which are CableSnap's first-class feature per product goal §4) are sparse; GIF animations may be undesirable during set logging; extra bundle weight.

**Option C — Static SVG line-art library (manually authored).**
- Pros: tiny bundle (~2–5KB each), a11y-friendly, theme-able (dark mode).
- Cons: authoring cost (256 SVGs by hand or commissioned); slow to ship.

**Recommendation (subject to techlead critique):** Start with **Option A** for Voltra/cable exercises (56 × 2 = 112 images, the differentiated subset per product goal) + **Option B fallback** for community exercises that happen to match by name. Manual curation pass rejects bad AI outputs; re-generate until acceptable. Ship in a single PR alongside a `scripts/generate-exercise-images.ts` generator kept in repo for future exercises.

### Data model

New optional field on `Exercise`:

```ts
interface Exercise {
  // …existing fields
  start_image?: string;  // require(…) path or asset key
  end_image?: string;
}
```

Images live under `assets/exercise-illustrations/<exercise-id>/{start,end}.webp` (webp for size). Asset map generated at build time by the same script, imported into `lib/seed.ts` via a typed index (`assets/exercise-illustrations/index.ts` re-exports require() handles — React Native Metro can't do dynamic requires).

### UX

`ExerciseDetailDrawer` / `ExerciseDetailPane`:

```
[ Start pose image | End pose image ]
  ── or on narrow layouts ──
[ Start pose image ]
[ End pose image ]
(caption: "Start position" / "End position")

1. Attach handle…
2. Lie supine…
```

- Images sit ABOVE the numbered steps.
- On narrow widths (phone portrait), stack vertically; on tablet/Fold unfolded, two-up.
- Fallback: if `start_image`/`end_image` is missing (custom exercises, not-yet-generated), render nothing — text steps become primary content. No placeholder shimmer.
- A11y: each image has `accessibilityLabel` = exercise name + "start position" / "end position" and `accessibilityRole="image"`.
- Light/dark mode: images are subject-on-transparent-background; wrapped in themed card with neutral tint.

### Technical approach

- **Storage**: assets bundled into app binary. WebP at ~512×512 quality 80 ≈ 25–40KB × 256 = ~7–10MB added. Within mobile norms, but acceptance criteria must include a bundle size check (flag if >15MB growth).
- **Generation script** (`scripts/generate-exercise-images.ts`):
  - Reads `seedExercises()` → generates prompt per exercise → calls image API → writes to `assets/exercise-illustrations/<id>/{start,end}.webp` → re-runs typed index writer.
  - Idempotent: skip if files already exist (so re-running adds only new exercises).
  - Requires `OPENAI_API_KEY` / equivalent; NEVER bundled or committed.
  - Not part of CI — manual dev-only script; generated outputs committed to git.
- **No runtime changes to seed DB**: image paths derived from exercise id at render time (`require(`../../assets/exercise-illustrations/${id}/start.webp`)` is NOT allowed in RN Metro; instead, a generated typed map `exerciseImages[id] = { start: require(…), end: require(…) }`).
- **Typecheck**: the generated map must be type-checked. Script writes a `.ts` file with literal requires; `tsc --noEmit` validates.

## Scope

**In:**
- Start + end position images for all 56 Voltra cable exercises (Option A).
- Render pipeline in `ExerciseDetailDrawer` and `ExerciseDetailPane`.
- Static bundled webp assets under `assets/exercise-illustrations/`.
- Generator script committed (so future exercises can be illustrated).
- Manual curation pass on all 112 Voltra images to reject broken anatomy / cable geometry.
- Typed image map generated by script.
- A11y labels.

**Out:**
- Community (non-Voltra) exercises — deferred to a follow-up once Option A pipeline is proven.
- Custom user exercises — no image capture UI in this plan.
- Animated GIFs / video / 3D models.
- On-device or on-demand AI generation.
- Muscle-highlight overlays (separate feature if owner requests).
- Localization of image captions beyond "Start" / "End" which use existing i18n if present.

## Acceptance Criteria

- [ ] Given a Voltra cable exercise in `ExerciseDetailDrawer` when the sheet opens then a labelled start image and end image render above the text steps.
- [ ] Given a custom exercise (user-created) when the detail drawer opens then no image area renders and only text steps show (no placeholder, no error).
- [ ] Given tablet/Fold unfolded (`layout.atLeastMedium`) in `ExerciseDetailPane` when an exercise is selected then start and end images render side-by-side.
- [ ] Given phone portrait in `ExerciseDetailDrawer` when an exercise is opened then start and end stack vertically.
- [ ] `scripts/generate-exercise-images.ts` runs idempotently: second run skips any exercise that already has both images on disk.
- [ ] Typed image map (`assets/exercise-illustrations/index.ts` or equivalent) is checked in and passes `tsc --noEmit`.
- [ ] Bundle size growth vs pre-feature main is ≤15MB (measured via `npm run build` or Android `assembleRelease` output comparison). If exceeded, stop and escalate.
- [ ] Images meet a11y: each `<Image>` has a non-empty `accessibilityLabel`.
- [ ] All 56 Voltra exercises have BOTH `start.webp` AND `end.webp` committed.
- [ ] Manual curation notes committed: `assets/exercise-illustrations/CURATION.md` lists the generator prompt(s) used, model/version, and any exercises that required re-generation.
- [ ] PR passes all tests with no regressions; `npm run typecheck` green; `npm test` green; pre-push `scripts/audit-tests.sh` passes.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Custom user exercise | No image area rendered; text-only |
| Voltra exercise with missing asset (partial regen) | That one image is hidden; other image still shows; no crash |
| Slow/offline network | N/A — images are bundled, no network |
| Dark mode | Images render inside themed card; never invert image pixels |
| Screen reader | `accessibilityLabel` announced; images don't block navigation |
| Large text setting | Image size is fixed-ratio, not font-coupled |
| Empty-state drawer (no exercise selected, tablet pane) | Existing empty state unchanged |
| Exercise name changes in seed | Image stays keyed by exercise id, not name; no breakage |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| AI anatomy quality variance (extra limbs, wrong cable path) | High | Medium | Manual curation pass mandatory; commit only acceptable outputs; re-gen otherwise |
| Bundle size bloat >15MB | Medium | High | Acceptance criterion caps growth; techlead may negotiate webp quality or defer community exercises |
| Metro `require` dynamic path limitation | Certain | High | Addressed in plan: generator writes a typed static-require map (known RN pattern) |
| Image licensing / ownership ambiguity for AI outputs | Low | Medium | Use image-gen provider whose ToS grants commercial rights (OpenAI gpt-image-1 does); record provider+version in CURATION.md |
| One-shot generation cost | Low | Low | ~$5–$13 total; CEO approves |
| Community exercise coverage gap | Certain (deferred) | Low | Explicit scope decision; add follow-up issue |
| Cable-specific poses hard for general image models | Medium | Medium | Prompt template includes mount_position+attachment; allow re-gen iterations; fall back to SVG line-art (Option C) for ≤5 stubborn cases |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO (purely informational exercise instruction, no behavior-shaping triggers).

### CEO Decision
_Pending_
