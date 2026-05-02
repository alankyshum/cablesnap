# Feature Plan: Curated Programs Library

**Issue**: BLD-986  **Author**: CEO  **Date**: 2026-05-02
**Status**: DRAFT (rev 3 — addresses techlead + QD REQUEST CHANGES from v2)

## Revision History
- **v1** (2026-05-02 ~16:02 UTC): Initial draft. Built around an "install on tap" UI and a `installStarterProgram(...)` helper that does not exist; misstated `program_schedule` as a single-row table; defined a Re-install/reset flow that is a data-loss footgun; specified 200% font-scale AC that is currently impossible.
- **v2** (2026-05-02 ~16:48 UTC): Adopted **Option A — pre-seed via existing `STARTER_TEMPLATES` / `STARTER_PROGRAMS` infrastructure**. No install UI, scope cut to RR-only, realistic a11y AC. Resolved both v1 reviewer blockers but introduced a new factual error: claimed INSERT-OR-IGNORE preserves user edits to curated rows, while the actual `upsertTemplates`/`upsertPrograms` code path issues an unconditional canonical-repair UPDATE on every seed run (added by BLD-467 for starters). AC11 was therefore unimplementable as written.
- **v3** (this revision): Fix the user-edit-preservation contract to match what the code actually does, and change the code so it does the right thing for curated rows. Adopts techlead's Option 1: **gate the canonical-repair UPDATE in `upsertTemplates`/`upsertPrograms` on `is_curated=0`**, so curated rows are created-once, never repaired-by-launch. Spell out the curated schedule blueprint shape (day_of_week + template_id). Acknowledge the orphan-exercise-id defense is **new code in this PR**, not pre-existing. Make curated rows undeletable in v1 (extend `lib/programs.ts:80-86` guard) to align with `STARTER_VERSION`-bump re-seed semantics; deletable-curated story parked to v2. Defer sync-column-list audit to future sync work.

## Research Source
- **Origin**: [r/bodyweightfitness — "What happened to the old RR app?"](https://www.reddit.com/r/bodyweightfitness/comments/1q070he/what_happened_to_the_old_rr_app/)
- **Pain point (verbatim)**: "Everything on the playstore is jazzed up slop with customisation and features out the wazoo. Nothing but distractions and overwhelm for someone just trying to get back into it."
- **Reinforcing signal**: Top-voted r/bodyweightfitness post (372 ups, 42 comments) — "Anyone beyond the starting point... only needs a tracker that lets them assemble their own training regiment based on their own knowledge. An 'everything app' is just a crutch."
- **Frequency**: Recurring across r/bodyweightfitness, r/homegym, r/fitness.

## Problem Statement
CableSnap currently ships only two trivial starter programs (PPL and Founder's Favourite, both ~3-day single-cycle splits). New users coming from Reddit communities arrive looking for **named, proven programs** — Recommended Routine (RR) is the single most-requested — and find none. They either:
1. Manually re-key the program from a wiki (high friction, error-prone), or
2. Bounce to a paid app (Hevy, Strong, JEFIT) that ships these programs, or
3. Give up on CableSnap as "too bare-bones."

This is a **content gap closeable with static, license-clean content** — zero new runtime install code, zero new UI surfaces, zero new permissions. We extend the seed infrastructure that already exists.

## Behavior-Design Classification (MANDATORY)
- [ ] **YES**
- [x] **NO** — purely informational/functional content delivery.

**Hard ban list (explicit, per QD #8).** v1 ships ZERO of the following, regardless of how a future reviewer or implementer might be tempted to add them:
- No streaks, XP, levels, badges, rewards, or unlock animations.
- No celebratory copy or completion celebrations of any kind.
- No reminders or push notifications introduced by this feature.
- No leaderboards, social, or comparative framing.
- No motivational copy (loss-framing, FOMO, identity language).
- No "recommended for you" or ranking/sorting that implies a value judgment.
- No "unlock the next progression" framing — progressions in RR are presented as a flat ordered list of variations, not gated nodes.
- No "you completed 3 weeks!" or similar tenure surfacing.

Progression is **manual and observable**: the user reads their own weight/rep history (already shipped) and decides when to advance. If a reviewer believes any specific framing crosses into behavior-design, we drop it before APPROVED.

## User Stories
- As a returning lifter or beginner who searched "best workout app" on Reddit, I open CableSnap for the first time and **immediately see the bodyweightfitness Recommended Routine in my Programs list** — no install step, no onboarding, no choosing. I can start training today.
- As an existing user who upgrades to the version of CableSnap that ships RR, I find RR **automatically appended** to my Programs list with no disruption to programs I already use.
- As a no-frills user, I want RR to be **editable in-place** — I can change target sets/reps, swap exercises, edit schedule rows — same as anything else I have, without forking some special "curated" record. (v1 trade-off: I can't delete RR; I can hide it via the `Mine` filter. Deletable curated is a v2 follow-up.)
- As someone who wants to filter the Programs surface to "the proven stuff that ships with the app," I want a persistent **Curated** filter chip that shows me starter + curated programs distinct from my own creations.

## Proposed Solution

### Overview (Option A — pre-seed, NO install UI)
Add the bodyweightfitness Recommended Routine to the existing seed pipeline, alongside the existing starter programs. RR appears in **My Programs** and **My Templates** automatically, on first launch and on any version upgrade that bumps `STARTER_VERSION`. There is **no install button, no re-install flow, no reset, no separate catalog screen** in v1. Discoverability comes from the program already being present plus a Programs-surface filter chip.

### Why Option A (vs. install-on-demand)
- **Matches existing pattern.** `lib/db/seed.ts:102` (`upsertTemplates`) and `:141` (`upsertPrograms`) already do exactly this for starter content via INSERT-OR-IGNORE gated by `STARTER_VERSION` (`lib/starter-templates.ts:28`, currently `5`). BLD-467 already hardened the version-bump-on-deploy semantics.
- **Eliminates the data-loss footgun (former v1 issue).** No re-install means no "replaces your edits" dialog, no prefix-matching to figure out which rows to overwrite. Static IDs are safe **provided we change one thing in `upsertTemplates`/`upsertPrograms`**: the existing canonical-repair UPDATE that runs after INSERT-OR-IGNORE (added by BLD-467 to fix corrupted starter rows) must be **gated to `is_curated=0` rows**. See §"Technical Approach — Seed wiring" below for the exact change. With that gate in place, curated rows are insert-once: subsequent app launches see the row, INSERT-OR-IGNORE is a no-op, the gated UPDATE is skipped, and user edits to `target_sets` / `target_reps` / `rest_seconds` / `set_types` / `position` / day-schedule rows persist across cold launches and across future `STARTER_VERSION` bumps.
- **Better serves the Reddit pain point.** "Open app, see proven program, start training" *is* zero install UX. An install button is itself friction — and the Reddit user explicitly named "no frills."
- **Removes a whole category of edge cases.** No transactional install, no mid-install failure handling, no "active program reset" semantics, no schedule-row delete-and-replace logic. The `program_schedule` multi-row gotcha (techlead v1 #2) goes away because we only insert schedule rows on first seed and never touch them again.

### Initial Catalog (v1 — RR only)
| Program | Category | Schedule hint | License/source |
|---------|----------|---------------|----------------|
| **r/bodyweightfitness Recommended Routine** | Bodyweight | 3 days/week, 6 progressions | Wiki text CC-BY-SA 3.0 — we paraphrase descriptions and link source. Program structure (sets/reps/exercises) is not copyrightable. |

**Out of v1**: Stronglifts 5×5, Starting Strength, GZCLP, PPL Hypertrophy, 5/3/1, nSuns, PHUL, Greyskull LP, RR2. v2 plan parks all of these. Rationale: prove the seed-extension pattern with the single most-requested program (RR), validate the discoverability filter, then iterate. Shipping 5 programs in one PR multiplies review surface and licensing-prose review for marginal gain.

### UX Design

**Discoverability — Programs surface filter chip (persistent, not empty-state-only).**

Programs screen header gets a horizontal chip row:

```
[ All ]  [ Curated ]  [ Mine ]
```

- `All` (default): every program the user has, in their existing order.
- `Curated`: programs where `is_starter=1` OR `is_curated=1`. RR appears here. The two existing starters (PPL, Founder's Favourite) also appear here so the chip is meaningful from day 1.
- `Mine`: programs where `is_starter=0` AND `is_curated=0`.

Chip selection is local to the screen, not persisted across sessions. No badge counts (those edge into behavior-shaping). No "recommended" sort.

**Detail view.** RR uses the **existing** Program detail screen unchanged. RR templates are normal `workout_templates` rows; they render exactly like a user template. Two additions only:
1. **Source attribution footer** on the program detail screen, shown only when `is_curated=1`: a single line of grey caption text — "Adapted from [r/bodyweightfitness Recommended Routine](https://...) (CC-BY-SA 3.0)." Tappable, opens external browser. No imagery.
2. **First-load info bubble** (one-time, dismissible, no re-trigger): on first launch where `is_curated=1` programs were just inserted, the Programs screen shows a small caption line above the list — "Curated programs added by CableSnap. Edit freely or hide via the filter above." Dismissed by tapping `×`. Stored in `app_settings` as a single boolean. No re-prompt under any condition.

**A11y (REALISTIC — addresses QD #2).**
- All chips are buttons with `accessibilityLabel` (e.g., "Filter: Curated programs only, currently selected").
- Detail screen uses heading hierarchy (program name = h1, day = h2).
- Colors carry no meaning; chip selection uses background fill + accessible contrast (4.5:1 minimum, audited).
- Font-scale AC is bounded to **the system 1.5× cap that `components/ui/text.tsx:82` currently enforces app-wide** (`maxFontSizeMultiplier={1.5}`). The current Text component caps scale; lifting that cap is out of scope for this issue and tracked as a follow-up (`BLD-A11Y-FONT-CAP`, to be filed when this plan is approved). Concretely: at 100% and 150% system font scale, no clipping occurs in the chip row, the program list rows, or the detail screen.
- Screen-reader audit: every chip, every program list row, every footer link has a verifiable `accessibilityLabel` and `accessibilityRole`. AC includes a checklist (see Acceptance Criteria #5).
- CVD: Selected chip is distinguished by background fill (not color hue alone) and bold text. Audited with deuteranopia + protanopia simulators.

**Empty/error states.**
- Programs surface is never empty after seed (RR + existing starters guarantee ≥3 programs).
- If `Curated` filter is active and the user has somehow deleted all curated programs (possible — they're editable), show neutral empty-state copy: "No curated programs. Re-running CableSnap with a future update may re-add them." No CTA, no nag. (We don't auto-re-seed deleted curated programs unless `STARTER_VERSION` bumps — same semantics as starters.)
- Seed failure on first launch is already handled by existing `lib/db/seed.ts` error path; no new code path.

### Technical Approach

**Data model — additive, minimal migration.**

1. **Schema.** Add an `is_curated` integer column (default 0) to `workout_templates` and `programs`. Migration is additive, non-breaking. Schema location: `lib/db/schema.ts:43` (workout_templates), `:222` (programs).
   - Reason for new column rather than re-using `is_starter`: `is_starter` participates in seed-version bump semantics and existing UI may filter on it ("don't show starters in some context, etc."). Curated programs are conceptually peers of starters but allow a future divergence (e.g., a v2 where curated content has its own version counter or its own UI surface) without touching starter behavior. Cost: one nullable integer column. The added column is preserved by sync because all sync paths today read `SELECT *` on these tables (verified in pre-implementation audit, see Risk #5).
2. **Constants.** New file `lib/curated-programs.ts` exporting `CURATED_TEMPLATES: StarterTemplate[]` and `CURATED_PROGRAMS: CuratedProgram[]`. `CuratedProgram` extends the existing `StarterProgram` shape (`lib/starter-templates.ts:21-26`) with a `schedule: { day_of_week: number, template_id: string }[]` field that drives `program_schedule` row insertion. Reason for a new type rather than reusing `StarterProgram`: existing starters do not seed `program_schedule` (they have no day-of-week mapping); curated programs do. Keeping the types separate keeps starter behavior unchanged. Bundle target ≤ 8 KB gzipped for v1 (RR alone).
3. **Seed wiring — three concrete changes to `lib/db/seed.ts`:**
   - **(a) New `upsertCuratedTemplates(database)` and `upsertCuratedPrograms(database)`** that mirror the existing starter functions but iterate `CURATED_TEMPLATES` / `CURATED_PROGRAMS`. They INSERT-OR-IGNORE rows with `is_curated=1, is_starter=0`. **They do NOT issue the canonical-repair UPDATE.** Curated rows are insert-once; if we ever need to fix a shipped curated row's canonical values mid-version, we ship a one-shot migration, not a per-launch repair.
   - **(b) Gate the existing starter canonical-repair UPDATE on `is_curated=0`.** Today `upsertTemplates` (`lib/db/seed.ts:125-136`) and `upsertPrograms` (`:141-158`) issue an unconditional `UPDATE template_exercises SET ... WHERE id = ?` (and the analogous one for programs/days). This is correct for starters (BLD-467 repair behavior) and must remain so. We add `AND is_curated = 0` to the WHERE clause defensively — this is a no-op today (starter ids never collide with curated ids) but documents intent and protects against a future where someone adds a row to `STARTER_TEMPLATES` that accidentally collides with a curated id. The gate is symmetric across both `upsertTemplates` and `upsertPrograms`.
   - **(c) Schedule rows.** `upsertCuratedPrograms` inserts one `program_schedule` row per entry in `CuratedProgram.schedule` via `INSERT OR IGNORE INTO program_schedule (program_id, day_of_week, template_id) VALUES (?, ?, ?)`. PRIMARY KEY on `(program_id, day_of_week)` (`lib/db/schema.ts:250`) gives idempotency for free. No update path; user edits to schedule rows persist across launches.
   - Bump `STARTER_VERSION` from 5 → 6 to trigger re-seed on existing installs. The bump runs `upsertCuratedTemplates` / `upsertCuratedPrograms` for the first time on existing installs; on every subsequent launch the INSERT-OR-IGNORE no-ops.
4. **`TemplateSource` enum.** No widening required. Curated programs are identified by `is_curated=1`, not by the `source` column. The `source` field stays `"coach" | null`. This avoids the migration landmine in `lib/types.ts:219` and avoids touching every Zod schema and serializer that consumes `TemplateSource`.
5. **No `installProgramFromBlueprint` helper.** No new install code path. No transactional install logic. `withTransactionAsync` is already wrapped around the existing seed at `lib/db/seed.ts` and that wrap is reused as-is.
6. **Curated rows are undeletable in v1.** Extend the soft-delete guard at `lib/programs.ts:80-86` from `WHERE is_starter = 0` to `WHERE is_starter = 0 AND is_curated = 0`, and the analogous guard above the UPDATE. Reason: `STARTER_VERSION`-bump re-seed semantics rely on the row's id being persistent, which is only the case if soft-delete cannot orphan an `is_curated=1` id. Making curated rows undeletable mirrors the starter contract, removes the "user soft-deletes RR then bumps version" ambiguity techlead raised as a NIT, and is the simplest v1 answer. Users who don't want RR can use the `Mine` filter chip to hide it. Deletable-curated is parked to v2 with explicit "hard-delete on user delete" semantics.

**Exercise-id resolution (addresses QD v2 #3, QD v1 #6).**
- **Build-time gate (CI):** new test `__tests__/lib/db/seed-curated.test.ts` asserts every `exercise_id` in `CURATED_TEMPLATES` resolves in the seed exercise list (`STARTER_EXERCISES`). This test fails the build if any curated exercise reference is orphan.
- **Runtime defensive handling (NEW CODE in this PR — does NOT exist today).** The existing `upsertTemplates` blindly inserts `template_exercises` rows without resolving `exercise_id`; there is no orphan skip and no `error_log` integration in the seed code today. We add this as new code in `upsertCuratedTemplates`: before the `INSERT OR IGNORE INTO template_exercises`, look up the `exercise_id` in the `exercises` table; if missing, skip the insert and write a row to `error_log` with `component='seed.curated'`, `level='warn'`, and a message identifying the offending template/exercise pair. Tested via a forced-orphan unit test (AC9). The starter-side `upsertTemplates` is unchanged in v1 — it remains "blind insert" because every starter exercise is guaranteed by the build-time test for starters.

**Active program / `current_day_id` interaction (addresses QD v1 #5).**
- Pre-seed never touches an existing program's `current_day_id`. `program_schedule` rows for newly-seeded curated programs are inserted as part of the seed (one row per `(program_id, day_of_week)` from `CuratedProgram.schedule`), but they are scoped to the **new** `program_id` only; user programs and their schedule rows are untouched.
- The existing `lib/programs.ts:119-134` activation guard logic is unchanged. No additional reset code is added because no reset flow exists in v1.
- Re-seed on `STARTER_VERSION` bump is a no-op for curated rows (INSERT-OR-IGNORE on existing primary keys, gated UPDATE skipped). User edits to curated `target_sets` / `target_reps` / `rest_seconds` / `set_types` / schedule rows persist.

**Bundle / perf / storage.**
- Bundle delta target: ≤ 8 KB gzipped for `lib/curated-programs.ts` in v1.
- Seed install adds ≤ 8 templates + ≤ 6 schedule rows + 1 program row → bounded, on the same `<50 ms` cold-launch path that already runs starters.
- No new tables, no new indexes, no new permissions.
- No new dependencies. No new npm packages.

**Open-source / licensing.**
- RR text is CC-BY-SA 3.0. We **do not copy wiki prose verbatim**. Implementer writes original ~80–120 word descriptions per movement / per progression, derived from but not mirroring the wiki. The detail-screen footer carries an attribution + source link as required by CC-BY-SA.
- Program structure (sets/reps/exercises) is not copyrightable.
- Implementer flags any verbatim copy block to CEO before merging.

## Scope

**In v1**
- One curated program: r/bodyweightfitness Recommended Routine (~6–8 templates, 3 days/week schedule, 6 progressions presented as ordered exercise variants).
- Schema: add `is_curated` integer column on `workout_templates` and `programs` (default 0, additive migration).
- Seed extension: extend `upsertTemplates` / `upsertPrograms` to upsert curated content. Bump `STARTER_VERSION` 5 → 6.
- Programs surface filter chips: `All` / `Curated` / `Mine` (persistent UI, session-scoped selection).
- Detail-screen footer for curated programs: attribution + external source link.
- One-time first-launch info caption with dismiss.
- Build-time test: every curated `exercise_id` resolves.
- Runtime defense test: orphan curated `exercise_id` does not crash launch.
- Unit tests: schema migration applies cleanly on existing dev DB; INSERT-OR-IGNORE preserves user-edited curated rows on second seed.
- Accessibility audit: chip row + program list + detail footer at 100% and 150% font scale, with screen-reader label checklist.

**Out v1 (parked)**
- Stronglifts 5×5, Starting Strength, GZCLP, PPL Hypertrophy, 5/3/1, nSuns, PHUL, Greyskull LP, RR2.
- Any "Install Program" or "Browse Catalog" UI.
- Any re-install / reset flow.
- Auto-progression suggestions ("ready to add 5 lb"). Future plan, requires explicit psychologist review.
- Import-from-URL of community programs.
- User-published curated programs / sharing.
- Localized program names/descriptions.
- Imagery / video links / GIFs (separate asset-pipeline question).
- "Compare programs" UI.
- Lifting `maxFontSizeMultiplier` to >1.5 globally — tracked as separate follow-up `BLD-A11Y-FONT-CAP`.
- Widening `TemplateSource` enum.
- Behaviors banned by §"Hard ban list" above.

## Acceptance Criteria

- [ ] **AC1 — Seed presence (new install).** Given a fresh install of the version of CableSnap that ships this feature When the app finishes first-launch initialization Then the Programs surface lists at minimum: PPL, Founder's Favourite, and "r/bodyweightfitness Recommended Routine" — with RR `is_curated=1` and `is_starter=0`.
- [ ] **AC2 — Seed presence (upgrade), with curated UPDATE gate in place.** Given an existing CableSnap install on `STARTER_VERSION=5` (no RR) AND the v3 code change that gates the canonical-repair UPDATE on `is_curated=0` is merged When the user updates to the version with `STARTER_VERSION=6` and launches Then RR appears in their Programs list AND no existing program/template they had previously edited is modified. Verified by two tests: (i) snapshot two known-edited STARTER `template_exercises` rows pre-bump, assert bytes-equal post-bump (proves the gated UPDATE still repairs starters as BLD-467 intended); (ii) snapshot two CURATED `template_exercises` rows that the test pre-edits between two seed runs of v6, assert bytes-equal across the second seed run (proves the gate skips curated rows).
- [ ] **AC3 — Filter chip behavior.** Given the user is on the Programs surface When they tap the `Curated` chip Then the list shows only programs where `is_starter=1 OR is_curated=1`. When they tap `Mine` Then the list shows only programs where both flags are 0. When they tap `All` Then all programs show. Selection is session-scoped (resets to `All` after app restart).
- [ ] **AC4 — Detail attribution.** Given the user opens RR's detail screen Then a footer line displays "Adapted from r/bodyweightfitness Recommended Routine (CC-BY-SA 3.0)." with the program name as a tappable link to the wiki, AND tapping it opens the system browser.
- [ ] **AC5 — A11y, screen-reader checklist.** All of the following have non-empty `accessibilityLabel` and a correct `accessibilityRole`: each filter chip; each program list row; the detail-screen attribution link; the dismiss button on the first-launch info caption. Verified by an automated `expect(getByA11yRole(...))` test for each.
- [ ] **AC6 — A11y, font scale.** At system font scale 100% AND at 150% (the current app-wide cap), no text in the filter chip row, the Programs list rows, or the RR detail screen header/footer is clipped or truncated invisibly. Verified by a snapshot test at both scales OR a manual checklist signed off by QD.
- [ ] **AC7 — A11y, color independence.** Selected chip remains distinguishable from unselected chips when rendered through deuteranopia and protanopia color filters (selected uses background fill + bold weight, not hue alone). Verified by visual diff or QD checklist.
- [ ] **AC8 — Exercise-id integrity (build-time).** The CI test suite includes a test that fails the build if any `exercise_id` referenced in `CURATED_TEMPLATES` does not resolve in the seed exercise DB.
- [ ] **AC9 — Exercise-id integrity (runtime, NEW CODE).** Given a curated template references an `exercise_id` that does not resolve at seed time When the app launches Then no crash occurs, the offending `template_exercises` row is skipped (lookup-then-insert in new `upsertCuratedTemplates`), and an entry is written to `error_log` with `component='seed.curated'`, `level='warn'`. Tested via a forced-orphan unit test that injects a curated entry pointing at a non-existent `exercise_id` and asserts (a) no exception, (b) one `error_log` row written, (c) seed completes for all other curated rows.
- [ ] **AC10 — Idempotency.** Given the user has launched the app twice with `STARTER_VERSION=6` When the second launch's seed runs Then no duplicate `programs`/`workout_templates`/`program_schedule` rows are created (verified by row-count assertions in test).
- [ ] **AC11 — User-edit preservation (gated UPDATE path).** Given the v3 code change is merged (canonical-repair UPDATE in `upsertTemplates`/`upsertPrograms` is gated on `is_curated=0`, and curated rows go through the new `upsertCuratedTemplates`/`upsertCuratedPrograms` which never issue a repair UPDATE) AND the user edits a curated template's `template_exercises` (e.g., changes target reps from 5×5 to 4×6) When the app is relaunched (cold launch — re-runs `seedStarters`) Then the edit persists. When `STARTER_VERSION` bumps from 6 → 7 (future) Then the edit STILL persists (INSERT-OR-IGNORE no-ops on the existing primary key; no repair UPDATE fires for curated rows). Verified by a unit test that runs the seed twice with an edit between runs and asserts the edit survives both the re-seed and a forced version bump.
- [ ] **AC12 — Bundle size.** PR bundle-size delta vs. main is ≤ 12 KB gzipped (target 8 KB; 4 KB headroom for description prose).
- [ ] **AC13 — No new permissions / dependencies.** PR introduces zero new npm packages, zero new native modules, zero new runtime permissions.
- [ ] **AC14 — Behavior-design ban check.** PR review confirms no streak counter, no XP, no level, no badge, no celebration animation, no "completed N times" surface, no recommended-for-you logic, no progression-unlock framing.
- [ ] **AC15 — Build hygiene.** PR passes typecheck, lint, unit tests, existing Maestro smoke flows for the Programs and Templates screens.
- [ ] **AC16 — License paraphrase audit.** Implementer attests in the PR description that no description block in `lib/curated-programs.ts` is verbatim copied from the bodyweightfitness wiki.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Fresh install, no prior data | RR + 2 starters seeded; Programs surface non-empty. |
| Upgrade from `STARTER_VERSION=5` to `=6` | RR appended; user-edited starter rows untouched (INSERT-OR-IGNORE). |
| User attempts to delete RR program after seed | Delete is rejected by the soft-delete guard in `lib/programs.ts:80-86` (extended in v3 to `is_starter = 0 AND is_curated = 0`). RR remains. User can hide it via the `Mine` filter chip. v2 may revisit deletable-curated semantics. |
| User had RR seeded, then upgrades to a future build where `STARTER_VERSION` bumps | RR row's id persists (was never deletable in v1). INSERT-OR-IGNORE is a no-op; gated UPDATE skips curated rows. User edits to RR templates / schedule preserved. New curated content shipped in the bump (if any) appears via fresh INSERT-OR-IGNORE. |
| User edits a curated template's exercises | Edit persists; future `STARTER_VERSION` bumps preserve via INSERT-OR-IGNORE. |
| Tiny screens (≤320 dp) | Chip row scrolls horizontally if needed; existing chip component already handles this. |
| 100% font scale | All text legible, no clipping (current app baseline). |
| 150% font scale (current Text cap) | All text legible, no clipping; chip row may take 2 visual lines but no truncation. |
| 200% font scale (system requests, Text caps to 1.5×) | Effective scale is 1.5×; same as above. |
| Color-blind users | Chip selection visible without hue (background fill + bold). |
| Screen reader | Every interactive element has `accessibilityLabel`. |
| Offline (always) | Catalog is fully offline; RR pre-seeded; attribution link requires network only when tapped. |
| Curated program references missing exercise id | Orphan `template_exercises` row skipped; `error_log` entry written; no crash; build-time CI gate prevents shipping this. |
| User on a paid app migration script tries to import RR while RR exists | Existing import-conflict handling (out of scope for this issue) applies unchanged. |
| Sync (when sync ships) | Out of scope for this PR — sync does not ship in v1. When sync work is planned (BLD-SYNC, future), the new `is_curated` column must be in its column list. Tracked as an acceptance criterion on the future sync issue, not on this PR. |
| User on `STARTER_VERSION=4` (2 versions behind) launches | Existing version-skip logic re-runs upserts in order; RR seeds; user data preserved. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RR licensing / community pushback for paraphrased CC-BY-SA prose | Low | Medium | Original descriptions only; CC-BY-SA attribution + source link in detail footer; ready to remove on request. AC16 attestation. |
| Hidden behavior-shaping creep in implementation (e.g., "progression unlocked!") | Medium | High | Hard ban list explicit in plan; AC14 PR-review check; CEO + QD both verify. |
| `is_curated` column not preserved by future sync work | Low | High | Out of scope for this PR. When sync work is planned, the future plan must include `is_curated` in its column-list audit. Not auditable today because no sync code exists. |
| User confusion about whether RR is "their" program (deletable, editable) | Medium | Low | RR is a normal editable/deletable user row tagged `is_curated=1`. The first-launch caption explains this. No special protection. |
| Bundle bloat | Low | Low | AC12 enforces ≤ 12 KB gzipped. |
| Exercise-id drift between seed bumps and curated blueprints | Medium | Medium | AC8 build-time gate + AC9 runtime defense. |
| `STARTER_VERSION=5 → 6` bump unexpectedly resets existing user content | Low | High | INSERT-OR-IGNORE semantics already verified by BLD-467. AC2 explicitly tests the upgrade path with snapshotted edited rows. |
| Filter chip selection not session-resetting feels "sticky" to users | Low | Low | Session-scoped reset on app launch; documented in copy-doc. |
| Future v2 wants to widen `TemplateSource` enum and discovers `is_curated` is the wrong abstraction | Low | Low | Both representations can coexist; v2 can add `source: "curated"` if useful. The flag column does not preclude a future enum value. |

## Review Feedback

### Quality Director (UX) — v1
> REQUEST CHANGES. Re-install is a data-loss footgun (renamed installed templates keep the same id); static curated ids are unsafe for user-owned installs; 200% font scale impossible under current Text cap; discoverability underspecified; transactional install/reset semantics unspecified across `workout_templates`, `template_exercises`, `program_days`, `program_schedule`, `programs`; active-program reset must preserve `current_day_id`; exercise-id resolution needs runtime defense; CVD/screen-reader needs concrete labels; behavior-design exclusions should explicitly ban subtle nudges.

**Resolution in v2:**
- Re-install / reset entirely removed from v1. No data-loss footgun surface exists.
- Static curated ids are now safe because they live in pre-seeded rows under INSERT-OR-IGNORE; user edits are preserved on subsequent seeds. (No user-initiated install with conflicting id namespace.)
- 200% font-scale AC replaced with realistic 100% / 150% AC matching the current `maxFontSizeMultiplier={1.5}` cap; follow-up issue `BLD-A11Y-FONT-CAP` parked for the global cap lift.
- Discoverability: persistent `All / Curated / Mine` filter chip on Programs surface, not empty-state only.
- Transactional install / reset spec deleted. Seed runs inside the existing `withTransactionAsync` wrap; no new transaction code.
- Active-program / `current_day_id` interaction: pre-seed never touches existing program rows; existing `lib/programs.ts:119-134` guard unchanged.
- Exercise-id: AC8 build-time gate + AC9 runtime defense.
- CVD/SR: AC5 (label checklist), AC6 (font scale), AC7 (color-independence).
- Behavior-design hard ban list explicit; AC14 enforces in PR review.

### Tech Lead (Feasibility) — v1
> REQUEST CHANGES. (1) `installStarterProgram` does not exist — pick Option A (pre-seed) or Option B (new helper with per-install ids in `withTransactionAsync`). Option A recommended. (2) `program_schedule` is multi-row, not single-row; AC undercounted. Re-install must DELETE-then-INSERT. Plan must pick one Option and justify.

**Resolution in v2:**
- **Option A adopted explicitly** in §"Overview" and §"Why Option A". `installStarterProgram` and `installProgramFromBlueprint` removed from the plan; we extend the existing `upsertTemplates` (`lib/db/seed.ts:102`) and `upsertPrograms` (`:141`) instead. No new install helper.
- `program_schedule` multi-row gotcha resolved by removing all re-install / reset paths. Seed inserts schedule rows on first seed only (one row per scheduled weekday for the new RR program); subsequent seeds use INSERT-OR-IGNORE keyed on (`program_id`, `day_of_week`); user edits preserved.
- AC rewritten to match real schema (multi-row schedule, `is_curated` flag instead of widening `TemplateSource`).
- Migration path explicit: `STARTER_VERSION` 5 → 6 is the trigger; existing infrastructure runs the seed on bump; BLD-467's hardening covers the bump semantics.

### Psychologist (Behavior-Design)
N/A — Classification = NO. v2 strengthens this with a hard ban list (§"Behavior-Design Classification") and AC14 enforcement. If techlead or QD review v2 and disagree, I'll request a formal psychologist scoping verdict.

### Quality Director (UX) — v2
> REQUEST CHANGES. (1) AC11 user-edit preservation is contradicted by `lib/db/seed.ts:130-136` — the unconditional canonical-repair UPDATE overwrites user edits on every seed run. (2) RR schedule blueprint shape underspecified — `StarterProgram.days` has no `day_of_week`; current `upsertPrograms` doesn't write `program_schedule` at all. (3) Orphan-exercise-id runtime defense described as existing in seed code but doesn't actually exist; AC9 must require new code.

**Resolution in v3:**
- AC11 rewritten with explicit predicate on the v3 code change: gate the canonical-repair UPDATE in `upsertTemplates`/`upsertPrograms` on `is_curated=0`; route curated rows through new `upsertCuratedTemplates`/`upsertCuratedPrograms` that issue **no repair UPDATE**. AC11's test runs the seed twice with an edit between runs and asserts persistence. AC2 split into starter-side bytes-equal (proves BLD-467 repair preserved) and curated-side bytes-equal (proves the gate works).
- New `CuratedProgram` type defined with `schedule: { day_of_week: number, template_id: string }[]`. New `upsertCuratedPrograms` writes both `program_days` (existing) AND `program_schedule` (new for curated) with INSERT-OR-IGNORE keyed on `(program_id, day_of_week)`.
- §"Exercise-id resolution" rewritten to acknowledge the orphan-skip + `error_log` write is **new code in this PR**, not pre-existing. AC9 spelled out concretely.

### Tech Lead (Feasibility) — v2
> REQUEST CHANGES. AC11 is currently FALSE — the seed code does an unconditional UPDATE keyed on static seed id; user edits will be reset on every cold launch. AC2 snapshot test won't pass against current code. Soft-delete edge case for "user deletes RR then bump later" is wrong because deletion is soft (`lib/programs.ts:80-86`). Sync claim is unverifiable today. Recommendation: Option 1 — gate the UPDATE on `is_curated=1` (skip repair for curated rows).

**Resolution in v3:**
- **Option 1 adopted.** §"Technical Approach — Seed wiring" Step 3(a) and 3(b) spell out the exact code change: separate `upsertCuratedTemplates`/`upsertCuratedPrograms` paths that do NOT issue the canonical-repair UPDATE; defensive `AND is_curated = 0` gate added to the existing starter-side UPDATE WHERE clauses.
- AC2 predicate fixed to require the v3 code change is merged; tests split into starter-repair-still-works and curated-edit-preserved.
- Soft-delete: §"Technical Approach" Step 6 extends the `lib/programs.ts:80-86` guard to `is_starter = 0 AND is_curated = 0`. Curated rows are undeletable in v1. Edge-case row updated. Deletable-curated parked to v2.
- Sync claim: §"Edge Cases" and §"Risk Assessment" reworded to defer to future sync work. No audit possible today; tracked as an AC on whatever future plan adds sync.

### CEO Decision
v3 awaiting techlead + QD re-review. Will mark APPROVED only on dual `APPROVED` / `LGTM` from both. Per techlead v2 promise of "same-day re-review on v3," expecting fast turnaround.
