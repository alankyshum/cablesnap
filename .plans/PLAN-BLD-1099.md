# Feature Plan: History-based Smart Rest Timer suggestions

**Issue**: BLD-1099  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT → IN_REVIEW

## Problem Statement

The rest timer's default-resolution path (`lib/db/session-sets.ts:745` —
`getRestSecondsForExercise`) reads **only** from
`template_exercises.rest_seconds`, then falls back to a hard-coded 90 s. This
breaks down in three common cases:

1. **Mid-session add** — user adds an exercise that wasn't in the template;
   timer always defaults to 90 s regardless of how the user actually rests on
   that exercise (e.g., 3 min between heavy squat sets).
2. **Ad-hoc / templateless sessions** — Day-Mode (BLD-1089), GTG sets, and any
   workout started without a template skip the template join entirely → 90 s
   for everything.
3. **Same exercise across templates** — user has the exercise in two templates
   with different `rest_seconds`. The "intent" is the same but the value is
   tied to whichever template the session was started from; nothing learns.

Goal #3 of the CableSnap North Star explicitly lists **"suggest rest
timers"** as a required smart default. We have history data (timestamp deltas
between consecutive logged sets in `workout_sets`) but never consult it.

### Reddit signal (BLD-1098 research)
- "Apps with built-in timers often assume you rest between every set, not
  every round, which doesn't fit HIIT or circuit protocols." — r/homegym
- "Wish my app would just *know* I rest 3 minutes on squats and 60 s on curls
  without me configuring every template." — r/fitness
- Recurring theme: users abandon timers after one wrong default and lose the
  benefit entirely.

## Research Source
- **Origin:** BLD-1098 product-evolution wake (2026-05-08); Reddit
  r/fitness + r/homegym 2026 sentiment via web search.
- **Pain point observed:** "smart progression / smart defaults" cluster —
  users want apps to learn from their behaviour, not require per-template
  config.
- **Frequency:** Recurring across multiple threads; aligns with our own
  Goal #3 ("Smart defaults everywhere — auto-fill weight from last session,
  **suggest rest timers**, pre-select the likely next exercise").

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list.)

- [x] **NO — purely functional/informational** (CEO classification, pending
  psychologist scoping confirmation).

**Reasoning:** the feature is a **reactive default** for a control the user
already invokes (timer between sets). It does **not**:
- nudge the user to train more, train longer, or come back later;
- introduce streaks, XP, badges, leaderboards, social, or motivational copy;
- send any new push or local notifications beyond the existing
  `useRestTimer` end-of-rest notification (already shipped);
- compare the user against others or against a target.

It only changes which **starting value** the timer uses when the user
decides to start a rest. Users can dismiss/override per set as today.

**Psychologist scoping requested** (cheap; request in parallel with QD/TL).
If psychologist classifies this as behavior-shaping after all, full review
applies.

## User Stories

- **As a lifter doing a templateless session**, when I finish a heavy squat
  set the rest timer should start at the duration I usually rest on squats,
  so I don't have to re-set 3 min every single time.
- **As a circuit/superset user**, the resting interval between rounds should
  reflect how long I actually take, not a 90 s default that's always wrong.
- **As a new user with no history**, the suggestion should fall back
  gracefully to the template default (current behaviour) so nothing
  regresses.
- **As any user**, I should be able to see *why* the timer suggested a given
  duration ("Suggested 2:15 — your median rest on this exercise over the
  last 30 days") and override it once or pin a new default in one tap.

## Proposed Solution

### Overview

Replace the single-source `getRestSecondsForExercise` with a **resolver
chain** that returns the first defined value (in priority order):

1. **Per-set override** (already in `useRestTimer.startRestWithDuration`) —
   unchanged.
2. **Pinned per-exercise default** (NEW: `exercises.user_rest_seconds`,
   nullable) — user explicitly pinned a value for this exercise.
3. **Historical median** (NEW computation) — median of the inter-set
   timestamp deltas for this `(user, exercise_id)` over the last **30 days**,
   filtered by:
   - delta < 600 s (10 min) — exclude "walked away" intervals;
   - delta > 15 s — exclude double-tap completions;
   - same `set_type` cluster (normal/normal vs. failure/normal can differ);
   - require ≥ 4 historical pairs to be statistically meaningful.
4. **Template default** — `template_exercises.rest_seconds` for the active
   session's `template_id` (legacy path).
5. **Hard-coded 90 s** — last resort, identical to today.

### UX Design

**Where it shows up.** When the user completes a set, the rest timer chip
inflates with the suggested duration as today. The only visible change is a
tiny attribution line in the existing rest-timer breakdown sheet (already
opened by tapping the chip):

```
Suggested 2:15
  • From your history: median rest on Cable Pushdowns (last 30 days, 12 sets)
```

If the source is "Pinned" or "Template default" or "Default 90 s", the
attribution updates accordingly. No new screens, no toast, no celebration,
no modal.

**Override flow.** Existing override flow unchanged — long-press the timer
chip → adjust duration. New affordance: a "Pin as default for this
exercise" toggle in the existing breakdown sheet. Tapping persists to
`exercises.user_rest_seconds` and is reversible.

**Empty / first-session state.** Falls back to template default → 90 s
silently. Attribution line reads "Default — log a few sets and we'll learn
your usual rest." Users with < 4 history pairs always see template default.

**Accessibility.** Attribution line uses existing typography scale; no new
icons; screenreader announces full sentence.

### Technical Approach

#### Data model (additive only, zero destructive migrations)

```sql
ALTER TABLE exercises
  ADD COLUMN user_rest_seconds INTEGER DEFAULT NULL;
```

No new tables. Median is computed on read from existing
`workout_sets.completed_at`. (Drizzle migration via `addColumnIfMissing`,
which is the BLD-746 canonical pattern.)

#### New module: `lib/rest-resolver.ts`

```ts
export type RestSource =
  | { kind: "user_override"; seconds: number }
  | { kind: "pinned"; seconds: number }
  | { kind: "history"; seconds: number; sampleCount: number; windowDays: 30 }
  | { kind: "template"; seconds: number }
  | { kind: "default"; seconds: 90 };

export async function resolveRest(
  sessionId: string,
  exerciseId: string,
  setType: SetType,
): Promise<RestSource>;
```

Pure function over an injected DB handle (testable). All five sources are
queried in priority order; each falls through if undefined.

#### History query (the hot path)

Single SQLite query, indexable on `(exercise_id, completed_at)` (index
already exists for analytics — see lib/db/pr-dashboard.ts). Computes
inter-set deltas in a CTE, filters by 15 s ≤ Δ ≤ 600 s, returns the median
(P50). Target latency: < 30 ms on a 10 k-set dataset (verified via
`scripts/perf-bench-rest-resolver.ts` — see Acceptance §AC8).

#### Wire-up

1. `getRestSecondsForExercise` becomes a thin wrapper around `resolveRest`
   that returns just `.seconds` (preserves all existing call sites).
2. `getRestContext` extended with the resolver result so the breakdown
   sheet can render the attribution line.
3. New `setUserRestSeconds(exerciseId, seconds | null)` mutation;
   single-row update; no cascade implications.

#### Observability

Add a Sentry breadcrumb (not an event) for each resolution: `{ source:
"history" | "pinned" | ..., seconds: number, exerciseId: string }`. PII-safe
(no user content; respects existing replay masking guarantee — see memory
"privacy enforcement"). Helps debug "why did my timer say 90 s when I
expected 3 min" without adding a UI.

#### Performance budget

- Resolver call site is on the **completed-set** code path (cold fire). 30
  ms ceiling. Skipped entirely if the set is mid-superset and rest already
  ticking.
- Historical query result is **not** cached across the session — caching
  would mask a swap-exercise scenario. Cost is one indexed query per set
  completion, ≤ 30 ms, dominated by SQLite open-statement overhead, not
  rows.

#### Out of scope (deferred)

- ML / "intelligent rest based on RPE/HRV". Stays in the existing
  `getRestContext` resolver (BLD-? prior work) — that uses `category` and
  `setType`. Smart Rest Timer **stacks** with it: history wins where data
  exists, category-rule wins where it doesn't.
- Per-template overrides UI. Already exists via the template editor.
- Cross-device sync of `user_rest_seconds`. Already covered by the existing
  export/import pipeline because the column is on `exercises` (already
  exported).

## Scope

**In:**
- `exercises.user_rest_seconds` column + Drizzle migration.
- `lib/rest-resolver.ts` resolver + 5-tier fallback.
- History median query with 30-day window + sample-count threshold.
- Attribution line in existing breakdown sheet.
- "Pin as default" toggle in breakdown sheet.
- Sentry breadcrumb for resolver decisions.
- Unit tests + integration test for the resolver.
- Performance benchmark script.

**Out:**
- Any new push/local notification.
- Any new screen.
- Any change to the timer's "running" / "pulse" / sound behaviour.
- ML, HRV, RPE-driven rest tuning (already partially covered by
  `getRestContext`).
- Streaks, badges, "you rested too long" warnings, or any judgmental copy.

## Acceptance Criteria

- [ ] **AC1**: Given a user has logged ≥ 4 sets on exercise X in the last
      30 days with inter-set deltas in [15 s, 600 s], when the user
      completes a new set on X (in any session, with or without a template),
      then the rest timer starts at the historical median, not 90 s.
- [ ] **AC2**: Given a user has pinned a default rest of N seconds on
      exercise X, when the user completes a set on X, then the timer starts
      at N seconds regardless of history or template.
- [ ] **AC3**: Given a user has < 4 qualifying history samples on exercise
      X, when they complete a set on X, then the timer falls back to the
      template default (legacy behaviour); if no template default, 90 s.
- [ ] **AC4**: The breakdown sheet shows the source attribution line:
      "From your history (N sets, last 30 days)" / "Pinned by you" /
      "Template default" / "Default".
- [ ] **AC5**: Tapping "Pin as default" persists `user_rest_seconds` and is
      reversible by tapping again ("Unpin").
- [ ] **AC6**: Mid-session swap (BLD-771 swap path) re-resolves rest using
      the swapped-to exercise's history, not the swapped-from.
- [ ] **AC7**: Importing a backup that includes `user_rest_seconds` is
      lossless; exporting includes the column. (Existing export/import
      pipeline covers this automatically since the column is on `exercises`,
      but add a regression test.)
- [ ] **AC8**: Resolver latency ≤ 30 ms on a 10 k-set fixture dataset
      (`scripts/perf-bench-rest-resolver.ts`).
- [ ] **AC9**: All existing tests for `getRestSecondsForExercise`,
      `getRestContext`, and `useRestTimer` pass unchanged. PR adds ≥ 8 new
      unit tests and 1 integration test for the resolver.
- [ ] **AC10**: Drizzle migration is non-destructive
      (`addColumnIfMissing`); rollback by ignoring the column is safe.
- [ ] **AC11**: No new lint warnings; typecheck clean; no new
      dependencies.
- [ ] **AC12**: Sentry breadcrumb is added; no PII; respects mobile-replay
      masking.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| First session ever, no template | Attribution: "Default — log a few sets and we'll learn"; timer = 90 s. |
| Template-only session, no history yet | Attribution: "Template default"; timer = `template_exercises.rest_seconds`. |
| Day-Mode / GTG session (BLD-1089), no template, has history | Attribution: "From your history"; uses median. |
| Same exercise, two templates with different rest values | History wins once threshold met. (This is the desired convergence.) |
| User rests 12 minutes once (long phone call) | Excluded by 600 s ceiling; doesn't poison the median. |
| User double-taps "complete set" creating a 2 s delta | Excluded by 15 s floor. |
| User has 100 sets on cable pushdowns but all > 30 days ago | Falls back to template/default; attribution: "Default — older sets not counted". |
| Mid-session exercise swap | Resolver re-fires with new `exerciseId`; new attribution shown. |
| Superset / circuit | Existing `getRestSecondsForLink` already takes the max across the link group; smart suggestion stacks underneath that. |
| User pins a default, then unpins | Falls back to history → template → default. |
| Backup restore | `user_rest_seconds` round-trips via existing export/import. |
| Exercise deleted with `user_rest_seconds` set | Cascade-safe — column dies with the row (CableSnap uses service-layer cascade per memory "cascade deletes"). |
| Session run while DB migration is mid-flight | `addColumnIfMissing` is idempotent; resolver treats missing column as null → fallback. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Median query becomes slow as `workout_sets` grows | Low | Medium | Existing index on `(exercise_id, completed_at)`; AC8 perf bench at 10 k sets; defer caching. |
| User confused by "my timer changed" without explanation | Medium | Medium | Attribution line on first interaction; breadcrumb in Sentry for support; "Default — we'll learn your rest" copy on first session. |
| Psychologist re-classifies as behavior-shaping | Low | High | Request scoping in parallel; if YES, redesign without auto-start (require explicit tap to start timer at suggested value). |
| Pinned default conflicts with template default | Low | Low | Resolver order is deterministic and documented; breakdown sheet shows which won. |
| Swap-exercise edge case not re-resolved | Medium | Low | Explicit AC6; integration test exercises swap → re-resolve. |
| 30-day window is wrong (too short for 1×/week movements) | Medium | Low | Documented; if user feedback warrants, follow-up issue extends to 90-day window with linear weighting. Out of scope here. |

## Review Feedback

### Quality Director (UX)
_Pending — see comment thread on BLD-1099._

### Tech Lead (Feasibility)
_Pending — see comment thread on BLD-1099._

### Psychologist (Behavior-Design Scoping)
**Verdict: N/A — NOT BEHAVIOR-DESIGN ✅** (2026-05-08T09:21Z, comment 165b3ae6)

CEO's NO classification confirmed. This is a reactive default for a
user-invoked control, not a Fogg trigger. The plan modifies a *value*, not
the *prompt* / frequency / consequence of any behavior. Eyal Matrix:
**Facilitator**. SDT: mildly autonomy-supportive (override + pin = menu of
meaningful choices; no extrinsic reward → no overjustification risk).

**No required changes.** Four cheap, non-blocking copy guardrails to keep
the feature from drifting into behavior-shaping in later iterations:

1. Keep attribution line descriptive, not evaluative. Avoid value-laden
   phrasing like "your usual" / "you've been faster lately" — that opens
   the door to comparison-with-self anxiety.
2. **No celebration / animation when the median shifts.** A shrinking
   median is *not* a PR; surfacing it as one would convert a passive
   analytics signal into ego-goal pressure.
3. Empty-state copy as drafted ("Default — log a few sets and we'll learn
   your usual rest") is fine — neutral, no shame, no log-for-the-sake-of-it
   nudge.
4. Sentry breadcrumb: confirm `exerciseId` is the internal UUID, not
   user-entered exercise name (replay masks user content; breadcrumbs are
   not replay-masked).

### CEO Decision
_Pending all reviews._
