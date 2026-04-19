# Feature Plan: Recovery-Aware Workout Suggestions

**Issue**: BLD-383
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

## Problem Statement

FitForge shows a muscle recovery heatmap (Phase 53) that tells users which muscles are recovered, partial, or fatigued. However, users must **mentally cross-reference** this data with their workout templates to decide what to train today. This creates unnecessary cognitive load — the user opens the app, checks the heatmap, scrolls through templates, reads each one's exercises, remembers which muscles they target, and picks the best match.

For someone standing in the gym deciding "what do I do today?", this process takes too long. The app has all the data to answer this question instantly.

**Why now?** Recovery data (Phase 53) and template exercise data already exist. This feature is pure UI/logic integration — no new data collection needed. It directly reduces the #1 decision-friction point for users who train without a structured program.

## User's Emotional Journey

**Without this feature:** "I'm at the gym. Let me check the heatmap... ok, chest is recovered, legs are partial... now let me find which template hits chest... is it Push Day or Upper Body? Let me look at the exercises..." → Frustration, cognitive load, wasted time in the gym.

**After this feature:** "I open FitForge and it says Push Day is READY — all target muscles recovered. I tap it and start." → Confidence, speed, feeling like the app is a smart training partner.

## User Stories

- As a lifter, I want to see which templates are ready based on my recovery so I can start training immediately
- As a lifter, I want a visual indicator on each template showing its recovery readiness so I can make quick decisions
- As a lifter, I want templates sorted by readiness so the best option is always at the top
- As a lifter, I want to know WHY a template is partially ready (which muscles are still fatigued) so I can make informed trade-offs

## Proposed Solution

### Overview

Add a "recovery readiness" indicator to each workout template on the Workouts tab. The readiness is computed by cross-referencing the template's exercises' primary muscles with `getMuscleRecoveryStatus()`. Templates are sorted so fully-ready ones appear first.

### UX Design

#### Recovery Readiness Badge

Each template card gets a recovery badge:
- 🟢 **READY** (green) — All primary muscles in this template are `recovered`
- 🟡 **PARTIAL** (amber) — Some muscles are `partial` or `fatigued`, but majority recovered
- 🔴 **REST** (red) — Most primary muscles are `fatigued`
- ⚪ **NO DATA** — No recovery data available (new user, no recent workouts)

Badge appears as a small chip on the template FlowCard, next to existing badges (RECOMMENDED, Starter, etc.).

#### Readiness Scoring

For each template:
1. Collect all unique primary muscles from the template's exercises
2. Look up each muscle's recovery status from `getMuscleRecoveryStatus()`
3. Score: `recovered` = 1.0, `partial` = 0.5, `fatigued` = 0.0, `no_data` = 0.75 (assume ready if no data)
4. Template readiness = average score across all muscles
5. Badge: `>= 0.8` → READY, `>= 0.5` → PARTIAL, `< 0.5` → REST

#### Template Sorting

Templates on the Workouts tab are sorted:
1. **READY** templates first (highest score first)
2. **PARTIAL** templates next
3. **REST** templates last
4. Within same readiness tier, maintain current order

#### Detail Popover (Optional — could defer)

Long-press the readiness badge shows which muscles are recovered/partial/fatigued for that template. This is optional for v1 — the badge alone provides 80% of the value.

### Technical Approach

#### Data Flow
1. `loadHomeData()` already calls `getMuscleRecoveryStatus()` and `getTemplates()`
2. Need `getTemplateExerciseMuscles(templateIds)` — new query that returns primary muscles grouped by template
3. Compute readiness score client-side (pure function, no new DB query needed beyond muscle lookup)
4. Pass readiness data to template FlowCard rendering

#### New Code
- `lib/recovery-readiness.ts` — Pure function: `computeTemplateReadiness(templateMuscles, recoveryStatus) → ReadinessResult[]`
- Modify `app/(tabs)/index.tsx` — Add readiness computation to `loadHomeData()`, pass to FlowCard
- Modify `components/FlowCard.tsx` — Add readiness badge rendering
- New query in `lib/db/templates.ts` — `getTemplatePrimaryMuscles(templateIds: string[])` → `Record<string, string[]>`

#### Performance
- Recovery status is already fetched on home screen load (Phase 53)
- Template muscle query is a simple JOIN, cached by React Query
- Readiness computation is O(templates × muscles) — negligible

### Scope

**In Scope:**
- Recovery readiness badge on template cards (READY / PARTIAL / REST)
- Template sorting by readiness score
- Readiness computation from existing recovery + template data
- Badge colors following existing theme system

**Out of Scope:**
- Detailed muscle-by-muscle breakdown popover (defer to future)
- Program day readiness (programs already have scheduled days — readiness doesn't apply the same way)
- Push notifications ("Your chest is recovered!")
- Auto-selecting templates (user still makes the final choice)
- Recovery readiness on the template detail/edit screen

### Acceptance Criteria
- [ ] Given a user has completed workouts in the past 7 days, When they open the Workouts tab, Then each template shows a readiness badge (READY/PARTIAL/REST)
- [ ] Given a template targets chest + triceps and both are recovered, When the readiness is computed, Then the badge shows READY (green)
- [ ] Given a template targets legs and quads are fatigued, When the readiness is computed, Then the badge shows REST (red)
- [ ] Given no workout history exists (new user), When templates are shown, Then badges show NO DATA or are hidden
- [ ] Given multiple templates with different readiness, When the Workouts tab renders, Then READY templates appear before PARTIAL, which appear before REST
- [ ] Existing template functionality (start, edit, delete, duplicate) is unaffected
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing tests pass
- [ ] App starts without crashes
- [ ] Badge is accessible (screen reader announces readiness status)

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| No workout history | Hide readiness badges or show "NO DATA" in neutral color |
| Template with no exercises | Show NO DATA badge |
| Template with exercises that have no primary_muscles | Show NO DATA badge |
| All muscles recovered | READY badge |
| Mix of recovered and fatigued | PARTIAL badge with average score |
| All muscles fatigued | REST badge |
| Custom exercises with unusual muscle groups | Use available recovery data, fallback to no_data for unknown muscles |
| Very long template list (20+) | Readiness sort is stable — no flickering on re-render |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Badge clutters template card | Low | Medium | Small chip style, consistent with existing badges |
| Readiness sorting confuses users used to current order | Low | Medium | Only sort within "My Templates" section, keep starter order stable |
| Recovery data stale (app open for hours) | Low | Low | Data refreshes on tab focus via useFocusRefetch |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: APPROVED with revision** (2026-04-19)

**Cognitive Load:** POSITIVE — This feature genuinely reduces cognitive load. Eliminates the mental cross-referencing between heatmap and templates. The 3-second gym test passes: glance at badge colors, tap green, start lifting. Mental model is compatible with Phase 53 heatmap concepts.

**Regression Risk:** LOW — Additive change on existing data. Pure function approach is testable. Clean rollback path.

**Blocking Revision:**
- **Template sorting disrupts spatial memory.** Users build muscle memory for template positions. Reordering by readiness every time the app opens breaks this. **Recommendation:** Ship badges-only in Phase 55, defer sorting to Phase 55.1. Badges alone provide 80% of the value. If sorting is kept, it must be opt-in or limited to a "Suggested for Today" section.

**Non-Blocking:**
- NO DATA scoring (0.75) inconsistency with NO DATA badge display — clarify whether `no_data` muscles show as PARTIAL or distinct NO DATA state.
- Ensure badge has text labels ("READY"/"PARTIAL"/"REST") alongside color for color-blind accessibility.
- Add edge case: template exercises referencing deleted exercises with no muscle data.
- Consider hiding badges entirely for new users (no workout history) to reduce visual noise.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-19)

**Architecture Fit**: Clean integration — follows existing `loadHomeData() → batch queries → components` pattern. No refactoring needed. New `lib/recovery-readiness.ts` pure function is the right separation.

**Velocity**: Small-Medium effort (~200 lines net new, 4-5 files). Recovery data already fetched on home screen. Only new DB query is `getTemplatePrimaryMuscles()` which fits into existing second `Promise.all()` batch.

**Minor Recommendations**:
1. Use a separate `readiness` prop on FlowCard instead of extending badge type union (cleaner separation)
2. Document the `no_data = 0.75` scoring assumption in code comments
3. Ensure starter templates are NOT re-sorted by readiness (only user templates)
4. Use stable sort for template ordering

**Risk**: Low — no new dependencies, no schema changes, OTA-compatible JS-only change.

### CEO Decision
_Pending reviews_
