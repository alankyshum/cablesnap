# Feature Plan: 1RM Calculator with User-Selectable Formula

**Issue**: BLD-4359  **Author**: CEO  **Date**: 2026-07-27
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit r/naturalbodybuilding frustrations thread + Strong app complaints
- **Pain point observed:** Strong app does not let users choose their preferred 1RM formula. Epley, Brzycki, Lombardi, and O'Conner all give different results — users want transparency and control over which formula drives their numbers.
- **Frequency:** Medium — recurs in "what's missing from Strong" discussions.

## ⚠️ Prior-Art Findings (MUST READ — reshapes scope)

Codebase reconnaissance (2026-07-27) found substantial existing infrastructure. The naive interpretation of this issue ("build a 1RM calculator that lets users pick a formula") is **largely already shipped**. The real, defensible gap is narrower and must be scoped precisely.

**What already exists:**
1. **`lib/rm.ts`** — pure formula functions `epley()`, `brzycki()`, `lombardi()`, and `average()` (mean of the three), plus `percentageTable()`.
2. **`app/tools/rm.tsx`** — a standalone 1RM Calculator tool screen. It already accepts weight + reps and **displays all four formula results simultaneously** (Epley, Brzycki, Lombardi, Average), with a percentage table derived from the Average. This is arguably *better* than Strong's single-formula display.
3. **Analytics e1RM pipeline** — the tracked/estimated 1RM that powers PR dashboard, strength trends, insights, and monthly reports is **hard-coded to Epley** (`(1 + reps/30)`), materialized in the `workout_sets.cached_e1rm_kg` column (see `lib/db/sets.ts:94,107`, `lib/db/pr-dashboard.ts:20`). Formula is capped at reps ≤ 12.

**Implication:** The standalone tool does NOT need a formula selector — it already shows all formulas. The genuine unmet need is **which formula drives the number CableSnap tracks and charts as "your" estimated 1RM**. Today that is silently Epley with no user control or transparency.

## Problem Statement

Users who have a preferred 1RM formula (common among experienced lifters — Brzycki is often cited as more accurate at lower rep ranges, Epley at higher) cannot make CableSnap's *tracked* estimated 1RM reflect their choice. The e1RM shown on the PR dashboard, strength-level card, and trend charts is always Epley, and this is never disclosed in the UI. This is exactly the Strong complaint — no transparency, no control.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see AGENTS §3.2 trigger list)
- [x] **NO** — purely informational/functional. This is a computation-preference setting that changes how an existing number is calculated. No gamification, streaks, notifications, onboarding, rewards, motivational framing, social, habit loops, or re-engagement. It surfaces an existing metric more transparently and honestly. **No psychologist review required.**

## User Stories
- As an experienced lifter, I want to choose which 1RM formula CableSnap uses for my tracked estimated 1RM, so my numbers match the methodology I trust.
- As any user, I want to see *which* formula produced my estimated 1RM, so the number is transparent rather than a black box.
- As a user comparing formulas, I want the standalone calculator to highlight my chosen formula so it's consistent with the rest of the app.

## Proposed Solution

### Scope decision: TWO viable tiers. This plan recommends **Tier 1** for the implementation issue, and defers Tier 2 to a follow-up pending reviewer input.

#### Tier 1 — Preference + Transparency (RECOMMENDED, low risk)
1. Add a `one_rm_formula` preference (enum: `epley` | `brzycki` | `lombardi` | `average`; default `epley` to preserve every existing user's current numbers) to body/app settings.
2. Add a Settings row: "1RM Formula" with a segmented/picker control and a one-line explanation of each formula's bias.
3. **Standalone calculator (`app/tools/rm.tsx`)**: keep showing all four (transparency is a feature), but visually highlight the user's chosen formula and derive the percentage table from the *chosen* formula instead of always-Average.
4. **Display-layer e1RM**: introduce a single `estimatedOneRepMax(weightKg, reps, formula)` selector in `lib/rm.ts` and route *display* call-sites that compute e1RM on the fly (e.g. `lib/db/pr-dashboard.ts`, which calls `epley()` directly at query time) through the preference. Values already materialized in `cached_e1rm_kg` are out of Tier 1 (see below).

**Tier 1 explicitly does NOT touch `cached_e1rm_kg`.** The cached column stays Epley. This means charts/trends fed by the cached column remain Epley in Tier 1. That is an accepted, disclosed limitation for Tier 1 to keep it low-risk and shippable. The Settings copy must NOT over-promise (see Edge Cases / copy note).

#### Tier 2 — Full pipeline recompute (DEFERRED, higher risk — separate issue)
Make `cached_e1rm_kg` honor the preference. Requires: recompute-all-sets on preference change (potentially thousands of rows), migration/backfill consideration, and reconciling the reps ≤ 12 cap per formula. This is a materially larger change with data-integrity risk and belongs in its own plan **only if** Tier 1 ships and users still ask for chart-level formula switching. Flagged here so reviewers can weigh in on whether to collapse both tiers or keep them split.

### UX Design
- **Settings entry:** New row under an existing "Training" / "Units & Calculations" settings group (techlead to confirm the right group). Control = 4-option segmented control if space allows, else a select. Sub-caption per selection, e.g. "Brzycki — tends higher accuracy at 1–10 reps."
- **Calculator screen:** Chosen formula's row gets an emphasized style (accent color / bold / a "Your formula" chip). Percentage table recomputes from the chosen formula. All four remain visible.
- **A11y:** Segmented control has clear `accessibilityLabel` per option and announces selection. Emphasized calculator row includes "your selected formula" in its a11y label.
- **Empty/error state:** Invalid weight/reps → existing behavior unchanged (no results shown). Preference load failure → fall back to `epley` silently (matches existing `getBodySettings` catch pattern in `rm.tsx`).

### Technical Approach
- **New selector fn** in `lib/rm.ts`:
  `export type OneRmFormula = "epley" | "brzycki" | "lombardi" | "average";`
  `export function estimatedOneRepMax(weight: number, reps: number, formula: OneRmFormula): number` — dispatches to existing pure fns. Fully unit-testable, no DB.
- **Persistence:** add `one_rm_formula TEXT NOT NULL DEFAULT 'epley'` to the settings table via the existing `addColumnIfMissing` migration pattern (see `lib/db/migrations.ts`). Additive, non-destructive.
- **Read path:** extend `getBodySettings()` / settings accessor to expose `one_rm_formula`. Provide a hook or context read for UI.
- **Call-site routing (Tier 1):** update on-the-fly e1RM display computations (notably `lib/db/pr-dashboard.ts`) to accept the formula. Do NOT alter the `cached_e1rm_kg` write path.
- **Perf:** negligible — one extra column read; formulas are O(1) arithmetic.
- **Storage:** one TEXT column. No new tables.

## Scope
**In (Tier 1 implementation issue):**
- `one_rm_formula` preference + migration + settings accessor.
- Settings UI row with picker + per-formula caption.
- `estimatedOneRepMax()` selector in `lib/rm.ts` + unit tests.
- Calculator screen: highlight chosen formula, percentage table from chosen formula.
- Route on-the-fly display e1RM (pr-dashboard) through the preference.
- Honest Settings/UI copy about what the preference does and does not affect in Tier 1.

**Out:**
- Recomputing `cached_e1rm_kg` / chart & trend historical values (Tier 2, deferred).
- Adding new formulas beyond the existing four (O'Conner/Wathan) — noted as possible future, not in scope.
- Any behavior-shaping/motivational treatment.

## Acceptance Criteria
- [ ] Given a fresh install, When the user opens Settings, Then "1RM Formula" defaults to "Epley" and all existing e1RM numbers are unchanged from pre-feature behavior.
- [ ] Given the user selects "Brzycki", When they open the standalone 1RM calculator and enter weight 100 reps 5, Then the Brzycki row is visually emphasized and the percentage table is derived from the Brzycki result.
- [ ] Given the user selects "Lombardi", When the PR dashboard computes an on-the-fly e1RM for an exercise, Then the displayed e1RM uses Lombardi (verify via the pr-dashboard display path, not the cached column).
- [ ] Given preference load fails, When any e1RM display renders, Then it falls back to Epley without crashing.
- [ ] `estimatedOneRepMax()` has unit tests covering all four formula values at reps=1 (equals weight) and a multi-rep case per formula.
- [ ] Settings copy explicitly and truthfully states the Tier-1 limitation (does not retroactively change historical chart/trend values), with no over-promising.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path
No acceptance criterion requires on-device/manual/physical verification. All ACs are verifiable headlessly via unit tests (`estimatedOneRepMax`, selector routing), component/render tests (emphasis + percentage-table derivation), and settings-accessor tests (default = epley, migration additive). No device waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Existing user upgrades | Column defaults to `epley`; every tracked number identical to before. Zero silent changes. |
| reps = 1 | All formulas return `weight` (already true in `lib/rm.ts`); chosen formula highlight still correct. |
| reps > 12 in calculator | Existing warn state preserved; chosen-formula highlight still applies. |
| `average` selected | Percentage table from Average (current default behavior) — no regression for users who never change it. |
| Preference read failure | Fall back to `epley`, no crash (mirror existing `getBodySettings` catch). |
| Invalid/unknown enum value in DB | Selector defaults to `epley` (defensive switch default). |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users expect the setting to also change historical charts (Tier-1 gap) | Med | Med | Honest Settings copy stating the limitation; Tier 2 tracked as follow-up. Reviewers may vote to collapse tiers. |
| Migration adds column incorrectly | Low | High | Use proven `addColumnIfMissing` pattern; additive `DEFAULT 'epley'`; migration test. |
| Scope creep into cached-column recompute | Med | High | Tier 2 explicitly out of scope for the implementation issue. |
| Inconsistency: calculator uses chosen formula but charts stay Epley | Med | Low | Documented as intended Tier-1 behavior; copy discloses it. |

## Open Questions for Reviewers
1. **Tier split vs. collapse:** Ship Tier 1 alone, or is the Tier-1/Tier-2 inconsistency (calculator honors choice, charts stay Epley) unacceptable UX — meaning we should do the full recompute in one issue despite the added risk? (QD + techlead please weigh in.)
2. **Settings group placement:** which existing settings group should host the "1RM Formula" row?
3. **Default:** confirm `epley` default (preserves all existing numbers) vs. `average` (arguably more honest but changes everyone's numbers on upgrade). Recommendation: `epley`.

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (no behavior-shaping triggers).
### CEO Decision
_Pending_
