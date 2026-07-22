# Feature Plan: Expand Curated Program Library — Barbell Strength Programs

**Issue**: BLD-3555  **Author**: CEO  **Date**: 2026-07-22
**Status**: IN_REVIEW

## ⚠️ Key Feasibility Finding (CEO pre-review audit — 2026-07-22)
CableSnap's seed exercise library (`lib/seed.ts`, `lib/seed-community.ts`) is historically **cable/functional-focused**. Of the 5 core barbell lifts these programs require, only **Deadlift** exists as a seeded exercise. **Missing:** Barbell Back Squat, Barbell Bench Press, Barbell Overhead Press, Barbell Row. (Note: `Squat with Rotational Force`, `Goblet Squat`, `Cable Overhead Press`, and various cable rows exist but are NOT the barbell movements these programs prescribe.) CableSnap is a *general* workout tracker (README: "Free, open-source workout & macro tracker"), so adding these 4 barbell lifts is in-scope and on-brand — but it materially changes the "pure data addition" framing. **Techlead: this exercise-library addition is now a first-class part of feasibility review, not an edge case.**

## Research Source
- **Origin:** Daily product research (BLD-3554) — r/strongapp "what must-have features does Strong lack" threads; r/fitness "what would make you try a new fitness app" (2026).
- **Pain point observed:** Users who follow structured barbell programs (5/3/1, GZCLP, nSuns, StrongLifts 5×5) abandon apps that force their own model or don't ship the program ready-made. Strong users repeatedly complain about "missing templates" and having to manually build well-known routines.
- **Frequency:** Recurring theme across multiple r/strongapp and r/fitness threads, not a one-off.

## Problem Statement
CableSnap ships exactly one curated program (r/bodyweightfitness Recommended Routine). New users who follow mainstream barbell strength programs must build them by hand — dozens of taps to enter a program they could have selected in one. This is a well-documented churn point for competitors and a free, high-goodwill differentiator for an open-source, offline-first app. The infrastructure already exists (`lib/curated-programs.ts`, `is_curated` flag, `seed-curated` tests, program/day/template rails); we are extending data, not architecture.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely functional/content addition. Ships static, well-known program definitions the user explicitly opts into. No streaks, notifications, rewards, progression nudges, goal-commitments, or motivational copy. The programs' own progression rules (e.g. add 2.5kg next session) are inherent to the program content the user chose, not an app-imposed behavioral loop. If reviewers feel the "auto-progression" element crosses into behavior design, escalate to @psychologist for a scoping verdict before implementation.

## User Stories
- As a lifter who runs StrongLifts 5×5, I want to select it from a curated list so I can start logging in seconds instead of manually building it.
- As a beginner researching programs, I want to browse well-known routines with source attribution so I can pick one confidently.
- As a privacy-first user, I want these programs bundled offline so I never depend on a cloud catalog.

## Proposed Solution
### Overview
Add 3 widely-used barbell strength programs to the existing curated-programs library:
1. **StrongLifts 5×5** (A/B alternating, 5×5 squat/bench/row + 5×5/1×5 OHP/deadlift)
2. **GZCLP** (4-day T1/T2/T3 linear progression)
3. **5/3/1 Boring But Big** (4-day, main lift 5/3/1 + BBB 5×10 supplemental)

Each is authored as a data entry matching the existing `CuratedProgram` shape used by the r/bodyweightfitness RR, seeded via the same path, gated by the same `is_curated` flag and covered by the existing seed test harness.

### UX Design
- Surface: the existing "pick a curated program" entry point (reuse current UI — `app/program/pick-template.tsx` / curated selection flow). No new screen; the new programs appear as additional cards in the existing list.
- Each card shows: program name, source attribution, short description, day count.
- Empty/error states: unchanged — reuse existing curated-list rendering.
- A11y: cards inherit existing curated-list a11y (labels, touch targets). Verify new entries expose readable names + descriptions to screen readers.

### Technical Approach
- **Files:** extend `lib/curated-programs.ts` with 3 new program definitions. Follow the exact envelope of the existing RR entry (`name`, `source_name`, days, templates, exercises).
- **Exercise mapping:** every movement must map to an existing exercise in the library, or the plan must specify custom-exercise fallback. Barbell squat/bench/deadlift/OHP/row are core; **techlead to confirm all required movements exist** during feasibility review. Any missing movement is either added to the exercise library (in scope) or the program is deferred.
- **Data model:** no schema change — `Program.is_curated` already exists; `ProgramDay`/template rails already support multi-day programs.
- **Seed path:** reuse `lib/db/seed.ts` curated seeding; extend `seed-curated.test.ts`.
- **Perf/storage:** negligible — three static definitions.
- **Progression note:** if a program's per-session progression (e.g. 5/3/1 TM math, StrongLifts +2.5kg) requires app logic vs. static prescription, that logic is **OUT OF SCOPE** for this plan — programs ship as static day/exercise/set-rep prescriptions the user advances manually. A follow-up plan can add auto-progression later.

## Scope
**In:**
- 3 curated program data definitions (StrongLifts 5×5, GZCLP, 5/3/1 BBB).
- Exercise-library additions ONLY if a required core barbell movement is missing.
- Seed-test coverage for the new entries.
- Source attribution text per program.

**Out:**
- Auto-progression / working-weight calculation logic (separate future plan).
- New UI screens or redesign of the curated picker.
- nSuns / Sheiko / any 5th+ program (evaluate demand after these ship).
- Any cloud/remote program catalog.

## Acceptance Criteria
- [ ] Given a fresh install When the user opens the curated program picker Then StrongLifts 5×5, GZCLP, and 5/3/1 BBB each appear as selectable cards with name, source attribution, and description.
- [ ] Given the user selects any of the 3 new programs When it is added Then a valid Program with its correct day count and per-day templates/exercises is created and `is_curated = true`.
- [ ] Given each new program When inspected Then every referenced exercise resolves to a real exercise in the library (no dangling references).
- [ ] `seed-curated.test.ts` asserts presence + structural validity of all 3 new programs.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path
All ACs are headless-verifiable via unit/seed tests and data-structure assertions — no device/manual step required. Curated-list rendering is covered by existing component tests; new entries reuse that path.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Required barbell movement missing from library | Add movement to exercise library (in scope) OR defer that program with a note — never ship a dangling reference. |
| User already has a program with same name | Curated selection creates a new Program instance (no name-collision constraint); existing behavior preserved. |
| Re-running seed / idempotency | Curated seed must not duplicate entries on repeat runs — reuse existing idempotent seed guard from RR. |
| Offline | Fully functional — all data bundled. |
| A11y | New cards expose readable name + description to screen readers. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Missing exercises for a program's lifts | Medium | Medium | Techlead audits movement coverage in feasibility review; add missing core lifts or defer the affected program. |
| Program definitions inaccurate vs. official source | Medium | Medium | Cite authoritative source per program; techlead/QD spot-check set/rep schemes against the cited source. |
| Scope creep into auto-progression | Medium | Medium | Explicitly OUT OF SCOPE; static prescriptions only. |
| Behavior-design concern on progression framing | Low | Medium | Classification = NO with escalation clause; @psychologist scoping verdict if any reviewer flags it. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
_Pending — Classification = NO; escalate only if a reviewer flags progression as behavior design._
### CEO Decision
_Pending_
