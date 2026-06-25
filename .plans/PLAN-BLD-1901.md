# Feature Plan: Brand Coral CTA — WCAG AA Contrast + CVD Resilience

**Issue**: BLD-1901  **Author**: CEO  **Date**: 2026-06-25
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Origin audit**: BLD-1900 (Record CTA + nav pill collapse to olive under deuteranopia/protanopia)

## Research Source
- **Origin:** Internal UX CVD audit BLD-1900, route `/__test__/form-clips`, deuteranopia/protanopia emulation, commit `8e078793`.
- **Finding observed:** "Record a clip" primary CTA and "Record" nav pill shift from brand orange to an olive/mustard tone under red-green CVD; white-on-orange contrast estimated borderline below WCAG AA.
- **Frequency:** Systemic — the audited buttons are two instances of an app-wide pattern (`primary` + `onPrimary`). The same token pairing appears in ~117 sites across 30+ components.

## Problem Statement

The brand "Electric Coral" primary token and its white foreground **fail WCAG AA contrast for normal text today, independent of CVD**:

| Pair | Measured contrast | AA normal-text req (4.5:1) | AA large/UI req (3.0:1) |
|------|-------------------|----------------------------|--------------------------|
| `#FFFFFF` on light `primary #FF6038` | **3.01:1** | ❌ FAIL | ✅ pass (UI/large only) |
| `#FFFFFF` on dark `primary #FF7A55` | **2.57:1** | ❌ FAIL | ❌ FAIL |

(Verified with the same sRGB-relative-luminance formula used by `e2e/design-quality.spec.ts:191-238`.)

The CVD "olive collapse" reported in BLD-1900 is the visible *symptom*; the *root cause* is twofold:
1. **Contrast:** white-on-coral is ~3:1, below the 4.5:1 needed for the small (`fontSizes.xs`, weight 600 = normal-weight) button labels — so it fails AA even for fully-sighted users.
2. **Hue-only hierarchy:** primary affordance is signaled by coral hue alone. Under deuteranopia/protanopia the hue desaturates toward olive, erasing the "this is the primary action" signal because there is no redundant non-hue cue (weight, shadow, icon prominence).

Both are real, measurable, and WCAG-relevant (1.4.3 Contrast Minimum; 1.4.1 Use of Color). Fixing only the two audited buttons would leave the same defect in every other primary CTA, FAB, and badge.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see CEO §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely visual/accessibility. No streaks, notifications, rewards, onboarding, gamification, motivational copy, or re-engagement. **Psychologist review N/A.**

## User Stories
- As a user with deuteranopia or protanopia, I want primary action buttons to remain visually distinct as "the main action" so I can navigate the app without relying on perceiving the coral hue.
- As any user, I want button text to meet WCAG AA contrast so labels are legible in bright light / low-quality displays.
- As the product owner, I want the brand's coral identity preserved as much as possible while meeting accessibility standards.

## Proposed Solution

This plan presents **three candidate strategies** and a **recommendation**. Reviewers should pressure-test the recommendation and the rejected options.

### Decision space (measured)

Contrast of white text vs darker coral candidates (target ≥4.5:1 for normal text):

| Candidate coral | White contrast | Note |
|-----------------|----------------|------|
| `#FF6038` (current light) | 3.01:1 | fails |
| `#E04A1E` | 4.06:1 | still short of 4.5 |
| `#DB4216` | 4.37:1 | still short |
| `#D63A14` | 4.69:1 | ✅ passes, smallest hue shift to clear 4.5 |
| `#CC3A10` | 5.02:1 | ✅ comfortable margin |
| `#C73510` | 5.32:1 | ✅ |

Dark-text-on-coral alternative (keep current `#FF6038`, change foreground):

| Foreground on `#FF6038` | Contrast | On `#FF7A55` |
|--------------------------|----------|---------------|
| `#5A1600` | 4.51:1 ✅ | 5.27:1 ✅ |
| `#4A1200` | 5.07:1 ✅ | 5.93:1 ✅ |
| `#3A0E00` | 5.62:1 ✅ | 6.57:1 ✅ |

### Option A — Darken brand `primary` globally to AA-passing coral
Change `theme/colors.ts` `primary` (light `#FF6038` → ~`#D63A14`/`#CC3A10`; dark `#FF7A55` → an AA-passing darker coral) so white-on-primary clears 4.5:1 everywhere at once. `ring`, `muscle.light.primary`, and any mirrored hexes updated in lockstep.
- **Pros:** one change fixes all ~117 sites; brand stays "coral"; simplest mental model; no per-component edits.
- **Cons:** visibly shifts the whole brand toward red; risks subjective "that's not our orange" pushback; needs full CVD/visual re-baseline; `accent`/`accentForeground` and gradients may need retuning; biggest blast radius for visual-regression snapshots.

### Option B — Keep `#FF6038` hue, switch CTA foreground to dark coral (`onPrimary`/`primaryForeground`)
Change `primaryForeground` from `#FFFFFF` to a dark coral (e.g. `#3A0E00`) so the existing hue passes AA, *plus* add a redundant non-hue cue (subtle elevation/shadow or heavier weight) on primary CTAs for CVD hierarchy.
- **Pros:** preserves the exact brand orange; dark-on-coral is high contrast and reads as "filled/active"; smaller perceived change than darkening the fill.
- **Cons:** dark text on a saturated warm fill can look unusual/"old"; many components assume white foreground on primary; inverts a long-standing visual convention; still hue-driven hierarchy unless the redundant cue is added.

### Option C — Introduce a dedicated `primaryAction` token + redundant cue (RECOMMENDED)
Add a **new** semantic pair used specifically for filled primary *action* surfaces (CTAs, FABs, primary `Button` default variant):
- `primaryAction` = AA-passing darker coral (`#CC3A10` light / darker coral dark) with `onPrimaryAction = #FFFFFF` (white-on-`#CC3A10` = 5.02:1 ✅; pick a dark value with ≥5:1 in both themes).
- Leave `primary` (`#FF6038`) as the **brand identity / accent / non-text** color (focus ring, decorative fills, selected states) where the 3:1 UI threshold is sufficient and the vivid hue is desirable.
- Add **one redundant non-hue cue** to primary action buttons (decided in review — candidates: subtle `boxShadow`/elevation, slightly heavier label weight `700`, or a small leading icon already present on the Record buttons) so hierarchy survives CVD per WCAG 1.4.1.
- **Pros:** preserves vivid brand coral where it's decorative; guarantees AA on all *text-bearing* CTAs; gives a single semantic hook to migrate components incrementally (audited buttons first, then sweep); redundant cue directly answers the CVD finding rather than just the contrast number.
- **Cons:** two coral shades to maintain; requires a migration sweep of the ~30 components using `onPrimary` on a filled `primary` background; need a lint/test guard so new code uses `primaryAction` for filled CTAs.

### Recommendation
**Option C.** It is the only option that fixes *both* defects (contrast AND hue-only hierarchy) while protecting the brand identity, and it gives a clean, testable migration path. Scope the implementation in two waves:
1. **Wave 1 (this PLAN's implementation issue):** add tokens + redundant cue; migrate the BLD-1900 surfaces (`FormLibraryTab` Record pill + "Record a clip" CTA + sibling "Compare" CTA) and the canonical `components/ui/button.tsx` `default` variant. Add a guarding contrast test.
2. **Wave 2 (follow-up issue):** sweep remaining filled-primary CTAs/FABs/badges to `primaryAction`; add a lint/grep CI guard against white-on-`primary` text. Tracked as a child issue, not blocking Wave 1.

> Reviewers: if you believe a single global darken (Option A) is preferable for brand consistency and lower maintenance, say so explicitly with rationale — that is a legitimate alternative and easy to switch to.

### UX Design
- **Flow:** unchanged. No layout, copy, or interaction changes.
- **Visual:** primary CTAs use a slightly deeper coral fill (Option C) — still unmistakably "coral", just AA-safe — plus a subtle redundant cue (TBD in review). Decorative coral (focus ring, selection) unchanged.
- **A11y:** all text-bearing primary CTAs reach ≥4.5:1 (normal text). Hierarchy no longer depends on hue alone (1.4.1). Disabled state contrast unchanged (already outline-based).
- **Error/empty states:** the "Record a clip" CTA lives in the empty state — covered by Wave 1.

### Technical Approach
- **Tokens:** add `primaryAction` / `onPrimaryAction` to both `lightColors`/`darkColors` in `theme/colors.ts`; surface via `hooks/useThemeColors.ts` and `hooks/useColor.ts`.
- **Components (Wave 1):**
  - `components/session/FormLibraryTab.tsx` — `RecordCTAButton` (`:396` bg, `:385`/`:402` fg), "Record a clip" CTA (`:488` bg, `:493` fg), "Compare" CTA (`:440-445`). Swap `colors.primary`→`colors.primaryAction`, keep `onPrimary`→`onPrimaryAction`; add redundant cue to the `recordCTA`/`emptyRecordBtn` styles.
  - `components/ui/button.tsx` — `default` variant bg `:136`, fg `:164/:183`.
- **No hardcoded hex in styles** (per `.learnings/pitfalls/theming.md:21-27`) — always via the token.
- **Precedent to follow:** BLD-732/870 CVD fix in `components/WorkoutHeatmap.tsx` (lightness-step + redundant cue, "CVD-immune by construction" per `.learnings/patterns/react-native.md:917-923`); BLD-21 per-value contrast (`.learnings/pitfalls/theming.md:13-19`).
- **Validation:**
  - Extend/assert in `e2e/design-quality.spec.ts` contrast suite that the Record CTA + nav pill text reach ≥4.5:1 in light and dark.
  - Re-run `e2e/scenarios/form-clips.spec.ts` + `capture-with-cvd.ts` to produce fresh deuteranopia/protanopia baselines and confirm the olive-collapse hierarchy signal is preserved by the redundant cue.
  - Typecheck + existing visual snapshot suite green (no unintended brand-wide drift in Wave 1).

## Scope
**In (Wave 1 / implementation issue):**
- New `primaryAction`/`onPrimaryAction` tokens (light+dark) meeting ≥4.5:1 with their foreground.
- One redundant non-hue cue on primary action buttons (final choice locked in review).
- Migrate BLD-1900 surfaces: Record nav pill, "Record a clip" CTA, sibling "Compare" CTA, and `components/ui/button.tsx` `default` variant.
- Contrast assertion test + refreshed CVD baselines for `form-clips`.

**Out:**
- App-wide sweep of all remaining filled-primary CTAs/FABs/badges → **Wave 2 follow-up child issue** (non-blocking).
- CI lint/grep guard against white-on-`primary` text → Wave 2.
- Any change to decorative/non-text uses of `primary` (focus ring, selection, gradients).
- Native (iOS/Android) audit — web viewport only per BLD-1900 constraints.
- Tritanopia (blue-yellow) — not flagged; coral is unaffected.

## Acceptance Criteria
- [ ] Given the `form-clips` harness in light mode When measuring the "Record" nav pill label and "Record a clip" CTA label Then white-on-fill contrast is ≥4.5:1 (asserted in `design-quality.spec.ts`).
- [ ] Given dark mode When measuring the same labels Then contrast is ≥4.5:1.
- [ ] Given deuteranopia/protanopia emulation (`capture-with-cvd.ts`) When viewing the Record CTA + pill Then a non-hue cue (weight/shadow/icon) visibly distinguishes them as primary actions (no longer hue-only).
- [ ] Given the canonical `components/ui/button.tsx` `default` variant When rendered Then its label meets ≥4.5:1 with the new token.
- [ ] No hardcoded hex introduced in component styles — colors flow through tokens.
- [ ] PR passes all tests with no regressions; existing visual snapshots either unchanged or intentionally re-baselined with the diff explained.
- [ ] No new lint/type warnings.

### Headless Verification Path
All ACs are headless-feasible — no device/manual step required.
| AC | Headless proxy |
|----|----------------|
| Contrast ≥4.5:1 (light/dark) | `e2e/design-quality.spec.ts` sRGB-luminance contrast assertion on the rendered nodes |
| CVD hierarchy preserved | `e2e/scenarios/form-clips.spec.ts` + `capture-with-cvd.ts` deuteranopia/protanopia capture diff; redundant-cue presence asserted via style/DOM (shadow/weight) rather than visual judgment |
| No regression | typecheck + existing Playwright visual snapshot suite |

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Disabled Record pill | Unchanged — already transparent bg + outline + `onSurfaceVariant`; verify it still meets ≥3:1 non-text. |
| Dark mode | New dark `primaryAction` meets ≥4.5:1 with its foreground. |
| Pressed/hover (web) | Pressed state derived from new token retains ≥3:1 UI contrast. |
| Existing snapshots | Any intended pixel diff is re-baselined with a one-line rationale in the PR. |
| Components still on old `primary` (Wave 2 scope) | Continue to render; not regressed; tracked for Wave 2. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Brand owner dislikes deeper coral | Medium | Medium | Option C keeps vivid `#FF6038` for decorative use; only filled text CTAs deepen. Surface before/after in PR; cheap to retune shade. |
| Migration sweep misses a CTA | Medium | Low | Wave 2 adds grep/lint CI guard; Wave 1 limited to audited + canonical button. |
| Visual snapshot churn | High | Low | Expected; re-baseline with explained diff; Wave 1 scope is small to keep churn reviewable. |
| Redundant cue (shadow) perf on RN | Low | Low | Prefer weight/icon cue if shadow cost is a concern; decide in review. |
| Two coral tokens drift over time | Low | Medium | Document in `theme/colors.ts` comment + `.learnings`; Wave 2 lint guard enforces correct usage. |

## Review Feedback
### Quality Director (UX / contrast)
_Pending_ — please pressure-test: (1) Is Option C the right call vs a global darken (Option A)? (2) Which redundant non-hue cue best satisfies WCAG 1.4.1 without harming visual design? (3) Are the AA targets and test approach in `design-quality.spec.ts` sufficient? (4) Is the Wave 1 / Wave 2 split acceptable, or must the full sweep land atomically?
### Tech Lead (Feasibility)
_Pending_ — please pressure-test: (1) Token plumbing through `useThemeColors`/`useColor` — any gotchas? (2) Blast radius / regression risk of Wave 1; is `button.tsx` `default` variant safe to change in isolation? (3) Snapshot/baseline strategy. (4) Complexity realism of the two-wave plan.
### Psychologist (Behavior-Design)
N/A — Classification = NO (purely visual/accessibility, no behavior-shaping triggers).
### CEO Decision
_Pending_ — awaiting QD + Tech Lead approval.
