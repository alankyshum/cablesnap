# Feature Plan: Adopt Gemini Illustration Set (128 exercises)

**Issue**: BLD-989  **Author**: CEO  **Date**: 2026-05-02
**Status**: DRAFT
**Source**: Branch `bld-561-gemini-illustrations-review` — 128-exercise Gemini-generated illustration set sitting unmerged for ~6 days; owner-flagged risk of bit-rot.

## Problem Statement

Today on `main` only **10 voltra exercises × 2 = 20 webps** ship (gpt-image-1, from BLD-561 / PR #423). Coverage is ~7.8% of the seeded library (10/128). Barbell, bodyweight, cable, and most voltra exercises render text-only, defeating the purpose of the illustration framework that already shipped.

A **128-exercise** Gemini-generated batch (`mw-bb-001..002`, `mw-bw-001..045`, `mw-cable-001..025`, `voltra-001..056`) — **256 webps, 4.36 MB total** — has been sitting on the unmerged branch since 2026-04-26. Owner indicated preference for the Gemini style. The framework wired up in BLD-561 (manifest.generated.ts → resolve.ts → ExerciseIllustrationCards.tsx) is ready to consume it.

Goal: ship the Gemini set as the canonical illustration provider, retiring the gpt-image-1 voltra subset for visual consistency.

## Key Constraint Discovered During Investigation

**The branch is an ORPHAN.** `git merge-base origin/main origin/bld-561-gemini-illustrations-review` returns nothing. The branch has only 2 commits, the first of which (`fab98033`) introduces 273+ unrelated files (whole-repo state). It cannot be merged or rebased onto main. We must **cherry-pick the assets only** into a fresh branch off `main`.

This decision is non-negotiable — pinning the strategy now removes a whole class of merge-conflict pain.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES** — behavior-shaping
- [x] **NO** — purely informational / functional. Replacing one set of exercise illustrations with another, larger, higher-quality set is exercise instruction, not a manipulation trigger (no streaks, notifications, gamification, identity framing). Same classification as predecessor BLD-556. **Psychologist review N/A.**

## User Stories

- As a user opening any of the 128 seeded exercises, I want a start/end illustration so I understand the movement without leaving the app.
- As a user familiar with both Voltra and bodyweight content, I want a consistent visual style across all illustrations — no mixed providers per exercise family.
- As a user on a slow / offline device, I want all illustrations bundled (already the case for the 10 on main; same model for the new 128).

## Bundle Size Reality Check

| State | webp count | Total size |
|-------|-----------|------------|
| Current `main` | 20 | **0.33 MB** |
| After Gemini swap | 256 | **4.36 MB** |
| Bundle gate warn | — | 8 MB |
| Bundle gate fail | — | 12 MB |

**Headroom: 3.64 MB to warn, 7.64 MB to fail.** Bundle gate is not a blocker.

## Proposed Solution

### Phasing — RECOMMENDED: All-at-once asset swap, NOT staged

**Rationale for all-at-once:** the framework already ships, the assets are already generated, the bundle is well under gate. Staged cherry-picks only delay shipping value and create temporary mixed-provider inconsistency (which the issue explicitly flags as undesirable).

### Curation strategy — RECOMMENDED: Owner spot-check via contact sheet, no formal sports-science gate

`CURATION.md` on the branch lists 128 × 2 sign-offs. That is **128 × 2 = 256 individual reviews** at any meaningful depth — impractical and far below the value of just shipping. Better:

1. **Auto-generate a contact sheet** (the branch already has `curation/contact-sheet-v2.html`) covering all 128 exercises × 2 poses, side-by-side with exercise name + cues.
2. **Owner does a single visual pass** flagging any that look anatomically broken or wrong-cable-path. Red-flag list goes back to the generator script for re-roll.
3. **No formal `review--sports-science` per-exercise.** The skill is designed for feature proposals (programming logic, nutrition rules), not per-image visual review. Visual plausibility is best caught by the human owner in a flat grid.
4. Acceptable failure mode: if 5–10 individual illustrations look off post-ship, file follow-up issues for re-rolls. Shipping 118 good illustrations beats blocking on perfection.

### Style consistency — RECOMMENDED: Replace gpt-image-1 voltra set entirely

The 10 gpt-image-1 voltras on main and the 56 Gemini voltras on the branch overlap on at least these IDs (voltra-001, 003, 005, 007, 010, 013, 020, 029, 035, 045 — confirmed on disk). The branch's `voltra-001..056` is a superset and uses the preferred provider/style. Replace, don't co-exist.

### Scope decisions on issue questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Curation gate? | Owner spot-check via contact sheet. No formal sports-science gate. |
| 2 | Bundle size? | Confirmed 4.36 MB, well under gate. Re-run bundle gate in CI as final check. |
| 3 | Style migration? | YES — replace 10 main voltras with Gemini equivalents. Single provider going forward. |
| 4 | Provider divergence (`OPENAI_API_KEY` → `GEMINI_API_KEY`)? | Generator script change only re-runs offline (one-shot, not runtime). No CI secret needed unless we plan to re-generate in CI. **Out of scope** for this issue — defer to BLD-989-followup if/when we re-roll. |
| 5 | Refactor commit `fab98033`? | **Skip entirely.** The "drop legacy generator helpers" framing in the commit message is misleading — the commit introduces 273 unrelated files because the branch has no shared history with main. We do NOT cherry-pick this commit. We only copy the asset directories + the regenerated `manifest.generated.ts` (after diffing it against main's manifest format) + the regenerated `CURATION.md`. |

### Technical Approach

#### Step 1 — Asset cherry-pick (claudecoder)

```bash
git checkout main
git checkout -b bld-989-adopt-gemini-illustrations

# Copy ALL 128 illustration directories from the branch tree into main
for dir in $(git ls-tree --name-only -d origin/bld-561-gemini-illustrations-review:assets/exercise-illustrations | grep -E '^(mw-|voltra-)'); do
  git checkout origin/bld-561-gemini-illustrations-review -- "assets/exercise-illustrations/$dir"
done

# Replace manifest with the branch's regenerated version (verify shape matches main's first)
git checkout origin/bld-561-gemini-illustrations-review -- assets/exercise-illustrations/manifest.generated.ts

# Replace CURATION.md with branch version (Gemini-flavored)
git checkout origin/bld-561-gemini-illustrations-review -- assets/exercise-illustrations/CURATION.md

# Copy contact-sheet curation tooling (helps owner)
git checkout origin/bld-561-gemini-illustrations-review -- assets/exercise-illustrations/curation/

# DO NOT copy: scripts/generate-exercise-images.ts changes, ExerciseIllustrationCards.tsx, resolve.ts, tests
# (assume current main framework already supports the manifest shape; verify in Step 2)
```

#### Step 2 — Manifest shape verification (techlead, advisory before claudecoder commits)

Diff `manifest.generated.ts` between main and the branch — confirm:
- Export name + structure match what `resolve.ts` and `ExerciseIllustrationCards.tsx` expect on main.
- The branch manifest covers the same exercise IDs that main's seed library knows about (catch any naming drift).
- Alt text fields are present and well-formed.

If shape diverged, claudecoder either:
- (a) regenerates `manifest.generated.ts` against main's seed list using the branch's webp directory layout, OR
- (b) updates `resolve.ts` minimally to consume the new shape.

Decision lands in implementation issue, not here.

#### Step 3 — Bundle gate verification

`npm run` the existing `verify-exercise-illustrations-size.sh` locally + rely on CI `bundle-gate.yml` workflow.

#### Step 4 — Visual contact sheet for owner

Open `assets/exercise-illustrations/curation/contact-sheet-v2.html` in a browser; owner does a single pass; flagged IDs go into a follow-up issue (BLD-989-rerolls), do not block shipping.

#### Step 5 — Test updates

Existing tests on main:
- `__tests__/exercise-illustrations-manifest.test.ts` — likely needs update to assert the larger expected count (128, not 10). Update threshold.
- `__tests__/exercise-illustrations-resolver.test.ts` — should pass unchanged; verify with `npm test`.
- `__tests__/components/ExerciseIllustrationCards.test.tsx` — should pass unchanged; verify with `npm test`.

## Scope

**In:**
- Cherry-pick all 256 webps + 128 fingerprint.json files from the branch.
- Replace `manifest.generated.ts` and `CURATION.md` with branch versions.
- Copy `curation/` contact-sheet tooling.
- Update affected tests' count thresholds.
- Replace the 10 existing voltra gpt-image-1 illustrations (delete on disk; the new voltra-001..056 directories overwrite them).
- Pass bundle gate.

**Out:**
- Re-running the generator script. Provider divergence (`GEMINI_API_KEY` setup) is deferred to follow-up.
- Per-exercise sports-science sign-off. Owner contact-sheet pass replaces this.
- Custom user exercise illustrations — out of scope (unchanged on main).
- Cherry-picking `fab98033` itself or any non-asset code from the branch beyond the manifest/CURATION/curation files.
- Archiving the source branch (do that as a final cleanup task after merge).

## Acceptance Criteria

- [ ] PR opened from a fresh `bld-989-adopt-gemini-illustrations` branch off `main`, NOT from `bld-561-gemini-illustrations-review`.
- [ ] `assets/exercise-illustrations/` contains exactly 128 exercise dirs: 2 mw-bb + 45 mw-bw + 25 mw-cable + 56 voltra.
- [ ] No mixed-provider exercises: every voltra-* dir's `fingerprint.json` shows `model: gemini-3-pro-image-preview`.
- [ ] `manifest.generated.ts` references all 128 exercises with start+end paths and alt text.
- [ ] `npm test` passes (manifest count threshold updated).
- [ ] CI `bundle-gate.yml` passes (≤ 8 MB warn, definitely ≤ 12 MB fail).
- [ ] CI typecheck + lint clean.
- [ ] App boots and renders illustrations in `ExerciseDetailDrawer` for at least one exercise from each of the 4 prefix families (mw-bb, mw-bw, mw-cable, voltra).
- [ ] Owner contact-sheet review acknowledged in implementation-issue comment (red-flag IDs deferred to follow-up issue, not blocking).
- [ ] Source branch `bld-561-gemini-illustrations-review` archived (delete remote ref) after merge.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Manifest shape on branch differs from main's | Techlead spec'd in Step 2 — claudecoder either updates manifest to match main's shape or extends `resolve.ts`. Decision documented in implementation PR. |
| Test snapshots reference old voltra gpt-image-1 webps | Update snapshots once and confirm visual diff is the expected provider swap. |
| Bundle gate fails (>8 MB warn) | Pre-checked: 4.36 MB total. If unexpected slack pushes us over, drop the contact-sheet HTML files (large, dev-only) into `.gitignore` or move to `assets/exercise-illustrations/curation-tooling/` excluded from app bundle. |
| Exercise ID exists in main's seed list but missing from branch's manifest | Identified during Step 2 diff. Fall back to text-only for that exercise (current behavior); file follow-up to generate. |
| Exercise ID exists in branch's manifest but not in main's seed list | Drop from manifest. Don't ship orphaned assets. |
| Custom user exercises | Unaffected — text-only as before. |
| App boot breaks because Metro bundler chokes on 256 webps | Unlikely (RN handles thousands), but if so, lazy-load via require() on demand in `resolve.ts`. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Manifest shape divergence | Medium | Med | Step 2 techlead diff before commits |
| Some Gemini illustrations look anatomically wrong | High | Low | Owner contact-sheet pass; re-roll follow-ups |
| Bundle bloat from contact-sheet HTML | Low | Low | Move out of bundled `assets/` if needed |
| Branch deletion loses generator history | Low | Low | Keep tag `archive/bld-561-gemini-illustrations-review` before deleting branch |
| Owner dislikes Gemini style after seeing all 128 | Low | High | Contact-sheet review BEFORE merge gives an early bail-out point |

## Plan-File Confidence (Owner-Visible)

This plan is shippable as-is. The single open technical decision is **manifest shape match** (Step 2), which is a 30-minute techlead task before claudecoder writes any code. Everything else is mechanical asset cherry-picking + test threshold updates.

## Review Feedback

### Quality Director (UX + integrity)
_Pending_

### Tech Lead (feasibility + manifest shape)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO (informational illustration content, no behavior triggers).

### CEO Decision
_Pending_
