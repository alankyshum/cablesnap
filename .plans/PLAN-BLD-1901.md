# Feature Plan: Brand coral CTA fails WCAG AA contrast + collapses under CVD (systemic)

**Issue**: BLD-1901  **Author**: CEO  **Date**: 2026-06-25
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Origin**: UX CVD audit BLD-1900 (Record CTA + nav pill collapse to olive under deuteranopia/protanopia)

---

## Problem Statement

The brand primary token pairs **white text (`primaryForeground`/`onPrimary` = `#FFFFFF`) on Electric Coral (`primary` = `#FF6038` light / `#FF7A55` dark)**. Measured WCAG contrast:

| Pair | Ratio | WCAG AA normal text (4.5:1) | WCAG AA large text (3:1) |
|------|-------|------------------------------|---------------------------|
| White on `#FF6038` (light) | **3.01:1** | ❌ FAIL | ✅ pass (large only) |
| White on `#FF7A55` (dark) | **2.57:1** | ❌ FAIL | ❌ FAIL |

*(Both ratios independently re-derived from the WCAG 2.1 relative-luminance formula — they match the audit's measurements exactly: 3.008 and 2.571.)*

This is **systemic, not one-button**. `onPrimary` is a single semantic token (`hooks/useThemeColors.ts:17` → `t.primaryForeground`) consumed at **100+ call sites across 30+ components** (verified via grep: FormVideoSheet, PRCelebration, QuickAddFab, CenterButton, FloatingTabBar, SetRow check icon, all "Save" action labels, Record-a-clip CTA, etc.). Every white-on-coral label/icon in the app is below AA.

The BLD-1900 CVD audit is a **symptom**: under deuteranopia/protanopia the coral desaturates toward olive, and because the white foreground was already borderline, the affordance + legibility collapse together. Fixing root-cause contrast also fixes the CVD-collapse legibility (it does not, by itself, restore *hue distinctness* — see §Scope-Out and the §UX Design "non-color affordance" note).

**Why now:** a11y debt compounds — every new component that uses `onPrimary` inherits the failure. This is also a near-exact repeat of **BLD-21** (`.learnings/pitfalls/theming.md`): *"White text on the orange intermediate badge failed WCAG contrast… a static `onSemantic` constant is fundamentally wrong for multi-hue palettes."* We already learned this lesson once at the difficulty-badge level; this plan applies it at the brand-primary level.

---

## Behavior-Design Classification (MANDATORY)

- [x] **NO** — purely visual/a11y. No streaks, notifications, gamification, motivational copy, onboarding loops, or any §3.2 trigger. **No psychologist review required.**

---

## User Stories

- As a **low-vision user**, I want primary CTA labels to meet WCAG AA contrast so I can read "Record", "Save", "Quick Add" without straining.
- As a **color-vision-deficient user** (deuteranopia/protanopia, ~6% of males), I want the white-on-coral text to remain legible when the coral desaturates toward olive under my vision.
- As a **maintainer**, I want a single-token, regression-guarded fix so future components inherit AA-compliant primary contrast automatically, with an automated test that fails CI if the ratio regresses.

---

## Proposed Solution

The fix lives almost entirely at **two token definitions** in `theme/colors.ts` (light + dark `primaryForeground`) because `onPrimary` is a single semantic token. There are three viable strategies; the plan **recommends Option A** and asks reviewers to confirm or override.

### Solution Options (decision required from reviewers)

#### ✅ Option A — Foreground flip to navy (RECOMMENDED)

Change `primaryForeground` from `#FFFFFF` → **`#1A2138`** (the existing brand navy `foreground`/`secondary`) in **both** light and dark.

| Pair | Ratio | AA normal (4.5)? |
|------|-------|------------------|
| Navy `#1A2138` on `#FF6038` (light) | **5.30:1** | ✅ PASS |
| Navy `#1A2138` on `#FF7A55` (dark) | **6.19:1** | ✅ PASS |

- **Brand color preserved exactly** — Electric Coral `#FF6038`/`#FF7A55` is untouched everywhere (CTAs, FAB, tab bar, `ring`, `inversePrimary`, native splash in `app.config.ts`).
- **Smallest diff** — ~2 token edits + regression test; zero per-component churn.
- **Precedent-aligned** — same shape as BLD-21 fix (wrong foreground on a fixed-hue surface → correct the foreground, not the surface).
- **Trade-off:** white→navy is a visible brand-feel change (coral buttons get dark text instead of white). Reviewers must accept this aesthetic shift. Navy-on-coral is a common, legible, premium-looking pairing, but it IS different from today.
- **Ripple to verify:** a handful of sites use `onPrimary` *inverted* — as a **background** with `primary` as the text (e.g. `components/history/CalendarGrid.tsx:84-90`, `components/progress/CalendarGrid.tsx`). Flipping `onPrimary` to navy turns those selected-day dots/badges navy-with-coral-text. Must be visually checked + snapshot-tested (acceptable, but not free). This is the one non-cosmetic ripple and is called out explicitly for techlead.

#### Option B — Darken the coral, keep white text

Darken `primary` to the first AA-passing value on the same hue/sat ray: `#FF6038` → **`#C74B2C`** (light), with a matching dark value. White-on-`#C74B2C` = 4.70:1 ✅.

- **Keeps white text** (no foreground change; CTAs still feel "white-on-warm").
- **Heavy brand cost:** requires a **~22% luminance drop** — the "Electric Coral Energy" identity shifts to a muddier brick/terracotta. Affects every coral surface app-wide, plus `ring`, `inversePrimary`, native splash, marketing/screenshots.
- **Larger ripple than A** (background fill changes everywhere, not just foreground).
- Documented for completeness; **not recommended** because it sacrifices the core brand color to keep a foreground color.

#### Option C — Hybrid (foreground flip + keep white only on icon-glyph affordances)

Flip text to navy (Option A) but retain white for **large non-text glyphs** (≥24dp icons like the FAB `+`, tab-bar center button) where WCAG large/non-text thresholds (3:1) are already met by white-on-coral and a navy glyph would look heavy.

- **Most visually polished**, preserves the iconic white FAB glyph.
- **Cost:** introduces a second token (`onPrimaryStrong` / per-use override) → reintroduces exactly the "two foreground colors on one surface" complexity. Higher diff + per-site audit of which `onPrimary` usages are text vs. large-glyph.
- Offered as a fallback if reviewers find full-navy too austere on icons.

**CEO lean:** Option A. It is the minimal, brand-preserving, precedent-aligned fix. Option C only if QD/TL judge navy glyphs visually unacceptable on the FAB/tab bar.

### Overview

1. Edit `theme/colors.ts`: `lightColors.primaryForeground` and `darkColors.primaryForeground` per the chosen option (A → `#1A2138` both; B → keep `#FFFFFF`, change `primary` values; C → A + a documented `onPrimaryStrong` token).
2. Add a **WCAG contrast regression unit test** (headless, no device) asserting AA for the primary text pair in both themes. This is the durable guard so this debt never silently returns.
3. Visually verify the inverted-`onPrimary` sites (CalendarGrid selected-day badges/dots) and snapshot them in both themes.
4. Re-run the existing axe-based e2e contrast gate (`e2e/design-quality.spec.ts`, `wcag21aa` tags) to confirm no new contrast warnings.

### UX Design (flow, inputs, a11y, error/empty states)

- **No flow change.** Purely a token recolor — same buttons, same positions, same interactions.
- **A11y:** the entire point — moves white-on-coral text from 2.57–3.01:1 (FAIL) to 5.30–6.19:1 (PASS) under Option A.
- **CVD note (scope boundary):** This fixes *legibility* under CVD (text stays readable when coral→olive). It does NOT restore *hue distinctness* (coral vs olive). If reviewers want the BLD-1900 audit's "secondary non-color affordance" (e.g. icon/weight/shape differentiator so the CTA reads as primary even when desaturated), that is a **separate, additive** concern — see §Scope-Out. This plan deliberately keeps the systemic contrast fix atomic and small; a non-color-affordance change would be its own reviewed plan.
- **Empty/error states:** N/A — no new UI.

### Technical Approach (architecture, data model, deps, perf, storage)

- **Architecture fit:** single-token edit in the existing semantic palette (`theme/colors.ts` → `useThemeColors.ts` mapping). No new abstractions for Option A. No new deps. No data-model or storage impact. No perf impact.
- **Test infra (already exists):** `__tests__/lib/small-lib-batch.test.ts:104` already asserts palette properties; the new contrast test slots beside it (or a dedicated `__tests__/theme/primary-contrast.test.ts`). The repo already ships an axe WCAG-AA e2e gate (`e2e/helpers.ts:129` tags `wcag2aa`/`wcag21aa`; `e2e/design-quality.spec.ts:510,662` `contrast-warning`), giving an end-to-end backstop with zero new tooling.
- **Implementer:** claudecoder (low-complexity token + test). Techlead reviews ripple. QD independently verifies.

---

## Scope

**In:**
- Change `primaryForeground` (light + dark) in `theme/colors.ts` to make the primary **text** pair pass WCAG AA (4.5:1) in both themes (Option A unless reviewers choose B/C).
- Add a headless WCAG contrast **regression test** for the chosen primary text pair, both themes.
- Visually verify + snapshot the inverted-`onPrimary`-as-background sites (CalendarGrid family).
- Run the existing axe e2e contrast gate; confirm no new warnings.

**Out:**
- **Non-color CVD affordance** (icon/weight/shadow so primary reads as primary under desaturation) — separate additive plan if desired. This plan = contrast root-cause only.
- `onPrimaryContainer`/`primaryContainer` pairs (`accent`/`accentForeground` = `#FFE0D6`/`#6B1F0A`) — those are a *different* token pair; not implicated by the audit and out of scope unless QD flags them failing during verification.
- Domain palettes (heatmap, plate colors, muscle map) — independent tokens.
- Any visual redesign of buttons beyond the foreground/background token value.

---

## Acceptance Criteria

- [ ] **AC1 (light AA):** Given the light theme, the primary text pair (`primaryForeground` on `primary`) computes **≥ 4.5:1** WCAG contrast. (Option A target: navy `#1A2138` on `#FF6038` = 5.30:1.) `[TODO-test: BLD-1901]` (computed-contrast unit test authored in the implementation issue)
- [ ] **AC2 (dark AA):** Given the dark theme, the primary text pair computes **≥ 4.5:1**. (Option A target: navy `#1A2138` on `#FF7A55` = 6.19:1.) `[TODO-test: BLD-1901]`
- [ ] **AC3 (regression guard):** A headless unit test fails CI if either pair drops below 4.5:1. Test imports the actual `theme/colors.ts` tokens (not hardcoded copies) and computes the WCAG ratio. `[TODO-test: BLD-1901]`
- [ ] **AC4 (inverted-usage integrity):** Sites using `onPrimary` as a *background* (`history/CalendarGrid.tsx`, `progress/CalendarGrid.tsx`) render correctly and remain legible in both themes; verified by snapshot test or explicit visual check. `[TODO-test: BLD-1901]`
- [ ] **AC5 (no axe regression):** The existing `wcag21aa` axe e2e gate reports **no new contrast warnings** attributable to this change. `[gate: existing axe wcag21aa e2e gate — e2e/design-quality.spec.ts]`
- [ ] **AC6:** PR passes all tests with no regressions; no new lint warnings (note `theme/colors.ts` hex is the sanctioned token-definition site; `no-restricted-syntax` exemptions stay scoped as today). `[gate: CI test + lint suite]`

### Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)

This fix is **fully headless-verifiable** — no device/manual step is strictly required. Mapping:

| AC needing visual judgment | Risk it covers | Headless proxy that satisfies the same risk |
|----------------------------|----------------|---------------------------------------------|
| AC1/AC2 "looks readable" | Text below WCAG AA on brand surfaces | **Computed WCAG contrast unit test** over the real exported tokens (deterministic, no rendering) — this IS the authoritative check, not a proxy. |
| AC4 inverted-`onPrimary` selected-day badges "look right" | Foreground flip silently breaks a site that used `onPrimary` as a fill | **Component snapshot test** of `history/CalendarGrid` + `progress/CalendarGrid` in light+dark; assert selected-cell fg/bg token wiring. |
| AC5 "no other contrast surprises" | Some white-on-coral site bypasses the token | **Existing axe `wcag21aa` e2e gate** (`e2e/design-quality.spec.ts`) run headless against test routes. |

**No-device waiver (pre-authorized at scope time):** On-device pixel verification of the new navy-on-coral buttons across iOS/Android is **NOT required** for merge. The contrast guarantee is mathematical (token-level) and the axe gate + snapshots cover wiring. A post-merge UX audit screenshot may confirm aesthetics but must not block the merge. QD should not block on "tested on a physical phone."

---

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Inverted `onPrimary` used as background (CalendarGrid selected day) | Renders navy fill w/ coral text (Option A); legible, snapshot-pinned |
| Large non-text glyph (FAB `+`, tab-bar center icon) | Option A: navy glyph (still ≥3:1, acceptable). Option C path if reviewers want white retained |
| Dark mode | `primaryForeground` change applied to `darkColors` too; AC2 enforces ≥4.5:1 |
| Disabled primary button | Uses `surfaceDisabled`/`onSurfaceDisabled` — unaffected |
| `primaryContainer` chips/badges (`accent`/`accentForeground`) | Out of scope; different token pair, already dark-on-light-coral |
| Future component adds `onPrimary` text | Inherits AA automatically; regression test guards the token |
| `ring` / `inversePrimary` / native splash (`app.config.ts` `#FF6038`) | Option A leaves `primary` untouched → these are unchanged (a key advantage over Option B) |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Brand-feel shift (white→navy on coral) perceived as regression by owner | Medium | Medium | Surface explicitly to QD/owner before merge; Option C fallback keeps white glyphs; coral itself is unchanged |
| Inverted-`onPrimary` site (CalendarGrid) renders oddly | Low | Low | AC4 snapshot + visual check; only ~2 known sites |
| Some component hardcodes `#FFFFFF` instead of `onPrimary` (token bypass) | Low | Low | axe e2e gate (AC5) catches residual white-on-coral; grep audit during implementation |
| Reviewers prefer Option B/darken | Medium | Low | Plan documents B fully with exact `#C74B2C` value + brand-cost trade-off; decision is theirs |
| Regression test asserts wrong threshold | Low | Medium | AC3 fixes threshold at 4.5:1 (WCAG AA normal text), tested against real exported tokens |

---

## Review Feedback

### Quality Director (UX / contrast)
_Pending_ — Please critique: (1) Is Option A (navy foreground) the right call vs B/C? (2) Are the inverted-`onPrimary` sites (CalendarGrid) the only ripple, or are there others I missed? (3) Is the no-device waiver acceptable, or do you require an on-device/audit screenshot before `done`? (4) Should `primaryContainer`/`accent` pair be pulled in-scope, or confirmed passing separately?

### Tech Lead (Feasibility / ripple-regression)
_Pending_ — Please critique: (1) Confirm `onPrimary` is the *only* mapping of `primaryForeground` and that no component hardcodes `#FFFFFF` for primary surfaces (token-bypass risk). (2) Is a single token edit + regression test the correct minimal surface, or do you see a larger ripple (e.g. `inversePrimary`, snapshot churn) that warrants more AC? (3) Best home for the contrast regression test (`__tests__/theme/` vs beside small-lib-batch). (4) Any concern with the inverted-`onPrimary`-as-background sites.

### Psychologist (Behavior-Design)
N/A — Classification = NO (pure a11y/visual, no behavior-shaping triggers).

### CEO Decision
_Pending_ — awaiting QD + Techlead verdicts; will select final option and create the implementation issue.
