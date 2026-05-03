# PLAN: Pinned Per-Exercise Notes (form cues, machine settings, safety-pin positions)

**Source:** [BLD-1028 Daily Product Research & Ideation](/BLD/issues/BLD-1028) — Reddit research run 2026-05-03.
**Classification:** NO gamification. Pure utility / friction-removal feature.
**Psychologist review:** Not required (no behavior-design or loss-framing). Sports-science review **suggested but optional** — see "Open questions" below.

## Research Source

The single highest-signal post in today's Reddit sweep:

- **[r/Hevy — "Am I the only one that cares about pinned notes?"](https://www.reddit.com/r/Hevy/comments/1rb1swd/am_i_the_only_one_that_cares_about_pinned_notes/)** — 81↑ / 29c, last year. The OP says they keep going back to Strong specifically because Strong shows your saved per-exercise notes inline mid-session, and Hevy forces you to leave the session to edit the template. Top comments:
  - 48↑ "It's one of the most requested features here"
  - 9↑ "How do we get the developers to actually listen. This feature has been requested by myself and many others for at least 3 years and it's still not done."
  - Multiple "I miss it, always kept my safety pin locations for each moment pinned"
  - "Yeah this is the No. 1 thing I need. I'm probably lazy but it's a step too far to remember all of my favorite machine settings and bench angles for each set."

This is a 3-year-unaddressed, frequently-requested gap in the #1 competitor. CableSnap can ship it cleanly because we're offline-first and have no review-cycle politics.

Supporting signal from the same sweep:

- **[r/workout — "Question for lifters who log their workouts"](https://www.reddit.com/r/workout/comments/1p4fy5g/question_for_lifters_who_log_their_workouts_i/)** (88↑) — Top reply: lifters want fewer "10 different versions of lat pulldown" and more contextual recall ("which grip / pin position did I use"). Pinned notes is the lightest version of that fix.
- Cable/home-gym users are an explicit CableSnap segment. Cable machines have many setup variables (pulley height, attachment, pin/plate, bench angle, body position) that benefit most from saved notes.

## What Exists Today (gap analysis)

From repo audit (`lib/db/schema.ts:16-36`):

- `exercises` table has **no** `notes` / `memo` / `cue` / `pinned_note` column.
- `templateExercises` (schema.ts:47-61) has **no** persistent note column either.
- The session screen's "Exercise Notes" UI exists, but it writes to **`workout_sets.notes` of the first set in the current session** (`hooks/useSessionActions.ts:641-648`, `components/session/GroupCardHeader.tsx:95`).
- Net effect: a user types "use safety pins at hole 7" today; that text is attached to a single set, never resurfaces, and the user re-types or re-remembers it next session.

We already model per-set cable variants persistently (BLD-767), so we have the pattern. This plan adds the missing *exercise-level* persistent layer.

## Goal

Persist short, user-authored notes on the **Exercise** entity so they appear automatically every time the user starts that exercise — without leaving the live session.

## Scope (v1)

**In:**

1. New column `notes TEXT` on `exercises` (and migration). Single string, soft cap ~500 chars.
2. Live-session display: when an exercise group becomes active in a session, surface the pinned note in `GroupCardHeader` as a non-blocking, dismissible chip/inline block (always visible, never intrusive).
3. Live-session edit: a pencil affordance next to the pinned note opens an inline edit (bottom-sheet or inline TextInput) that writes back to `exercises.notes`. **No need to leave the workout.**
4. Backfill UX: if `exercises.notes` is empty but `workout_sets.notes` has been used historically for that exercise (within last 5 sessions), offer a one-tap "Pin to exercise" prompt the first time the new UI is seen for that exercise. (Cheap, addresses Reddit comment about losing prior context.)
5. Preserve existing per-set `notes` on `workout_sets` — that field is for **session-specific** observations ("felt heavy today"), distinct from pinned exercise context. Two separate UI surfaces.
6. Export coverage: include `exercises.notes` in `exportAllData()` (`lib/db/import-export.ts`) and the JSON backup. CSV export of exercises already exposes the row; ensure the new column is in the column list.

**Out (defer):**

- Per-template overrides ("for *this* template, this exercise has a different note") — adds template-coupling complexity. Defer until a user asks.
- Rich text / bullet lists — single string is enough for v1. The Reddit complaint is about *existence*, not formatting.
- Note history / version log — overkill.
- Note attachments (photos of safety-pin position) — adds asset pipeline. Defer; the equipment-illustration project (BLD-561 family) is the right home for that.
- Sharing pinned notes between users — out of scope (also conflicts with offline-first/local-only positioning).

## Data Model

```ts
// lib/db/schema.ts — exercises table additions
notes: text("notes"),               // user-authored pinned note, nullable
notes_updated_at: integer("notes_updated_at", { mode: "timestamp_ms" }),
```

Keep `notes_updated_at` so the optional "Pin to exercise" backfill prompt can decide whether the user has already curated the field.

Migration: additive only, no data movement. Existing per-set notes remain untouched.

## UI Touch Points

1. **`components/session/GroupCardHeader.tsx`** — render pinned note inline (read) + edit pencil. Do not collapse/hide; the whole point is that the user sees it without action.
2. **New `components/session/PinnedExerciseNoteEditor.tsx`** — inline editor with debounced save to `exercises.notes`. Closes via Done / outside tap.
3. **`app/exercise/[id].tsx` (exercise detail screen)** — show + edit the same field for off-session curation.
4. **Backfill prompt**: small `BackfillNoteSuggestion` component that appears on the GroupCardHeader the first time the user opens a session for an exercise whose `notes` is empty AND a recent `workout_sets.notes` exists for that exercise. One tap copies it up; one tap dismisses (sets `notes_updated_at` so the prompt never shows again).

## Telemetry / Quality bar

- No analytics. Pure local feature.
- Tests: schema migration test, hook test for read/write of `exercises.notes`, snapshot of `GroupCardHeader` with and without note, e2e test (Maestro) for: type a note in a session, finish session, start same exercise next session, see note auto-displayed.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Two notes fields (set-level + exercise-level) confuse users | Distinct labels: "Notes for this set" vs "Pinned note (this exercise)". Backfill prompt teaches the model. |
| Long pinned notes clutter session screen | Soft cap 500 chars + show first 2 lines, expand-on-tap. |
| Migration on large local DBs | Column is nullable, no defaults to compute — instant migration. |
| Sync (future) — what if we ever add cloud sync | The field already lives on a synced table (`exercises`); per-user override would need a join then, not now. |

## Open Questions for Reviewers

1. **Tech Lead:** Acceptable to extend `exercises` directly, or prefer a side table `exercise_notes (exercise_id PK, notes, updated_at)`? Side table makes a future "per-user note over a shared exercise library" cleaner; column is simpler today. **Recommendation: column, ship simple, refactor when sync arrives.**
2. **QD/UX:** Should the pinned note be visible in the **template editor** preview as well, so users editing a template see the same context? (Probably yes, read-only.)
3. **Sports-science (optional):** Are pinned notes a behavior-shaping surface we should worry about (e.g., users encoding bad cues)? Likely not — it's user-authored, the user is the only audience, no nudges, no scoring. Quick async confirmation only.

## Acceptance Criteria

- Adding a pinned note to "Lat Pulldown" in session A makes that note auto-visible in session B without any extra navigation.
- Editing the note from inside an active session never interrupts the timer, never loses set state, and saves on debounce.
- Existing per-set note workflow is unchanged (BLD-621, BLD-673, BLD-885 et al. still work).
- JSON backup roundtrip preserves the field.
- No new permissions, no new network calls, no new dependencies.

## Estimated Effort

Small. ~1 PR. Schema + migration + 2 UI components + 1 hook + tests. Estimated 3–5 hours of focused implementation including e2e Maestro flow.

## Why Now

- Lowest-effort, highest-validation feature on the ideation board: 81↑ Reddit thread says it's the *#1 most-requested missing feature* in our biggest competitor for ≥3 years.
- Cable / home-gym audiences (CableSnap's core) gain the most — they have the most setup variables to memorize.
- Zero behavior-design risk; no psychologist review gate; no sports-science gate (nice-to-have, not blocking).
- Exercises everything we already do well: offline-first, local-only, no account, no nudge, no AI.

## Ideas Considered & Deferred (today's research)

- **Privacy-first marketing positioning** ([r/privacy](https://www.reddit.com/r/privacy/comments/1pfssw5/the_privacy_nightmare_of_modern_fitness_apps_why/) — 133↑) — strong cohort signal but it's a marketing/positioning task, not engineering. Owner: founder/CEO copywriting. *Not* a child of this PLAN.
- **Non-fatphobic onboarding language audit** ([r/antidietglp1](https://www.reddit.com/r/antidietglp1/comments/1m75796/nonfatphobic_workout_app_with_privacy/) — 35↑) — worth a separate PLAN: review every onboarding/empty-state copy line for diet-culture phrasing. Cheap, kind, on-brand. Defer to its own ticket so this PLAN stays scoped.
- **Exercise-variant grouping** ("10 versions of lat pulldown" complaint) — a real problem but bigger than this PLAN; needs UX exploration of inheritance vs tags. Defer.
- **Muscle-coverage heat map** — already partly addressed by BLD-879 family. Re-evaluate after that ships.
- **AI "growth score"** ([r/workout 88↑](https://www.reddit.com/r/workout/comments/1p4fy5g/question_for_lifters_who_log_their_workouts_i/)) — high engagement but conflicts with our local-only / no-cloud / no-AI stance. Decline.

## Knowledge Curator Asks

Transferable learnings from this research run:

1. **Reddit competitor-subreddit mining (e.g. r/Hevy itself) is gold for "missing feature in #1 competitor".** Today's pinned-notes thread came from r/Hevy directly, not pain-phrasing in r/fitness. Add r/Hevy / r/strongapp / r/jefit to the standard daily query set.
2. **Look for "this has been requested for X years" comments** — they signal both demand intensity and competitor non-responsiveness, which is when a small, focused indie has the biggest wedge.
