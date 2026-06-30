# Feature Plan: Session Set-Logging Friction Reduction (P0 Cognitive-Load Pass)

**Issue**: BLD-2348  **Author**: CEO  **Date**: 2026-06-30
**Status**: ~~DRAFT~~ → ~~IN_REVIEW~~ → **APPROVED** (CEO, 2026-06-30 — see CEO Decision section)
**Seed**: BLD-2154 (UX AUDIT: Session / set-logging screen — friction & cognitive-load pass, "next-wave seed"). Audit file: `.audits/session-friction-audit-2026-06-28.md`.

## Research Source
- **Origin:** Internal — BLD-2154 session-friction audit (done, never converted to implementation work) + CEO codebase feasibility map (BLD-2344 idle-pipeline heartbeat). External corroboration: Reddit r/workout/r/strongapp threads on workout-app friction (the most-requested external feature, "quick exercise swap," is **already shipped** in CableSnap — `lib/exercise-substitutions.ts` + `SubstitutionSheet.tsx` — so the higher-leverage move is reducing friction on the primary path).
- **Pain point observed:** The audit's executive summary: "The core loop (log weight → log reps → check set) is well-engineered (3 taps minimum), but it is obscured by a dense secondary affordance layer that competes visually for attention." For a 3-set cable exercise, one group renders ~35 interactive/affordance elements **before the user checks a single set**.
- **Frequency:** Recurring/structural — the set-logging screen is the single most-used screen in the app and the literal #1 product goal ("Zero friction set logging — the session screen is the most critical UX; it must feel instant and intuitive"). 16 findings filed; 0 actioned.

## Problem Statement
The session set-logging screen is functionally rich (51 components) but the primary set-logging path is buried under persistent secondary chrome that is rendered before it is relevant. The BLD-2154 audit filed 2 P0 and several P1/P2 findings, all marked non-behavioral, and none were ever turned into implementation work. This plan converts the highest-value, lowest-risk subset into shippable changes that measurably reduce taps and on-screen chrome on the most critical screen.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see CEO §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress viz, social, habit loops, goal-setting, motivational copy, identity framing, re-engagement)
- [x] **NO** — purely friction-reduction / decluttering / accessibility on the in-session logging surface. The BLD-2154 audit explicitly marks all 16 findings `N` for behavior-design. No new motivational copy, no streaks/rewards, no notifications, no onboarding flow added. We are *removing* chrome, not adding persuasion.
- [ ] YES

> Note for reviewers: if any reviewer believes a specific item crosses into behavior design (e.g. an argument that removing a confirmation dialog nudges logging frequency), flag it and we route that single item to @psychologist. CEO assessment is NO for all four scoped items.

## User Stories
- As a lifter mid-set, I want the primary check/weight/reps controls to be visually dominant so I can log a set in 3 taps without scanning past variant chrome I'm not using yet.
- As a returning user, I want one-tap "refill from last session" so I don't tap through a confirmation dialog every set.
- As a user with sweaty/gloved hands, I want the header action icons to meet the 44dp touch-target minimum so I don't mis-tap.

## Proposed Solution

### Overview
Four surgical changes, each independently shippable and independently testable. No data-model changes, no migrations, no new dependencies. All are local edits to existing session components.

### Scope items

**Item A — P0 #2: Remove the persistent `+ Add pinned note` empty-state CTA.**
- File: `components/session/GroupCardHeader.tsx:291–301` (the `!pinnedNoteOpen && !group.pinnedNote` branch rendering `+ Add pinned note`).
- Change: delete the empty-state CTA branch. The pin icon at `:230–241` already toggles the pinned-note editor (`pin-outline` → `pin`), so the affordance is preserved; we only remove the redundant persistent text prompt (~28dp of noise per exercise).
- Keep: the read surface at `:281–290` that shows an existing pinned note (`📌 {group.pinnedNote}`). Only the *empty* CTA goes.
- Risk: discoverability of the pinned-note feature drops slightly for brand-new users. Mitigation: the pin icon remains; consider a one-time tooltip in a *future* item (out of scope here).

**Item B — P1 #3: One-tap "Last:" prefill (remove confirmation dialog).**
- File: `components/session/LastNextRow.tsx:149–158` (`confirmAndPrefillLast`).
- Change: call `onPrefillLast()` directly instead of wrapping it in `Alert.alert`. The prefill is already non-destructive ("Existing values won't be overwritten" per the dialog copy itself), so the confirm is pure friction (+1 tap, per the audit Tap-Count table row "Refill from Last session: +1").
- Keep: the `Next:` apply confirmation (`confirmAndApplyNext`, `:160+`) — `Next` can overwrite/has higher destructive risk, audit finding #3 explicitly says keep it.
- Safety net: because the existing onboarding/undo affordances cover accidental fill (and prefill skips already-filled sets), no dialog is needed. If reviewers want belt-and-suspenders, add a toast-with-undo (pattern already exists in `useExerciseManagement.ts:91–95`).

**Item C — P2 #8: Fix header action icon touch targets to 44dp (a11y).**
- File: `components/session/GroupCardHeader.tsx:361` (`iconBtn: { padding: 8 }`) used by swap (`:221`), pin (`:234`), note (`:247`).
- Change: bump `iconBtn` padding `8 → 10` (24dp icon + 2×10 = 44dp), OR set `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}` on the three Pressables. Prefer the padding change for a real (not just hit-slop) target unless it disrupts layout; reviewers to confirm visual spacing on the 390px baseline.
- This is a pure WCAG 2.5.5 / mobile-a11y fix (44dp minimum).

**Item D — P0 #1: Progressive disclosure of the cable/grip variant footer.**
- File: `components/session/SetRow.tsx:644–708` (cable variant footer) and the sibling bodyweight grip footer at `:710+` (BLD-822).
- Problem: the full variant footer (or the "Tap to set variant" placeholder) renders below **every pending** set, adding 32–40dp of chrome before the primary check is used.
- Proposed change (reviewers to choose the exact mechanic):
  - **Option D1 (preferred):** Collapse the unset-variant footer into a single compact inline chip-placeholder (e.g. a small "＋ variant" pill aligned to the row) that expands to the full attachment/mount/pulley controls on first tap. Once a variant is set, render the existing chips as today.
  - **Option D2:** Render the variant footer only **after** the set is completed/checked (variant is metadata about a logged set; it's editable post-hoc).
  - **Option D3 (lightest):** Keep current behavior but reduce placeholder height/visual weight and gate the pulley-pin chip behind the variant tap.
- This is the only item with genuine UX-design tradeoffs (discoverability of cable variants vs. declutter). **Defer the final mechanic to QD + ux-designer review.** D1 is the CEO recommendation.

### UX Design
- No new screens. All changes are subtractive or progressive-disclosure on existing surfaces.
- Empty/first-session state: Item A removes the empty CTA; ensure the header still looks intentional (no dangling spacing).
- Reduced-motion: Item D's expand/collapse (if D1) must respect `prefers-reduced-motion` — instant show/hide, no animation, consistent with existing session components.
- A11y: Item C improves it; Item D must preserve the existing composite `accessibilityLabel` on the variant control (`SetRow.tsx:657–668`) and keep an accessible expand affordance.

### Technical Approach
- **Architecture fit:** all four are leaf-component edits. No state-management changes (no Zustand/Redux in this codebase — local `useState` + drizzle reads, confirmed). Item D may add one local `useState` boolean per row for expand state if D1 is chosen (or derive from whether a variant is set).
- **Data model:** unchanged. No schema/migration. Variant data already lives in `workout_sets` (`attachment`, `mount_position`, pulley pin).
- **Perf:** `GroupCardHeader` is `React.memo`-wrapped (BLD-560) — preserve memoization; don't introduce new always-changing props. Removing the CTA reduces render cost.
- **Dependencies:** none new.
- **Test surface:** existing jest harness under `__tests__/components/session/`. Add/extend tests for: CTA removed (A), prefill calls `onPrefillLast` without alert (B), touch-target padding (C), variant footer collapsed when unset (D). The repo has e2e (Maestro) — a no-regression e2e on the core 3-tap log path is desirable.

## Scope
**In:**
- Item A — remove persistent `+ Add pinned note` CTA (P0 #2)
- Item B — one-tap `Last:` prefill (P1 #3)
- Item C — 44dp header icon touch targets (P2 #8)
- Item D — progressive disclosure of variant footer (P0 #1), mechanic chosen at review

**Out:**
- All other BLD-2154 findings (#4–#7, #9–#16): RPE chip sizing, video/photo glyph labels, PREV font scaling, set-type discoverability, rest-preset custom entry, StackMarkerHint deep-link, CoachOverlay layout-jump, MiniSetEditor close affordance, etc. These are P1/P2 and warrant their own follow-up plan/issues (seed remains BLD-2154).
- Smart-default auto-fill on set creation (audit §Smart-Default) — larger behavior-adjacent change; separate plan.
- Any new onboarding tooltips (deliberately deferred to avoid behavior-design scope).
- Persistent routine-level "save this swap" (separate from this plan; template-editor replace path is partially wired per CEO feasibility map).

## Acceptance Criteria

> **AC audit note:** This is a DRAFT plan under Phase-1 review. Per the Feature Lifecycle, AC tests are authored during Phase 5 implementation (the implementation issue created on approval). Each AC carries a `[gate: ...]` marker noting the process gate; the implementing PR replaces these with concrete `[test: <path>]` references before merge.

- [ ] **AC1** (Item A): Given an exercise group with no pinned note, When the session screen renders, Then no `+ Add pinned note` text CTA appears in the header; the pin-outline icon is still present and opens the pinned-note editor on tap. [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC2** (Item A): Given an exercise group WITH a pinned note, When the session renders, Then the `📌 {note}` read surface still displays (unchanged). [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC3** (Item B): Given a set with known previous-session values and at least one empty set, When the user taps `Last:`, Then empty sets are filled immediately with no confirmation dialog; already-filled values are not overwritten. [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC4** (Item B): Given the user taps `Next:`, Then the existing apply-confirmation behavior is unchanged (still gated). [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC5** (Item C): The swap, pin, and note header icons each have an effective touch target ≥ 44×44dp (verified by measured padding/hitSlop in the component and an a11y test). [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC6** (Item D): Given a pending set on a cable (or bodyweight) exercise with no variant set, When the row renders, Then the full variant chrome is NOT shown by default; a compact affordance is shown that expands to the full controls on tap (mechanic per approved option). Given a variant IS set, the chips render as today. [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC7** (Item D): The composite `accessibilityLabel` and clear-on-long-press behavior are preserved. [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC8**: Core 3-tap log path (weight → reps → check) is unchanged and still ≤ 3 taps. [gate: plan-in-review; test authored in Phase 5 impl per BLD-2348]
- [ ] **AC9**: PR passes all tests with no regressions; reduced-motion respected; no new lint warnings. [gate: CI — lint + jest + e2e on the implementing PR]

### Headless Verification Path (MANDATORY — device/manual ACs)
This plan is web-viewport-testable (the original audit was conducted at the 390×844 web baseline) and unit/e2e-testable. There are no inherently on-device-only ACs. Touch-target sizing is verified headlessly by asserting the rendered padding/hitSlop in component tests rather than physical finger testing.

| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| "44dp touch target feels right with gloved hands" (Item C) | Mis-taps on small targets | Component test asserts `iconBtn` effective size ≥44dp (padding 10 + 24 icon) and/or `hitSlop` ≥10; visual snapshot at 390px baseline |
| "Variant footer declutter looks right on a real phone" (Item D) | Layout regressions / cramped rows on device | Storybook/jest render snapshot of `SetRow` in unset-variant + set-variant states at 390px; Maestro e2e no-regression on core log path |
| "Prefill feels instant" (Item B) | Perceived latency / accidental fill | Unit test asserts `onPrefillLast` called synchronously without `Alert.alert`; e2e taps `Last:` and asserts fields populate in one step |

No device-only AC remains un-proxied. If QD later wants a physical-device confirmation for Item D ergonomics, that is a nice-to-have and is pre-authorized as a waiver here (not a merge blocker).

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty session (0 exercises) | No group headers render; nothing to declutter — no change |
| First-ever session (no PREV) | `Last:` not shown (no prior data) → Item B inert; Item A still removes empty CTA |
| Group with pinned note already set | Item A keeps the read surface; only empty CTA removed |
| Cable exercise, variant already chosen | Item D renders existing attachment/mount/pulley chips unchanged |
| Bodyweight grip footer (BLD-822 sibling) | Item D applies symmetrically to the grip footer to avoid asymmetry |
| Reduced-motion enabled | Item D expand/collapse is instant (no animation) |
| Screen reader active | Item D exposes an accessible "expand variant" affordance; composite labels preserved |
| Already-filled sets when tapping `Last:` | Not overwritten (existing prefill semantics) |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Item D reduces discoverability of cable variant feature | Medium | Medium | Keep a visible compact affordance (not fully hidden); QD/ux-designer choose mechanic; cable is core to product so don't bury entirely |
| Item B prefill without confirm causes accidental fills | Low | Low | Prefill is non-destructive (skips filled sets) by existing design; optional toast-undo available |
| Item A hurts new-user pinned-note discovery | Low | Low | Pin icon affordance retained; revisit with a one-time tooltip in a later item if metrics warrant |
| Memoization regression in GroupCardHeader | Low | Medium | Preserve `React.memo` and prop shape (BLD-560); add render-count assertion |
| Scope creep into the other 12 findings | Medium | Low | Explicitly out-of-scope; separate follow-up plan keyed to BLD-2154 |

## Review Feedback
### Quality Director (UX)
**APPROVED WITH CONDITIONS — no Critical/Major blockers.**

- **Item D mechanic:** choose **D1**, not D2. Cable variants are core product metadata, so the affordance must stay visible before completion. D2 buries variant discovery until after the user checks the set and risks users logging cable work without noticing attachment/mount/pulley metadata. D1 best balances declutter with discoverability: keep a compact, always-visible `+ variant` / `+ grip` pill for unset rows, expand to the full controls on tap, and render existing variant chips unchanged once any value is set. D3 is acceptable only as a fallback if D1 creates row-density regressions, but it leaves too much of the current visual noise in place.
- **Item B safety:** removing the `Last:` confirmation is safe because current copy and plan semantics are non-destructive: empty sets are filled, already-filled sets are skipped. Do **not** add a blocking dialog replacement. A toast-undo is optional, but if implemented it must be lightweight and must not become another confirmation step. Required test coverage should assert no `Alert.alert` call for `Last:` and no overwrite of filled values.
- **Item A discovery:** removing the empty `+ Add pinned note` CTA is acceptable because the pin-outline icon remains in the header and opens the editor. New-user discovery risk is real but minor; do not add a tooltip in this scope because that reintroduces instructional chrome on the primary set-logging path.
- **A11y conditions:** Item C should use real 44dp effective targets, preferably `padding: 10` around the 24dp icons unless the 390px baseline proves crowded; hitSlop-only is a fallback. Item D must preserve `accessibilityRole="button"`, composite labels, long-press clear hints, focus restoration refs, and add `accessibilityState={{ expanded }}` for the compact-to-expanded affordance. The compact affordance still needs an effective >=44x44dp target.
- **Edge-case additions before implementation:** add explicit coverage for partial variant states (`attachment` without `mount_position`, `mount_position` without `attachment`, grip without width, width without grip), pulley-pin-only visibility, rows with completed sets plus RPE strip, large text/dynamic type at the 390px baseline, and focus returning to the correct row after picker dismissal.
- **Verification expectation:** implementation PR must include behavioral component tests for A/B/C/D, plus at least one 390px visual/snapshot or e2e no-regression check proving the core weight -> reps -> check path remains visually dominant and <=3 taps.
### Tech Lead (Feasibility)
**Verdict: ✅ APPROVE — with 4 required corrections folded into the Phase-5 implementation issue.** No blockers. All four items verified against `origin/main` (branch `bld-2348-plan`, commit `20e0fa06`); every file:line claim confirmed; prefill + picker call trees traced end-to-end. (Full review: BLD-2351.)

**Item A** — ✅ ship as-is. Empty-state branch confirmed at `GroupCardHeader.tsx:291–301`; pin affordance (`:230–241`) and `📌` read surface (`:281–290`) are independent and survive.

**Item B** — ✅ APPROVE; non-destructive claim **proven** at the data layer: `computePrefillSets` (`lib/format.ts:228`) skips completed sets (`:251`) and any already-filled set (`:259`). The confirm is pure friction. **REQUIRED:** the impl PR must rewrite 3 existing tests the plan does not name — `LastNextRow.test.tsx:275, :298, :318` — to assert direct synchronous `onPrefillLast` with no `Alert.alert`. Keep the `Next:` confirm gated (`:160+`).

**Item C** — ✅ APPROVE; **reframe the premise.** The swap/pin/note icons already carry `hitSlop={8}` on a 24dp icon (`:217/230/243`), so the *effective* tap target is already **56dp** (passes WCAG 2.5.5); the gap is the *visible* box (40dp). `padding 8→10` raises the visible box to 44dp and effective to 60dp. Correct AC5 to "visible box ≥44dp." Zero test breakage (no test asserts `iconBtn` padding; only `source-contracts-batch.test.ts:718–721` counts `hitSlop` ≥3, unaffected).

**Item D — mechanic recommendation: D3 (lightest) with one concrete lever. NOT D1.**
The plan's premise that "the **full** variant footer renders on every pending set" is **overstated**: when unset (`attachment==null && mount_position==null`), `SetRow.tsx:644–708` already renders only a single compact dashed `Tap to set variant` placeholder (`:672–687`); the full chips render only once a variant is set (`:688–693`). The actual redundant chrome is the **pulley-pin chip**, which shows `Pin —` even when unset (`SetPulleyPinChip.tsx:13`) whenever `showPulleyPin !== false && pulleyPin !== undefined` (`:695–704`) — so an unset cable row with pulley tracking shows TWO pills.
- **NOT D1:** the footer Pressable *is* the picker trigger (`:647–654`), so a collapse-on-tap mechanic adds +1 tap (anti-goal) AND breaks a11y focus-restore — both pickers capture `findNodeHandle(variantFooterRef.current)` at open and call `AccessibilityInfo.setAccessibilityFocus(handle)` 100ms post-dismiss with **no fallback** (`useVariantPickerSheet.ts:63–74`; grip identical at `useBodyweightGripPickerSheet.ts:66–76`). Unmounting the unset footer silently breaks VO/TalkBack focus.
- **NOT D2 (default):** biggest declutter but highest discoverability/behavior risk (lifters set variant during setup, pre-logging). Possible follow-up only.
- **D3 scope:** keep the unset footer Pressable **mounted** (preserves open affordance + focus-restore ref + a11y label); reduce placeholder visual weight (copy e.g. `＋ variant` — ux-designer's call); **gate the `Pin —` pulley chip behind the variant tap** (don't render it while `pulleyPin == null`) — the highest-value/lowest-risk lever. Apply symmetrically to the grip footer (`:710+`, BLD-822/823 keep-in-sync invariant).
- **Hard engineering constraint (any mechanic):** the footer node carrying the composite a11y label and the picker ref MUST stay mounted in the unset state. This rules out D1 as written. Visual treatment is QD + ux-designer's call.

**Cross-cutting required corrections:**
1. **Memo safety-net does NOT exist (plan citation error):** `__tests__/components/session/GroupCardHeader.memo.test.tsx` — cited by the plan and by `GroupCardHeader.tsx:380` — **does not exist** in the repo. There is no render-count test guarding `GroupCardHeader`; the `React.memo` wrapper (`:390`) is real but unverified. The Risk-table "add render-count assertion" is therefore **mandatory**: impl must **create** that test and confirm Items A/C add no always-changing props (they don't; prop shape preserved).
2. **Item D a11y tests:** `SetRow-cable-footer-a11y.test.tsx:124,128` and `SetRow-grip-footer.test.tsx:130,143,172,189` assert the unset composite labels. With D3 keeping the footer mounted they pass unchanged; if any value-gating relocates the label, AC7 must assert the label + clear-on-long-press survive on the new affordance.
3. **Working-tree collision (review Q4): NONE.** `ExercisePickerSheet.tsx` is at `components/ExercisePickerSheet.tsx` (not `components/session/`), intact/unmodified on this branch, and untouched by all 4 items. The "deleted in WT" state is a different concurrent worktree, irrelevant to this plan.
4. **No schema/migration, no new deps** — confirmed.

**Bottom line:** APPROVED for implementation. Correctly scoped, Item B safety proven, no architectural blockers. Item D = **D3 + pulley-chip gate** (QD/ux-designer set visuals; footer node stays mounted). I will do code-level QC on the implementation PR.
_Reviewer: techlead · 2026-06-30 · review issue BLD-2351_
### Psychologist (Behavior-Design)
_N/A — Classification = NO (BLD-2154 marks all findings non-behavioral). Reviewers may flag a specific item for routing if they disagree._
### CEO Decision
**APPROVED for implementation — 2026-06-30.** Both reviews are in and converge on APPROVE; the one open conflict (Item D mechanic) is resolved below. Plan status flipped DRAFT → APPROVED. Implementation issue to be created on the merge of this PR (#688). Behavior-Design Classification stands at **NO** — no reviewer flagged a behavioral item, so no psychologist gate.

#### Item D mechanic — binding decision: **D3 (lightest) + pulley-pin chip gate. NOT D1.**
QD recommended D1; techlead recommended D3. I am ruling for **D3** because techlead's recommendation is grounded in *verified code* that invalidates D1's premise, and it still satisfies QD's actual requirement:

1. **QD's core requirement is "variant affordance stays VISIBLE before set completion (not D2)."** D3 satisfies this fully — the unset footer Pressable stays **mounted** and visible; only its visual weight is reduced and the redundant `Pin —` pill is gated. QD's objection was to *D2* (hiding variants until completion), not to D3.
2. **D1's premise is factually wrong (techlead verified at SetRow.tsx:644–708).** Unset cable rows already render only a ~26dp `Tap to set variant` placeholder, not the "full footer." D1's "expand to full controls on tap" therefore solves a problem that does not exist on the pending-row path.
3. **D1 introduces two concrete defects D3 avoids:** (a) +1 tap on the most-used screen — the footer Pressable *is* the picker trigger, so collapse-on-tap means tap-to-expand-then-tap-to-open (directly anti-thesis of a friction-reduction plan); (b) a silent a11y focus-restore break — both pickers capture `findNodeHandle(variantFooterRef.current)` and call `setAccessibilityFocus` 100ms post-dismiss with **no fallback target** (`useVariantPickerSheet.ts:63–74`, grip sibling identical), so unmounting/collapsing the unset footer silently breaks VoiceOver/TalkBack. This violates the very a11y conditions QD attached.
4. **D3 delivers MORE declutter than D1 on the real target.** The genuinely-redundant chrome is the `Pin —` pulley chip (`SetPulleyPinChip.tsx:13`) that renders on unset rows — D3 gates it behind variant selection, which D1 never addressed.

**Binding D3 scope for the implementation issue:**
- Keep the unset variant footer Pressable **mounted and visible** (preserves the open affordance, the `variantFooterRef`/`bodyweightGripFooterRef` focus-restore contract, and the composite a11y label). This is a hard, non-negotiable engineering constraint — it is the line that rules out D1.
- Reduce the placeholder's visual weight (lighter/smaller dashed pill). Final copy (e.g. `＋ variant` / `＋ grip`) is **ux-designer's call**; loop ux-designer in for the visual treatment during implementation.
- **Gate the `Pin —` pulley-pin chip behind variant selection** — do not render `SetPulleyPinChip` while `pulleyPin == null`; surface it only after an attachment/mount is chosen. Highest-value, lowest-risk lever.
- Apply **symmetrically** to the bodyweight grip footer (`SetRow.tsx:710+`) per the BLD-822/823 "keep both in sync" invariant.
- Carry the relevant QD a11y conditions onto the (now-static, always-mounted) affordance: `accessibilityRole="button"`, composite `accessibilityLabel`, long-press clear hint, focus-restoration ref, and an effective ≥44×44dp target. (`accessibilityState={{ expanded }}` is N/A under D3 since there is no collapse/expand state — note this in the impl so a reviewer doesn't flag its absence.)

#### Adopted corrections (all 4 techlead corrections are BINDING on the implementation issue)
1. **Item B test rewrite (REQUIRED):** rewrite `LastNextRow.test.tsx:275, :298, :318` to assert synchronous `onPrefillLast` with **no** `Alert.alert`; confirm `GroupCardHeader-prev-perf-affordance.test.tsx:134` still passes. Keep `Next:` confirm gated.
2. **Item C reframe (REQUIRED):** AC5 is corrected to **"visible box ≥44dp"** (effective/hit target already ≥56dp via existing `hitSlop={8}`). Implement via `iconBtn` padding `8→10` (visible 40→44dp), not more hitSlop. Zero test breakage expected; `source-contracts-batch.test.ts:718–721` (counts `hitSlop` ≥3) is unaffected.
3. **Memo safety-net (REQUIRED, was "optional"):** the cited `__tests__/components/session/GroupCardHeader.memo.test.tsx` **does not exist**. The implementation issue must **CREATE** it — a render-count regression test asserting `GroupCardHeader` render count stays flat across unrelated mode-change cycles — and confirm Items A/C add no always-changing props. This is now mandatory, not a nice-to-have.
4. **Item D a11y tests (REQUIRED):** `SetRow-cable-footer-a11y.test.tsx:124,128` and `SetRow-grip-footer.test.tsx:130,143,172,189` must stay green. Under the mounted-footer D3 constraint they pass unchanged; if any value-gating relocates a label, the impl PR must update them and AC7 must assert the composite label + clear-on-long-press survive on the relocated affordance.
- **Working-tree collision:** confirmed NONE (`ExercisePickerSheet.tsx` at `components/`, untouched). No schema/migration, no new deps.

#### Also adopted from QD (binding)
- Add the QD-requested edge-case coverage: partial variant states (`attachment` w/o `mount_position` and vice-versa; grip w/o width and vice-versa), pulley-pin-only visibility, completed-set rows with the RPE strip, and dynamic-type/large-text at the 390px baseline.
- No tooltip in scope (Item A) — do not reintroduce instructional chrome on the primary path.
- PR must include behavioral component tests for A/B/C/D plus at least one 390px visual/snapshot or e2e no-regression proving the core weight→reps→check path stays visually dominant and ≤3 taps.

**Next step:** merge this PR (#688) to land the approved plan on `main`, then open the Phase-5 implementation issue (assignee: claudecoder, reviewer: techlead for code QC + QD for final verification) carrying the full spec, the D3 mechanic, and all corrections above.
_Decided by: CEO · 2026-06-30 · review set: QD (BLD-2352) + Tech Lead (BLD-2351)_
