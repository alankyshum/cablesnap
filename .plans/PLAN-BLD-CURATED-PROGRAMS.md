# Feature Plan: Curated Programs Library

**Issue**: BLD-986  **Author**: CEO  **Date**: 2026-05-02
**Status**: DRAFT (rev 2 — addresses techlead + QD REQUEST CHANGES from v1)

## Revision History
- **v1** (2026-05-02 ~16:02 UTC): Initial draft. Built around an "install on tap" UI and a `installStarterProgram(...)` helper that does not exist; misstated `program_schedule` as a single-row table; defined a Re-install/reset flow that is a data-loss footgun; specified 200% font-scale AC that is currently impossible.
- **v2** (this revision): Adopt **Option A — pre-seed via existing `STARTER_TEMPLATES` / `STARTER_PROGRAMS` infrastructure**. No install UI, no re-install flow, no reset. Scope cut to **RR-only for v1**. Realistic a11y AC. Discoverability via persistent Programs-surface filter chip. All techlead and QD blocking points resolved or explicitly addressed below.

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
- As a no-frills user, I want RR to be **a normal user-editable program** — same as anything else I create — so I can adapt it (drop a movement, swap a progression) without forking some special "curated" record.
- As someone who wants to filter the Programs surface to "the proven stuff that ships with the app," I want a persistent **Curated** filter chip that shows me starter + curated programs distinct from my own creations.

## Proposed Solution

### Overview (Option A — pre-seed, NO install UI)
Add the bodyweightfitness Recommended Routine to the existing seed pipeline, alongside the existing starter programs. RR appears in **My Programs** and **My Templates** automatically, on first launch and on any version upgrade that bumps `STARTER_VERSION`. There is **no install button, no re-install flow, no reset, no separate catalog screen** in v1. Discoverability comes from the program already being present plus a Programs-surface filter chip.

### Why Option A (vs. install-on-demand)
- **Matches existing pattern.** `lib/db/seed.ts:102` (`upsertTemplates`) and `:141` (`upsertPrograms`) already do exactly this for starter content via INSERT-OR-IGNORE gated by `STARTER_VERSION` (`lib/starter-templates.ts:28`, currently `5`). BLD-467 already hardened the version-bump-on-deploy semantics.
- **Eliminates the data-loss footgun.** No re-install means no "replaces your edits" dialog, no prefix-matching to figure out which rows to overwrite. Static IDs are safe because rows are pre-seeded with `is_starter=1` (or `is_curated=1`) and the seed runs INSERT-OR-IGNORE — user edits to those rows after seed are never touched on subsequent app launches unless `STARTER_VERSION` is bumped. Bumping `STARTER_VERSION` is a deliberate deploy-time act, not a UI button.
- **Better serves the Reddit pain point.** "Open app, see proven program, start training" *is* zero install UX. An install button is itself friction — and the Reddit user explicitly named "no frills."
- **Removes a whole category of edge cases.** No transactional install, no mid-install failure handling, no "active program reset" semantics, no schedule-row delete-and-replace logic. The `program_schedule` multi-row gotcha (techlead #2) goes away entirely because we never touch user schedule rows after first seed.

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
2. **Constants.** New file `lib/curated-programs.ts` exporting `CURATED_TEMPLATES: StarterTemplate[]` and `CURATED_PROGRAMS: StarterProgram[]` (reusing the existing types — a curated row IS a starter row in shape, plus the `is_curated` flag). Bundle target ≤ 8 KB gzipped for v1 (RR alone).
3. **Seed wiring.** Extend `upsertTemplates` (`lib/db/seed.ts:102`) and `upsertPrograms` (`:141`) to additionally upsert `CURATED_TEMPLATES` / `CURATED_PROGRAMS` with `is_curated=1, is_starter=0`. Same INSERT-OR-IGNORE idempotency pattern. Bump `STARTER_VERSION` from 5 → 6 to trigger re-seed on existing installs (this re-runs `upsertTemplates`/`upsertPrograms` for both starter and curated content; existing user edits to starter rows are preserved by the existing logic, and we extend the same logic to curated rows).
4. **`TemplateSource` enum.** No widening required. Curated programs are identified by `is_curated=1`, not by the `source` column. The `source` field stays `"coach" | null`. This avoids the migration landmine in `lib/types.ts:219` and avoids touching every Zod schema and serializer that consumes `TemplateSource`.
5. **No `installProgramFromBlueprint` helper.** No new install code path. No transactional install logic. `withTransactionAsync` is already wrapped around the existing seed at `lib/db/seed.ts` and that wrap is reused as-is.

**Exercise-id resolution (addresses QD #6, techlead implicit).**
- **Build-time gate (CI):** existing test infrastructure for starter exercises is extended to assert every `exercise_id` in `CURATED_TEMPLATES` resolves in the seed exercise DB. Test file path TBD by implementer (likely `__tests__/seed.test.ts` or `lib/__tests__/curated-programs.test.ts`).
- **Runtime defensive handling:** the existing seed code path tolerates orphan `exercise_id` references by skipping the `template_exercises` insert and emitting an error to `error_log`. We add no new failure mode and rely on the same defensive pattern. Acceptance criterion includes a test that proves an orphan curated `exercise_id` does not crash app launch.

**Active program / `current_day_id` interaction (addresses QD #5).**
- Pre-seed never touches an existing program's `current_day_id`. `program_schedule` rows for newly-seeded curated programs are inserted as part of the seed (`day_of_week, template_id` rows per day), but they are scoped to the **new** `program_id` only; user programs and their schedule rows are untouched.
- The existing `lib/programs.ts:119-134` guard logic is unchanged. No additional reset code is added because no reset flow exists in v1.
- Re-seed on `STARTER_VERSION` bump preserves existing `program_schedule` rows for curated programs by INSERT-OR-IGNORE keyed on (`program_id`, `day_of_week`). If a user has edited a curated schedule row, the bump leaves it alone.

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
- [ ] **AC2 — Seed presence (upgrade).** Given an existing CableSnap install on `STARTER_VERSION=5` (no RR) When the user updates to the version with `STARTER_VERSION=6` and launches Then RR appears in their Programs list AND no existing program/template they had previously edited is modified (verified by snapshotting two known-edited starter rows pre-upgrade and asserting bytes-equal post-upgrade).
- [ ] **AC3 — Filter chip behavior.** Given the user is on the Programs surface When they tap the `Curated` chip Then the list shows only programs where `is_starter=1 OR is_curated=1`. When they tap `Mine` Then the list shows only programs where both flags are 0. When they tap `All` Then all programs show. Selection is session-scoped (resets to `All` after app restart).
- [ ] **AC4 — Detail attribution.** Given the user opens RR's detail screen Then a footer line displays "Adapted from r/bodyweightfitness Recommended Routine (CC-BY-SA 3.0)." with the program name as a tappable link to the wiki, AND tapping it opens the system browser.
- [ ] **AC5 — A11y, screen-reader checklist.** All of the following have non-empty `accessibilityLabel` and a correct `accessibilityRole`: each filter chip; each program list row; the detail-screen attribution link; the dismiss button on the first-launch info caption. Verified by an automated `expect(getByA11yRole(...))` test for each.
- [ ] **AC6 — A11y, font scale.** At system font scale 100% AND at 150% (the current app-wide cap), no text in the filter chip row, the Programs list rows, or the RR detail screen header/footer is clipped or truncated invisibly. Verified by a snapshot test at both scales OR a manual checklist signed off by QD.
- [ ] **AC7 — A11y, color independence.** Selected chip remains distinguishable from unselected chips when rendered through deuteranopia and protanopia color filters (selected uses background fill + bold weight, not hue alone). Verified by visual diff or QD checklist.
- [ ] **AC8 — Exercise-id integrity (build-time).** The CI test suite includes a test that fails the build if any `exercise_id` referenced in `CURATED_TEMPLATES` does not resolve in the seed exercise DB.
- [ ] **AC9 — Exercise-id integrity (runtime).** Given a curated template references an `exercise_id` that does not resolve at seed time When the app launches Then no crash occurs, the offending `template_exercises` row is skipped, and an entry is written to `error_log` with `component='seed.curated'`. Tested via a forced-orphan unit test.
- [ ] **AC10 — Idempotency.** Given the user has launched the app twice with `STARTER_VERSION=6` When the second launch's seed runs Then no duplicate `programs`/`workout_templates`/`program_schedule` rows are created (verified by row-count assertions in test).
- [ ] **AC11 — User-edit preservation.** Given the user edits a curated template's `template_exercises` (e.g., changes target reps from 5×5 to 4×6) When the app is relaunched (without a `STARTER_VERSION` bump) Then the edit persists. When `STARTER_VERSION` bumps from 6 → 7 (future) Then the edit STILL persists (INSERT-OR-IGNORE semantics; documented in test).
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
| User deletes RR program after seed | RR is gone. We do NOT auto-re-seed. (Same semantics as starters.) Filter chip `Curated` may then show only the 2 original starters. |
| User deletes RR then `STARTER_VERSION` bumps later | RR is re-seeded by INSERT-OR-IGNORE — the program row's id was preserved, but if the user's deletion cascaded the row entirely, INSERT-OR-IGNORE sees no conflict and re-creates it. Documented behavior. |
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
| Sync (when sync ships) | Curated rows sync as normal user rows; `is_curated=1` flag travels (since sync is `SELECT *`). |
| User on `STARTER_VERSION=4` (2 versions behind) launches | Existing version-skip logic re-runs upserts in order; RR seeds; user data preserved. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RR licensing / community pushback for paraphrased CC-BY-SA prose | Low | Medium | Original descriptions only; CC-BY-SA attribution + source link in detail footer; ready to remove on request. AC16 attestation. |
| Hidden behavior-shaping creep in implementation (e.g., "progression unlocked!") | Medium | High | Hard ban list explicit in plan; AC14 PR-review check; CEO + QD both verify. |
| `is_curated` column not preserved by sync | Low | High | Pre-implementation audit: verify all sync code paths use `SELECT *` on `workout_templates` and `programs`. If any path uses an explicit column list, add `is_curated`. Implementer documents the audit in the PR. |
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

### CEO Decision
v2 awaiting techlead + QD re-review. Will mark APPROVED only on dual `APPROVED` / `LGTM` from both.
