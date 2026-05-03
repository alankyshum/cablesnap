# PLAN: Pinned Per-Exercise Notes (form cues, machine settings, safety-pin positions)

**Status:** APPROVED — 2026-05-03 (techlead RE-CONFIRM 20:05Z, QD APPROVE 20:06Z, rev2.1 stale-wording nits cleaned up).

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

1. New columns on `exercises` (and migration via `addColumnIfMissing` in `lib/db/migrations.ts` — schema-only changes do NOT migrate live user DBs):
   - `notes TEXT` — user-authored pinned note, nullable. Hard cap 500 chars (`maxLength={500}` on input + defensive `substring(0,500)` on the write path).
   - `notes_updated_at INTEGER` (timestamp_ms) — last user edit of `notes`.
   - `notes_backfill_dismissed_at INTEGER` (timestamp_ms) — set when user dismisses the backfill prompt, so we don't conflate "user said no thanks" with "user authored an empty string". (Per techlead feedback — keeps `notes_updated_at` semantically clean.)
2. **Two distinct, explicitly relabeled UI surfaces** (per QD blocker — current code in `GroupCardHeader.tsx:95-199` and `useSessionActions.ts:641-647` writes the existing "Exercise Notes" field to `workout_sets.notes` of the first set, which is ambiguous):
   - **"📌 Pinned note for {exerciseName}"** — NEW. Reads/writes `exercises.notes`. Persists across sessions. Visible in `GroupCardHeader` (read), editable inline via pencil affordance, also editable from `app/exercise/[id].tsx`. Empty state shows "+ Add pinned note" affordance (discoverable).
   - **"Note for this session"** — EXISTING per-set field, **relabeled** in UI + a11y labels. Wiring untouched (still writes `workout_sets.notes` of first set; preserves BLD-621/673/885 behavior).
   - Both surfaces have explicit `accessibilityLabel`s including the exercise name (e.g. `"Edit pinned note for Lat Pulldown"`).
3. Live-session edit: pencil affordance opens an inline TextInput. Save behavior must satisfy the **"never lose user input"** acceptance criterion via ALL of:
   - Debounced save (500–800ms) during typing.
   - `onBlur` flush.
   - `AppState` listener: flush pending text on `background`/`inactive` (reuse existing `AppState` pattern in repo — no new dependency).
   - Flush on session unmount / navigation away.
   - Flush in the existing "Finish Workout" handler (drain any pending pinned-note draft, not just per-set drafts).
4. Backfill UX (preview, not auto-pin): if `exercises.notes` is NULL AND `notes_backfill_dismissed_at` is NULL AND a recent `workout_sets.notes` exists for that exercise (last completed session, see SQL below), surface a `BackfillNoteSuggestion` chip showing the candidate text + source date. **One tap copies + dismisses; one tap dismisses without copy.** Either action sets `notes_backfill_dismissed_at` so the prompt never re-shows.
   ```sql
   SELECT ws.notes
   FROM workout_sets ws
   JOIN workout_sessions s ON s.id = ws.session_id
   WHERE ws.exercise_id = ?
     AND TRIM(COALESCE(ws.notes, '')) <> ''
     AND s.completed_at IS NOT NULL
   ORDER BY s.completed_at DESC
   LIMIT 1;
   ```
5. Preserve existing per-set `notes` on `workout_sets` — wiring unchanged (only the label changes per item 2).
6. **Export coverage — JSON backup ONLY for v1** (per QD blocker; CSV export does NOT currently include exercises — verified: `lib/db/csv.ts` + `lib/csv-format.ts` + settings export card cover only workouts/nutrition/body metrics):
   - JSON `exportAllData()` automatically includes new columns via `SELECT * FROM exercises` (`lib/db/import-export.ts:485`). ✅
   - JSON `importAllData()` automatically rebuilds INSERT via `PRAGMA table_info(exercises)` (line 579). ✅
   - **Required tasks:** verify `BackupFile.version` (currently 7, line 496) — bump to 8 only if version-branching tests require it; for additive nullable cols, usually no bump needed.
   - **Required audits:** test fixtures in `tests/fixtures/`, any `__tests__/` JSON snapshots that hand-write an `exercises` row payload, regression-catcher snapshots (`scripts/check-curation-gate.ts` etc.).
   - **Adding a CSV exercises export is OUT OF SCOPE for v1** — defer to a separate ticket if requested.

**Out (defer):**

- Per-template overrides ("for *this* template, this exercise has a different note") — adds template-coupling complexity. Defer until a user asks.
- Rich text / bullet lists — single string is enough for v1. The Reddit complaint is about *existence*, not formatting.
- Note history / version log — overkill.
- Note attachments (photos of safety-pin position) — adds asset pipeline. Defer; the equipment-illustration project (BLD-561 family) is the right home for that.
- Sharing pinned notes between users — out of scope (also conflicts with offline-first/local-only positioning).

## Data Model

```ts
// lib/db/schema.ts — exercises table additions
notes: text("notes"),               // user-authored pinned note, nullable, ≤500 chars
notes_updated_at: integer("notes_updated_at", { mode: "timestamp_ms" }),
notes_backfill_dismissed_at: integer("notes_backfill_dismissed_at", { mode: "timestamp_ms" }),
```

```ts
// lib/db/migrations.ts — MANDATORY for live user DBs (schema.ts alone is not enough).
// Follows existing pattern from BLD-561 (start_image_uri/end_image_uri), BLD-913 (progression_*).
addColumnIfMissing(database, "exercises", "notes", "TEXT DEFAULT NULL");
addColumnIfMissing(database, "exercises", "notes_updated_at", "INTEGER DEFAULT NULL");
addColumnIfMissing(database, "exercises", "notes_backfill_dismissed_at", "INTEGER DEFAULT NULL");
```

Migration is additive only, no data movement, no FKs into `exercises`, no indexes affected (verified by techlead schema audit). Existing per-set notes remain untouched. Idempotency required and tested (run `migrate()` twice on a fresh DB; assert no error and no duplicate columns).

## UI Touch Points

1. **`components/session/GroupCardHeader.tsx`** — render pinned note inline (read) + edit pencil. Do not collapse/hide; the whole point is that the user sees it without action.
2. **New `components/session/PinnedExerciseNoteEditor.tsx`** — inline editor with debounced save to `exercises.notes`. Closes via Done / outside tap.
3. **`app/exercise/[id].tsx` (exercise detail screen)** — show + edit the same field for off-session curation.
4. **Backfill prompt**: small `BackfillNoteSuggestion` component that appears on the GroupCardHeader the first time the user opens a session for an exercise whose `notes` is empty AND a recent `workout_sets.notes` exists for that exercise. One tap copies it up; one tap dismisses. **Either action sets `notes_backfill_dismissed_at` (NOT `notes_updated_at`)** so the prompt never re-shows and `notes_updated_at` remains semantically "last user edit of `notes`".

## Telemetry / Quality bar

- No analytics. Pure local feature.
- **Required tests** (must all be present before QD approval of the implementation PR):
  1. **Migration / schema test** — fresh DB AND upgraded DB both get `notes`, `notes_updated_at`, `notes_backfill_dismissed_at` idempotently. Run `migrate()` twice; no error, no duplicate columns.
  2. **Behavioral isolation test** — editing the pinned exercise note does NOT mutate `workout_sets.notes` or active set state. Editing the per-set "Note for this session" does NOT touch `exercises.notes`.
  3. **Backup roundtrip test** — JSON `exportAllData()` → `importAllData()` preserves `exercises.notes` and timestamps.
  4. **UI label test** — both surfaces render with correct labels and a11y labels ("Pinned note for {exerciseName}" + "Note for this session"); both states (set note exists / pinned note exists / both / neither) covered.
  5. **Backfill prompt test** — given a recent `workout_sets.notes` and empty `exercises.notes`, prompt appears with candidate text + date; copy-tap writes through; dismiss-tap sets `notes_backfill_dismissed_at`; prompt never re-shows in either case.
  6. **"Never lose user input" test** — mount editor, type, immediately emit `AppState.change → background` (no debounce wait), assert DB write fired. Repeat for `onBlur`, navigation, and "Finish Workout" handler.
  7. **e2e (Maestro)** — type a pinned note in session A, finish session, start same exercise in session B, see note auto-displayed inline.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Two notes fields (set-level + exercise-level) confuse users | Distinct canonical labels (must match §Scope verbatim): "📌 Pinned note for {exerciseName}" (writes `exercises.notes`) vs "Note for this session" (writes `workout_sets.notes` of first set). Distinct visual surfaces in `GroupCardHeader` and a11y labels including the exercise name. Backfill prompt teaches the model. |
| Long pinned notes clutter session screen | Soft cap 500 chars + show first 2 lines, expand-on-tap. |
| Migration on large local DBs | Column is nullable, no defaults to compute — instant migration. |
| Sync (future) — what if we ever add cloud sync | The field already lives on a synced table (`exercises`); per-user override would need a join then, not now. |

## Open Questions for Reviewers

1. **Tech Lead:** Acceptable to extend `exercises` directly, or prefer a side table `exercise_notes (exercise_id PK, notes, updated_at)`? Side table makes a future "per-user note over a shared exercise library" cleaner; column is simpler today. **Recommendation: column, ship simple, refactor when sync arrives.**
2. **QD/UX:** Should the pinned note be visible in the **template editor** preview as well, so users editing a template see the same context? (Probably yes, read-only.)
3. **Sports-science (optional):** Are pinned notes a behavior-shaping surface we should worry about (e.g., users encoding bad cues)? Likely not — it's user-authored, the user is the only audience, no nudges, no scoring. Quick async confirmation only.

## Acceptance Criteria

- Adding a pinned note to "Lat Pulldown" in session A makes that note auto-visible in session B without any extra navigation.
- Editing the note from inside an active session never interrupts the timer, never loses set state, and saves on debounce **AND** on `onBlur`, `AppState→background`, navigation away, and "Finish Workout".
- Pinned-note edits do NOT mutate `workout_sets.notes`. Per-set note edits do NOT mutate `exercises.notes`. Both surfaces have distinct labels and a11y labels including the exercise name.
- Existing per-set note workflow is unchanged (BLD-621, BLD-673, BLD-885 et al. still work) — only the user-facing label changes.
- JSON backup `exportAllData()` → `importAllData()` roundtrip preserves `notes`, `notes_updated_at`, `notes_backfill_dismissed_at`. **CSV exercises export is out of scope for v1.**
- Migration runs idempotently (twice on fresh DB → no error, no duplicate columns).
- Note input enforces 500-char `maxLength` AND defensive `substring(0,500)` on the write path.
- No new permissions, no new network calls, no new dependencies.

## Review Feedback

### Tech Lead (Feasibility) — APPROVE WITH MINOR ADDITIONS (2026-05-03)
Verdict: **APPROVE**. All five tightening items folded into Scope/Data Model/Acceptance above:
1. Column over side-table — confirmed.
2. Backfill SQL specified verbatim; backfill is preview-not-auto-pin; added `notes_backfill_dismissed_at` to keep `notes_updated_at` semantically clean.
3. Migration via `addColumnIfMissing` in `lib/db/migrations.ts` — explicit; idempotency test required.
4. Debounced save augmented with `onBlur` + `AppState` + unmount + Finish-Workout flush; "never lose input" test required.
5. Export covered — JSON automatic via `SELECT *` / `PRAGMA table_info`; CSV explicitly out of scope; fixtures + regression-catcher snapshots audited.

Plus: 500-char hard cap (input + write path), a11y label on pencil, "+ Add pinned note" empty-state affordance.

### Quality Director (UX) — REQUEST CHANGES → ADDRESSED (2026-05-03)
Two blockers raised, both resolved in this revision:
1. **Two-note UX ambiguity** — RESOLVED. Both surfaces explicitly relabeled in plan: "📌 Pinned note for {exerciseName}" (new, persistent) vs "Note for this session" (existing per-set, label updated). A11y labels include the exercise name. Distinct visual surfaces; existing per-set wiring untouched (preserves BLD-621/673/885 behavior).
2. **Export scope inconsistency** — RESOLVED. CSV exercises export does NOT exist today (verified `lib/db/csv.ts`, `lib/csv-format.ts`, settings export card). v1 is JSON backup roundtrip only. Adding a CSV exercises export is explicitly OUT of scope.

All 5 required test additions captured in the Telemetry / Quality bar section above (migration idempotency, behavioral isolation, backup roundtrip, UI label coverage, backfill prompt). Re-requesting QD verdict.

### Psychologist (Behavior-Design)
N/A — Classification = NO. No gamification, no streaks, no notifications, no rewards. User-authored utility text.

### CEO Decision
**APPROVED** 2026-05-03 20:10Z. Both reviewer blockers resolved in rev2; rev2.1 cleans up two stale-wording nits (UI Touch Points dismiss-action wiring + Risks table labels) flagged by techlead and QD. Proceeding to Phase 4: implementation issue assigned to claudecoder.

## Estimated Effort

Small-to-medium. ~1 PR. Schema + migration + 2 UI components + 1 hook + 7 tests (migration, behavioral isolation, backup roundtrip, UI labels, backfill prompt, "never lose input" via AppState/blur/unmount/finish, e2e Maestro). Estimated 5–7 hours of focused implementation including the rigor above (techlead's revised estimate).

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
