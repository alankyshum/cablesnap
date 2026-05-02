# Feature Plan: Curated Programs Library

**Issue**: BLD-986  **Author**: CEO  **Date**: 2026-05-02
**Status**: DRAFT → IN_REVIEW

## Research Source
- **Origin**: [r/bodyweightfitness — "What happened to the old RR app?"](https://www.reddit.com/r/bodyweightfitness/comments/1q070he/what_happened_to_the_old_rr_app/)
- **Pain point (verbatim)**: "Everything on the playstore is jazzed up slop with customisation and features out the wazoo. Nothing but distractions and overwhelm for someone just trying to get back into it."
- **Reinforcing signal**: Top-voted r/bodyweightfitness post (372 ups, 42 comments) — "Anyone beyond the starting point... only needs a tracker that lets them assemble their own training regiment based on their own knowledge. An 'everything app' is just a crutch."
- **Frequency**: Recurring. The "no-frills tracker with proven programs built in" need surfaces repeatedly across r/bodyweightfitness, r/homegym, r/fitness.

## Problem Statement
CableSnap currently ships only two trivial starter programs (PPL and Founder's Favourite, both ~3-day single-cycle splits). New users coming from Reddit communities arrive looking for **named, proven programs** — Recommended Routine (RR), Stronglifts 5×5, Starting Strength, GZCLP, calisthenics progressions — and find none. They either:
1. Manually re-key the program from a wiki (high friction, error-prone), or
2. Bounce to a paid app (Hevy, Strong, JEFIT) that ships these programs out of the box, or
3. Give up on CableSnap as "too bare-bones."

This is the single largest **content-side gap** between CableSnap and the paid competition, and unlike most competitor parity work it can be closed entirely with **static, public-domain content** — zero new runtime code beyond what already powers `STARTER_TEMPLATES` / `STARTER_PROGRAMS`.

## Behavior-Design Classification (MANDATORY)
- [ ] **YES**
- [x] **NO** — purely informational/functional content delivery.

**Justification.** Triggers explicitly excluded:
- No streaks, XP, levels, badges, rewards, or unlock animations.
- No reminders or push notifications introduced by this feature.
- No leaderboards, social, or comparative framing.
- No motivational copy (loss-framing, FOMO, identity language).
- Progression is **manual and observable**: the user reads their own weight/rep history (already shipped) and decides when to advance, exactly as they would with a paper program.

The closest near-trigger is RR's "skill progression tree" (hand-balancing → handstand → handstand push-up). We will represent these as **descriptive ordering of exercises within a phase**, not as locked-then-unlocked nodes. No celebration on completion. If a reviewer believes any specific framing crosses into behavior-design, we drop it before APPROVED.

## User Stories
- As a returning lifter who used to follow a Reddit program, I want to install Stronglifts 5×5 in two taps and have CableSnap auto-fill targets so I can start my next session today.
- As a beginner who doesn't know what to do, I want to browse a short list of established, named programs with a one-paragraph "what this is" so I can pick one without doing 6 hours of YouTube research.
- As a calisthenics athlete, I want the bodyweightfitness Recommended Routine pre-loaded with all six progression tracks so I can pick my current level per movement and just train.
- As a no-frills user, I want every curated program to be **read-only at install** but **editable after install** so I can adapt it without forking the source.

## Proposed Solution

### Overview
Extend the existing `STARTER_PROGRAMS` / `STARTER_TEMPLATES` infrastructure (`lib/starter-templates.ts`) with a parallel `CURATED_PROGRAMS` library. Same shapes, more entries, plus a few additive fields. Reuse the existing program-install / template-import flow. Add a small **Programs Catalog** screen (or extend the existing Templates screen) that surfaces curated programs grouped by category with a short description and a single "Install" CTA.

### Initial Catalog (v1 — ship together)
| Program | Category | Schedule | Source |
|---------|----------|----------|--------|
| **r/bodyweightfitness Recommended Routine** | Bodyweight | 3 days/week, 6 progressions | [bodyweightfitness wiki, CC-licensed](https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine) |
| **Stronglifts 5×5** | Barbell, Beginner | 3 days/week, alternating A/B | Public program (Mehdi Hadim) |
| **Starting Strength (Novice LP)** | Barbell, Beginner | 3 days/week, alternating A/B | Public (Rippetoe) |
| **GZCLP (Linear Progression)** | Barbell, Beginner-Intermediate | 4 days/week, T1/T2/T3 | Public (Cody Lefever / r/gzcl) |
| **Push/Pull/Legs Hypertrophy** | Barbell, Intermediate | 6 days/week | Already implicit; promote from starter to curated, expand. |

5 programs is the scoping target. Out-of-scope candidates parked for v2: 5/3/1, nSuns, PHUL, Reddit PPL.

### UX Design

**Entry point.** New tab inside the existing Templates screen called **"Programs → Curated"**, alongside the current **"My Programs"**. Or, if simpler, a "Browse Curated Programs" button at the top of the empty-state on My Programs.

**Catalog list.** Each row: program name, 1-line description (e.g., "3×/week barbell beginner program"), category chip, "Install" button. No imagery in v1 to keep bundle small.

**Detail view.** Tapping a program shows:
- Long description (origin, who it's for, expected commitment)
- Schedule preview (Day A: bench, squat, row; Day B: ohp, deadlift, row)
- Per-exercise prescription (sets × reps × rest)
- Source link (external)
- "Install Program" CTA (primary)

**Install behavior.** Creates real `WorkoutTemplate` rows + a `programSchedule` row, identical to today's starter-program install. Marks created templates with `source: "curated"` (new value alongside `"coach"`). Templates appear in My Templates and can be edited freely after install — the curated catalog is the **seed**, not a live binding.

**A11y.** All catalog rows are buttons with descriptive labels. Detail screen uses headings hierarchy (program name = h1, schedule = h2). Colors don't carry meaning. Tested at 200% font scale.

**Empty/error states.**
- Catalog is static — no empty state needed for the catalog itself.
- Install failure: snackbar "Couldn't install <Program>. Try again." with a retry button.
- Already-installed: detail CTA flips to "Re-install (replaces existing)". Confirmation dialog explains it overwrites templates created from this curated source only; user-edited or unrelated templates are untouched. Determination: match by template id prefix `curated-<programId>-<dayId>`.

### Technical Approach

**Data model (additive, no migration required).**
- Extend `TemplateSource` enum: `"coach" | "curated" | null`. Drizzle schema column already accepts arbitrary strings; only TS types and Zod schemas widen.
- New constant `CURATED_PROGRAMS: CuratedProgram[]` in `lib/curated-programs.ts`. Shape mirrors `StarterProgram` plus:
  - `category: "bodyweight" | "barbell-beginner" | "barbell-intermediate"`
  - `description: string` (long-form, ~100 words)
  - `sourceUrl: string`
  - `scheduleHint: string` (e.g., "3 days/week, alternating A/B")
- Templates inside follow the existing `StarterTemplate` shape with `id` prefix `curated-<programId>-...`.
- Bump existing `STARTER_VERSION` → introduce **separate** `CURATED_VERSION = 1`. We do not re-run the starter migration; curated install is user-initiated.

**Install flow.** Reuse the existing `installStarterProgram(...)` helper. Refactor it to `installProgramFromBlueprint(blueprint)` accepting either a `StarterProgram` or a `CuratedProgram` (structural type). One new branch in the upsert for the `source: "curated"` value.

**Bundle size.** All five programs as static TS data + descriptions ≈ 8–12 KB gzipped. No images, no remote fetch. Acceptable.

**Performance.** Install is bounded (≤30 templates × ≤8 exercises). Same code path as starter install which already runs <50 ms on cold device.

**Storage.** Standard SQLite via Drizzle; no new tables.

**Dependencies.** None. No new npm packages. No new permissions.

**Open-source / licensing.**
- RR text is CC-BY-SA 3.0. We paraphrase the description and link to source — we do **not** copy wiki prose verbatim into the bundle.
- Stronglifts 5×5, StartingStrength, GZCLP: program structures (sets/reps/exercises) are not copyrightable; only the prose. We write our own descriptions and link to the originator.
- Each program detail screen carries a "Source: <name> — <url>" footer.

## Scope

**In v1**
- 5 curated programs listed above.
- Catalog list + detail screen.
- Install flow with re-install confirmation.
- `source: "curated"` template tagging.
- Unit tests: blueprint shape validation, install idempotency, re-install replaces only `curated-<programId>-*`.
- Accessibility audit at the listed gates.
- Settings → "About this program" link from any template that has `source: "curated"`.

**Out v1 (parked)**
- 5/3/1, nSuns, PHUL, Reddit PPL, Greyskull LP, RR2.
- Auto-progression suggestions ("ready to add 5 lb"). Future plan, requires careful behavior-design review.
- Import-from-URL of community programs.
- User-published curated programs / sharing.
- Localized program names/descriptions.
- Imagery / video links (the Reddit user explicitly named GIFs but we punt to v2 — exercise GIFs are a separate, larger asset-pipeline question).
- "Compare programs" UI.

## Acceptance Criteria

- [ ] Given the user is on the Templates screen When they tap "Browse Curated Programs" Then a catalog screen lists exactly the 5 v1 programs with name, description, category chip, and Install button.
- [ ] Given the user is on a program detail screen When they tap Install Then 2–6 templates and 1 `programSchedule` row are created and the user is navigated to My Programs with the new program selected.
- [ ] Given a curated program is already installed When the user opens its detail screen Then the CTA reads "Re-install (replaces existing)" and tapping it shows a confirmation dialog with body text "This will replace templates installed from this program. Templates you edited will be reset. Continue?"
- [ ] Given a curated install fails mid-transaction When the user dismisses the snackbar Then no partial templates remain (transactional install).
- [ ] Given the user has a `source: "curated"` template When they edit it Then the edit persists and re-install no longer claims to "reset" it without warning (warning fires regardless of edit state — see above; covered by the same dialog).
- [ ] PR passes typecheck, lint, unit tests, and Maestro smoke for the existing Templates screen.
- [ ] Bundle size delta ≤ 15 KB gzipped.
- [ ] No new runtime permissions requested.
- [ ] No new behavior-design surface (no streaks, no XP, no celebration animation).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| User installs Program A, then re-installs Program A | Templates with id `curated-A-*` overwritten; user-renamed copies (different id) untouched; schedule row replaced. |
| User installs Program A, then installs Program B with overlapping exercise IDs | Both coexist as separate templates; no exercise-data sharing. |
| Curated catalog ships a program referencing an exercise id that doesn't exist in the seed exercise DB | Build-time test fails — every `exercise_id` in `CURATED_PROGRAMS` must resolve in seed. CI gate. |
| Offline (always) | Catalog is fully offline; install is fully offline. |
| Tiny screens (≤320 dp) | Catalog row wraps to 2 lines; detail screen schedule table horizontal-scrolls if needed. |
| 200% font scale | All catalog rows and detail headings remain legible; no clipping. |
| Color-blind | Category chips use shape + label, not color alone (existing chip component already complies). |
| Re-install during an active workout | Block with snackbar "Finish or discard your active workout before re-installing a program." |
| Sync (when sync ships) | Curated templates sync as normal user templates; the `source: "curated"` tag travels with them. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RR licensing or community pushback for paraphrasing CC-BY-SA wiki prose | Low | Medium | Write our own descriptions; link source; be ready to remove on request. Mark CC-BY-SA attribution in detail footer. |
| Scope creep — reviewers ask for 8+ programs instead of 5 | Medium | Low | Hold the line at 5 in v1; v2 plan parks the rest. |
| "Re-install replaces edits" is a footgun | Medium | Medium | Dialog + clear copy + match by `curated-<programId>-*` prefix only. Document in release notes. |
| Hidden behavior-shaping creep at review (e.g., "let's add a 'completed' badge") | Medium | High | Hard line in this plan: zero gamification. If a reviewer wants any, they file a separate plan with psychologist as required reviewer. |
| Bundle bloat if we forget the limit | Low | Low | CI bundle-size check covers `lib/curated-programs.ts`. |
| Exercise id drift between seed bumps and curated blueprints | Medium | Medium | Build-time test: every `curated.exercise_id` resolves. CI gate. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending — N/A unless reviewer flags. Classification = NO._

### CEO Decision
_Pending_
