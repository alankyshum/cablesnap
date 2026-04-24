# Feature Plan: Visual Exercise Illustrations (Start/End Positions)

**Issue**: BLD-556  **Author**: CEO  **Date**: 2026-04-24
**Status**: APPROVED (R2 — both reviewers LGTM 2026-04-24)
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

_**See the authoritative list in `R2 updated acceptance criteria` below. The original R1 AC and Edge Cases / Risk Assessment blocks are retained as historical context; R2 supersedes on conflict.**_

### R1 (historical) Acceptance Criteria

- [ ] Given a Voltra cable exercise in `ExerciseDetailDrawer` when the sheet opens then a labelled start image and end image render above the text steps.
- [ ] Given a custom exercise (user-created) when the detail drawer opens then no image area renders and only text steps show (no placeholder, no error).
- [ ] Given tablet/Fold unfolded in `ExerciseDetailPane` when an exercise is selected then start and end images render side-by-side. _(R2: use onLayout container-width, not device breakpoint.)_
- [ ] Given phone portrait in `ExerciseDetailDrawer` when an exercise is opened then start and end stack vertically.
- [ ] `scripts/generate-exercise-images.ts` runs idempotently: second run skips any exercise that already has both images on disk. _(R2: fingerprint-based, not file-exists-only.)_
- [ ] Typed image map is checked in and passes `tsc --noEmit`. _(R2: `manifest.generated.ts`.)_
- [ ] Bundle size growth ≤15MB. _(R2: ≤8MB target, 12MB hard fail.)_
- [ ] Images meet a11y: each `<Image>` has a non-empty `accessibilityLabel`. _(R2: must be substantive AI-generated alt text, not stub.)_
- [ ] All 56 Voltra exercises have BOTH images committed. _(R2: pilot = 10 exercises, not 56.)_
- [ ] Manual curation notes committed: `CURATION.md`. _(R2: two-gate visual + technique sign-offs.)_
- [ ] PR passes all tests with no regressions; `npm run typecheck` green; `npm test` green; pre-push `scripts/audit-tests.sh` passes.

## Edge Cases (R1, superseded in parts by R2 renderer decisions)

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

**Verdict: APPROVE WITH CHANGES** — 2026-04-24 (QD, full critique in BLD-556 comment thread)

Plan is UX-sound; co-signs all 5 techlead changes. Adds 7 UX/a11y/safety concerns, of which 3 are blockers:

1. **Exercise-technique safety gate** — Classification=NO exempts psych-review but NOT technique review. An AI image with wrong cable path or injurious joint angle is instruction that can cause injury. Require two-gate curation checklist in `CURATION.md` (visual-plausibility + technique) with per-exercise sign-off timestamps; invoke `review--sports-science` skill on the pilot set.
2. **Partial-coverage rule: both-or-neither.** A lone "Start" image with no matching "End" reads as a data bug. `resolveExerciseImages` returns null unless BOTH keys resolve; falls back to text-only.
3. **Substantive `accessibilityLabel`** — "exercise name + start position" communicates zero info to screen-reader users. Preferred: generator produces 1–2 sentence alt-text per position alongside the image (same prompt pass, ~free), committed to manifest, rendered as `accessibilityLabel`. Minimum: explicit pointer to text steps.

Required (non-blocking): hardcode English `"Start position"` / `"End position"` captions (no active i18n in repo); use `expo-image` (already in deps) not RN `Image`; explicit tap-to-zoom decision (QD leans include); container-width breakpoint via `onLayout` (≥480px → side-by-side) not `layout.atLeastMedium` (bottom-sheet on tablet can be narrow).

Suggestions: custom-exercise empty-state hint; specify `colors.surfaceAlt` for card; AI outputs must be transparent-alpha webp; pilot selection stresses prompt failure modes (low/mid/high mount, 1-arm vs 2-arm).


### Tech Lead (Feasibility)

**Verdict: APPROVE WITH CHANGES** — 2026-04-24 (techlead, full critique in BLD-556 comment thread)

Plan is architecturally sound (Metro static-require pattern correctly identified, bundle-size awareness present, idempotent generator shape right). Five required changes before implementation:

1. **Add custom-exercise hook NOW** — add optional `start_image_uri` / `end_image_uri` columns to `exercises` (additive migration per existing 3-file pattern in `lib/db/migrations.ts`) + single `resolveExerciseImages(ex)` helper. Cost ~10 LOC today, prevents a predictable schema migration later when custom-exercise image UX lands.
2. **Pilot first (10 exercises, not 56)** — PR1 scope-reduced to top-10 highest-utility Voltra exercises with full pipeline (renderer, manifest, generator, curation, resolver, hook, tests, bundle gate). PR2 expands to remaining 46. Curation risk (AI anatomy variance) is unknown-unknown; de-risk before committing full catalog burn.
3. **Tighten bundle knobs** — retarget 512×512 Q80 → **384×384 Q75 webp**; expected ~3–5MB actual. Replace 15MB criterion with **≤8MB target, 12MB hard fail**; enforce via `scripts/verify-exercise-illustrations-size.sh` in the existing Bundle Gate / pre-push pattern.
4. **Fingerprint-based idempotency** — file-exists check is insufficient; prompt-template drift would silently skip regeneration. Write `fingerprint.json` sidecar per exercise (`sha256(template + {id, name, mount_position, attachment, instructions})` + model+version). Script warns on drift, requires `--force-regen` flag.
5. **Pin provider: OpenAI `gpt-image-1`** — commercial-rights ToS is clean, cable-geometry quality best-in-class for instructional diagrams, ~$6–$13 total for 112 images. Explicitly NOT Flux-dev (non-commercial license unless Replicate-hosted — ship-blocker for F-Droid redistribution).

**Ancillary:** `assets/exercise-illustrations/manifest.generated.ts` (deterministic-sorted, `// @generated` header, eslint-ignored but committed). Optional contact-sheet HTML helper for the curation pass. Test strategy = manifest-completeness test + resolver unit tests + renderer RTL tests; zero image-gen in CI.

**Disagreements with plan: none material.** Approach, layering, and scope-out list are all correct.

### Psychologist (Behavior-Design)
N/A — Classification = NO (purely informational exercise instruction, no behavior-shaping triggers).

### CEO Decision

**APPROVED** — 2026-04-24. Both reviewers LGTM the R2 revision:
- Quality Director: APPROVE ✅ (all 7 R1 concerns resolved, 3 IMPL-time QA gates flagged for the implementation PR)
- Tech Lead: LGTM / APPROVE (all 5 R1 required changes incorporated; 5 non-blocking implementation notes)
- Psychologist: N/A (Classification = NO)

Flipping plan to APPROVED. Next: merge PR #341, open BLD-556-IMPL ticket assigned to claudecoder with the R2 spec pasted in.

---

## Plan Revisions — Round 2 (supersedes sections above on conflict)

### R2 scope reduction — 10-exercise PILOT, not full catalog

PR1 ships **10 Voltra cable exercises** selected to stress-test the prompt:
- 4 by popularity (to be selected by owner from the 56 Voltra set, or default to seed order top-4)
- 6 by prompt-stress coverage: one each of {low mount, mid mount, high mount} × {1-arm, 2-arm} — ensures cable-geometry, attachment, and stance variance get exercised before burning the full catalog.

Follow-ups:
- **BLD-556-P2**: extend to remaining 46 Voltra exercises (pure catalog expansion; zero renderer changes).
- **BLD-556-P3**: community (non-Voltra) exercises.
- **BLD-556-P4**: custom-exercise image upload UX (hook planted in PR1, UX deferred).

### R2 data model (additive DB migration, 3-file pattern)

Apply the existing `lib/db/migrations.ts` `addColumnIfMissing` pattern:

- `lib/db/tables.ts` — CREATE TABLE DDL gets `start_image_uri TEXT`, `end_image_uri TEXT`.
- `lib/db/migrations.ts` — `addColumnIfMissing(db, "exercises", "start_image_uri", "TEXT DEFAULT NULL")` + same for `end_image_uri`.
- `lib/db/schema.ts` — drizzle def updated.
- `lib/types.ts` `Exercise` — `start_image_uri?: string; end_image_uri?: string;`.

Seeded Voltra exercises do **not** populate these columns (they get images via the bundled manifest). Custom exercises use only these URI columns.

### R2 resolver — single source of truth, both-or-neither

```ts
// assets/exercise-illustrations/resolve.ts
import { manifest } from "./manifest.generated";
import type { Exercise } from "@/lib/types";

export type ExerciseImages = {
  start: number | { uri: string };
  end: number | { uri: string };
  startAlt: string;
  endAlt: string;
};

export function resolveExerciseImages(ex: Exercise): ExerciseImages | null {
  if (ex.is_custom) {
    if (!ex.start_image_uri || !ex.end_image_uri) return null; // both-or-neither
    return {
      start: { uri: ex.start_image_uri },
      end: { uri: ex.end_image_uri },
      startAlt: `${ex.name} start position — user-supplied illustration.`,
      endAlt: `${ex.name} end position — user-supplied illustration.`,
    };
  }
  const m = manifest[ex.id];
  if (!m?.start || !m?.end || !m?.startAlt || !m?.endAlt) return null; // both-or-neither
  return { start: m.start, end: m.end, startAlt: m.startAlt, endAlt: m.endAlt };
}
```

### R2 manifest schema (generated)

```ts
// assets/exercise-illustrations/manifest.generated.ts
// @generated — do not edit. Regenerate via `npm run generate:exercise-images`.

export const manifest: Record<string, {
  start: number;      // require() module id
  end: number;
  startAlt: string;   // 1–2 sentence alt text for accessibility
  endAlt: string;
}> = {
  "voltra-001": {
    start: require("./voltra-001/start.webp"),
    end: require("./voltra-001/end.webp"),
    startAlt: "Supine on floor, knees bent, cable handle held behind head with elbows flared.",
    endAlt: "Torso curled up, shoulder blades lifted off floor, cable resistance engaged through abs.",
  },
  // ...deterministic-sorted by exercise id
};
```

Alt text is produced in the same AI generation pass (extra prompt output slot is free; the image model returns both the image and a short description).

### R2 generator spec

Path: `scripts/generate-exercise-images.ts`. NPM script: `generate:exercise-images`.

- **Provider:** OpenAI `gpt-image-1` (pinned). ToS grants commercial rights.
- **Image size:** 384×384, WebP quality 75 (re-encode via `cwebp -q 75 -m 6 -pass 10` regardless of provider output format).
- **Transparent alpha background:** required. Prompt instructs transparent bg; if returned PNG is RGB-solid, script fails that exercise with an error (don't commit a bad image).
- **Idempotency:** `fingerprint.json` sidecar per exercise directory. Schema: `{ promptHash, model, modelVersion, generatedAt }`. `promptHash = sha256(promptTemplate + JSON.stringify({id, name, mount_position, attachment, instructions}))`.
- **Run logic:**
  - No files → generate.
  - Both files + fingerprint matches → skip.
  - Files exist but fingerprint missing OR hash drift → warn and require `--force-regen` flag (no silent regen, no silent drift).
- **Manifest writer:** after a successful run, rewrites `manifest.generated.ts` with deterministic-sorted entries.
- **Contact-sheet helper:** `--contact-sheet` flag emits `curation/contact-sheet.html` showing all pairs side-by-side for owner review.
- **Secrets:** `OPENAI_API_KEY` from env; never committed; never logged.
- **Not in CI:** manual dev-only; generated artifacts committed.

### R2 curation — two-gate checklist

`assets/exercise-illustrations/CURATION.md` — committed, append-only. Per exercise:

```
## voltra-001 — Abdominal Crunches
- Visual plausibility: ✅ alan 2026-04-25 (no extra limbs, no text artifacts, style consistent)
- Technique: ✅ alan 2026-04-25 (cable path routes through low mount, pelvis neutral, lumbar safe)
- Model: gpt-image-1 v2025-09
- Notes: regen 2× for cable path
```

Both sign-offs required before the image ships. If either is missing or ❌ → image is **excluded from the manifest**, exercise falls back to text-only (both-or-neither rule guarantees a lone image never leaks).

Pilot batch (PR1, 10 exercises) additionally invokes `review--sports-science` skill; its output is pasted into CURATION.md alongside human sign-offs.

### R2 renderer — UX decisions

- **Placement:** start + end images render **above** the numbered steps in both `ExerciseDetailDrawer` (bottom sheet) and `ExerciseDetailPane` (tablet split-pane).
- **Layout breakpoint:** container-width via `onLayout`, not device class. Threshold: container width ≥ 480px → side-by-side; < 480 → stacked vertically.
- **Captions:** hardcoded English strings `"Start position"` / `"End position"` with `// TODO(i18n): track in follow-up` comment. No i18n hedge.
- **Image component:** `expo-image` (already in deps), `contentFit="contain"`, transition fade 150ms, on transparent-alpha webp.
- **Card background:** `colors.surfaceAlt` (dark/light themed). Image subject sits on transparent alpha; card provides the neutral tint.
- **Tap-to-zoom:** IN SCOPE. Tap an image → full-screen modal viewer (lightweight `Modal` + pinch-zoom via `react-native-reanimated`+`react-native-gesture-handler` already in deps; no new package). ~60 LOC.
- **Accessibility:**
  - `accessibilityRole="image"`.
  - `accessibilityLabel = resolved.startAlt` (or endAlt) — the substantive AI-generated description.
  - If for any reason alt-text is missing, fall back to `${exerciseName} — start position. Detailed instructions follow in text below.`
- **Custom-exercise empty state:** when `resolveExerciseImages(ex)` returns null AND `ex.is_custom`, render a single subtle line below the steps: `"Add your own illustration — coming soon"` (gray, small). Signals intentional absence, not data bug. For seeded exercises with missing manifest entries (bug path), render nothing — text is sufficient.

### R2 bundle-size gate

- Target: ≤ 8MB total for `assets/exercise-illustrations/**/*.webp`.
- Hard fail: > 12MB.
- Enforcement: `scripts/verify-exercise-illustrations-size.sh` using `du -sb`. Wired into existing pre-push / Bundle Gate workflow in `.github/workflows/` (pattern matches existing `scripts/verify-scenario-hook-not-in-bundle.sh`).
- Pilot (10 exercises × 2 × 20KB ≈ 400KB) is well under threshold; full Voltra catalog (56×2×20KB ≈ 2.2MB) still under.

### R2 test strategy (zero image-gen in CI)

1. `__tests__/exercise-illustrations-manifest.test.ts` — every *pilot* exercise id appears in manifest with all 4 keys (start, end, startAlt, endAlt).
2. `__tests__/exercise-illustrations-resolver.test.ts` — `resolveExerciseImages`:
   - Seeded Voltra with full manifest → returns ExerciseImages.
   - Seeded Voltra with missing end in manifest (simulated partial) → returns null.
   - Custom with both URIs → returns URIs.
   - Custom with only start URI → returns null (both-or-neither).
   - Custom with no URIs → returns null.
3. `__tests__/ExerciseDetailDrawer.test.tsx` — RTL:
   - Voltra exercise with manifest → renders exactly 2 `<Image>` nodes with expected `accessibilityLabel = startAlt|endAlt`.
   - Custom with no URIs → 0 `<Image>` nodes; "Add your own illustration" hint visible; steps still render.
   - Container width 320 (phone) → flex-column; width 600 (tablet) → flex-row. Mock via `onLayout` event.
4. `scripts/verify-exercise-illustrations-size.sh` — ensures under-cap; wired as GitHub Action job.

### R2 updated acceptance criteria (supersedes earlier list)

- [ ] `exercises.start_image_uri` and `exercises.end_image_uri` columns exist (additive migration; `addColumnIfMissing` pattern).
- [ ] `Exercise` type in `lib/types.ts` has optional `start_image_uri` / `end_image_uri`.
- [ ] `assets/exercise-illustrations/manifest.generated.ts` committed with 10 pilot entries, deterministic-sorted by id, `// @generated` header.
- [ ] `assets/exercise-illustrations/<voltra-id>/{start,end}.webp` + `fingerprint.json` committed for 10 pilot exercises.
- [ ] 384×384 webp quality 75; every `start.webp`/`end.webp` has transparent alpha channel (verifiable via `identify -format "%A"`).
- [ ] `resolveExerciseImages` returns null when either image is missing (both-or-neither).
- [ ] `scripts/generate-exercise-images.ts` runs idempotently: unchanged fingerprint → skip; drift → warn + require `--force-regen`.
- [ ] `ExerciseDetailDrawer` on container width ≥ 480px renders start/end side-by-side; < 480px stacks vertically.
- [ ] `ExerciseDetailPane` (tablet split) renders images above numbered steps.
- [ ] Images render via `expo-image` `contentFit="contain"` inside a `colors.surfaceAlt` card.
- [ ] Tap on either image opens full-screen modal viewer with pinch-zoom; dismissible via swipe-down or close button.
- [ ] `accessibilityLabel` on each image = resolved `startAlt` / `endAlt` (AI-generated 1–2 sentence description), never the stub "exercise name + start".
- [ ] Custom exercise without images → no image area; "Add your own illustration — coming soon" hint shown below steps.
- [ ] Seeded exercise with partial manifest → no image area; no error, no placeholder.
- [ ] `assets/exercise-illustrations/**/*.webp` total size ≤ 8MB; CI fails > 12MB.
- [ ] `assets/exercise-illustrations/CURATION.md` has both visual-plausibility AND technique sign-offs per pilot exercise; `review--sports-science` skill output pasted for pilot batch.
- [ ] All pilot images pass technique gate (cable path matches mount_position+attachment; joint angles plausible; no injury-risk poses).
- [ ] Tests green: 3 new test files above + existing suite; `npm run typecheck` green; pre-push `scripts/audit-tests.sh` passes.
- [ ] Bundle Gate CI job passes.

### R2 risk update

| Risk | L | I | Mitigation |
|------|---|---|-----------|
| AI anatomy / cable-path quality variance | High | High (injury risk, not just UX) | Two-gate CURATION.md (visual + technique); `review--sports-science` on pilot; both-or-neither ensures bad image never ships alone |
| Prompt-template drift silently ages catalog | Medium | Medium | Fingerprint sidecar + `--force-regen` guard |
| Bundle bloat | Low | Medium | 384 Q75 target; CI gate 12MB |
| `expo-image` edge cases on old Android | Low | Low | Already in deps and used elsewhere in app |
| Transparent-alpha rendering failure in dark mode | Low | Medium | Generator refuses RGB-solid outputs; manual pilot spot-check on dark theme during curation |
| Tap-to-zoom gesture conflict with bottom-sheet drag | Medium | Low | Use `react-native-gesture-handler` `Tap` + `Pinch` composable; verify drawer drag still works in RTL tests |
| Pilot exercise selection doesn't surface failure modes | Medium | Medium | Selection criteria: 4 popular + 6 prompt-stress (mount/arm coverage) — not seed-order-first-10 |

