# Feature Plan: Daily Visual UX Audit Routine

**Issue**: BLD-481
**Author**: CEO
**Date**: 2026-04-22
**Status**: DRAFT → IN_REVIEW → APPROVED (2026-04-22, TL + QD)

## Problem Statement

BLD-480 (muscle heatmap cropped on post-workout screen) shipped across 6 releases
because:

1. We have **no acceptance tests that render the completed-workout screen with
   realistic mock data**. Playwright specs today navigate to static routes only
   (`screenshot-capture.spec.ts`), with no scenario that completes a session.
2. We have **no semantic visual review step**. Jsdom/Playwright assertions catch
   missing elements but not cropping, overflow, truncation, or contrast issues.
3. The `ux-designer` agent has been idle — its current instructions describe an
   OpenCode TUI role that no longer matches the org (CableSnap is React Native).

The org's **Fluent-UX goal** (`813a8479-...`) requires ground-truth UX feedback
and it's not being produced.

## User Stories

- As the CEO, I want a daily stream of visual-evidence-backed UX findings so
  that I can triage real defects before users see them.
- As a user, I don't want cropped/truncated/misaligned UI shipping in releases.
- As the ux-designer agent, I want structured screenshots + metadata so I can
  file actionable bugs with a direct path back to the failing test/commit.

## Proposed Solution

### Overview — the loop

Reuse the existing Playwright screenshot-capture infrastructure
(`.pixelslop/screenshots/`, `e2e/screen-registry.ts`,
`e2e/screenshot-capture.spec.ts`) rather than introducing Maestro/Detox. Add a
**scenario layer** on top that can render stateful screens (completed workout,
populated history, etc.) by pre-seeding the Drizzle SQLite store via a web-only
test hook, then extend the ux-designer agent to consume the resulting bundle.

```
┌──────────────────┐    daily cron     ┌────────────────┐
│ Paperclip cron   │──────────────────▶│  ux-designer   │
└──────────────────┘                   └────────┬───────┘
                                                │ creates audit issue
                                                ▼
                                       ┌────────────────┐
                                       │   claudecoder  │
                                       │  (engineer)    │
                                       └────────┬───────┘
                                                │ runs scenario specs,
                                                │ uploads bundle to
                                                │ GH Release asset
                                                ▼
                                       ┌────────────────┐
                                       │  ux-designer   │
                                       │  (vision review)│
                                       └────────┬───────┘
                                                │ files findings → CEO
                                                ▼
                                       ┌────────────────┐
                                       │      CEO       │  (triage as usual)
                                       └────────────────┘
```

### UX Design (agent-facing)

- **Audit issue title**: `AUDIT: Daily visual UX audit — YYYY-MM-DD`
- **Audit issue body**: lists scenarios to run, commit SHA to audit, and a
  checklist the engineer fills in (scenarios run, bundle URL, SHA, test version).
- **Finding issues** (one per defect): title
  `UX: <short description> (audit YYYY-MM-DD, <scenario>)` — description
  includes the inline screenshot URL, scenario name, route, commit SHA,
  severity (critical/major/minor), and a suggested fix.
- Clean audits post a single comment on the audit issue, which is then closed.

### Technical Approach

#### 1. Scenario layer (the missing piece)

Add `e2e/scenarios/` — each scenario is a Playwright spec that:

- Boots the web build with a new `window.__TEST_SCENARIO__` init flag
- Seeds an in-memory state fixture (via a new `lib/db/test-seed.ts` dev-only
  hook that's a no-op in production builds, guarded by `__DEV__` AND a
  scenario flag)
- Navigates to the target screen(s) and calls `pauseAndCapture(label)`

`pauseAndCapture(label)` is a thin helper around
`page.screenshot()` that writes to
`.pixelslop/audits/YYYY-MM-DD/<scenario>/<label>-<viewport>.png` and a
sibling `.json` metadata file (scenario, label, route, commit SHA, viewport,
timestamp). No Maestro, no Detox — stays within the existing Playwright
toolchain and CI pathway.

**Scenarios for v1 (minimum viable)**:
- `completed-workout-summary` — this is the one that would have caught BLD-480
- `workout-history-populated`

Remaining 5 (fresh install, active workout, history empty, settings, Strava)
are deferred to follow-up issues once the loop proves out.

#### 2. Bundle attachment

Reuse GitHub Releases. The engineer runs:

```bash
git tag -f audit-YYYY-MM-DD
cd .pixelslop/audits/YYYY-MM-DD && zip -r ../audit-YYYY-MM-DD.zip .
gh release create audit-YYYY-MM-DD --prerelease --notes "Visual audit bundle"
gh release upload audit-YYYY-MM-DD ../audit-YYYY-MM-DD.zip
```

The release URL + individual screenshot URLs (via the release asset API) go
into the audit issue as a comment. Dispatch/ux-designer can `gh release
download` them. Bundles auto-archive in Git history and are free.

Skill wrapper: `scripts/audit-bundle.sh` (new) encapsulates zip + release +
comment. Bounded retention — keep last 14 releases tagged `audit-*`, prune
older via the same script.

#### 3. ux-designer agent rewrite

Rewrite `/skills/AGENTS-ux-designer.md` for the CableSnap (React Native/Expo)
role. New responsibilities:

1. On wake, if the trigger is `daily-audit-cron`, create the audit issue
   assigned to claudecoder with scenario list + commit SHA.
2. On wake for a completed audit issue (claudecoder replies with bundle URL),
   `gh release download` the bundle, load each screenshot **into its own
   context** (the agent IS Opus 4.7 with vision), review with the standardized
   prompt, and emit findings as new issues to CEO.
3. Update the audit issue to `done` with a summary (# findings, severity
   breakdown).

**Review prompt** (canned):
> For each screenshot, inspect for: truncation/cropping, overflow, poor
> contrast, touch-target size (<44dp), text legibility, alignment, empty-state
> clarity, and inconsistency vs. sibling screens. Output a JSON array:
> `[{screenshot, severity: "critical"|"major"|"minor", description,
> suggested_fix}]`. Return `[]` if clean.

#### 4. Daily cron — Paperclip routine (primary path, pre-provisioned)

**Decision updated 2026-04-22 14:32** after board pre-provisioned the routine
out-of-band (routine ID `ab23d3ed-e434-4357-ab62-7ccf41159989`, paused + trigger
disabled until plan approval + primitives land). Background: Paperclip's
routines API hardcodes `assigneeAgentId === req.actor.agentId`, so the CEO
itself cannot create cross-agent routines. Upstream fix tracked as
[paperclipai/paperclip#4264](https://github.com/paperclipai/paperclip/issues/4264).

Current state of the cron path:

1. **Paperclip routine (primary, pre-provisioned).** Board user created the
   routine; will flip `status: active` + `trigger.enabled: true` after (a) this
   plan is APPROVED, (b) engineering primitives ship, (c) `ux-designer` agent
   instructions file is wired up. Schedule: `0 9 * * *` America/Los_Angeles.
   Concurrency `skip_if_active`, catch-up `skip_missed`.
2. **GitHub Actions cron (fallback).** Retained only as backup if the routine
   is ever deleted or upstream regresses. Not built for v1 — routine is primary.

V1 ships option 1 (routine activation). Option 2 remains available but
unimplemented.

No further action required from CEO on cron provisioning. Activation is a
board action timed to plan approval.

#### 5. BLD-480 regression-catcher verification

Acceptance criterion: check out the commit immediately before BLD-480's fix,
run the audit, and verify ux-designer files a finding describing the cropping.
If it doesn't, the prompt or scenario needs tuning before marking this feature
done.

### Scope

**In Scope (v1):**
- `e2e/scenarios/` directory + 2 scenario specs (completed workout, populated
  history)
- DB seed helper gated on `__TEST_SCENARIO__` (web-only, dev-only)
- `pauseAndCapture()` helper + JSON metadata writer
- `scripts/audit-bundle.sh` (zip + GH Release + prune)
- `/skills/AGENTS-ux-designer.md` rewrite for CableSnap
- Daily cron trigger (Paperclip-native OR GitHub Actions fallback)
- One successful end-to-end audit run
- Regression verification against BLD-480's pre-fix commit

**Out of Scope (v1):**
- Pixel-diff visual regression
- Detox / Maestro / native (iOS/Android) screenshots — web viewport only
- Remaining 5 scenarios (onboarding, active workout, empty history, settings,
  Strava) — follow-up issues
- Auto-PR generation for findings
- A `quality-director` integration (findings are triaged by CEO, not QD)

### Dependencies

- Existing: Playwright, `e2e/screen-registry.ts`, `e2e/helpers.ts`,
  `.pixelslop/screenshots/`, Drizzle SQLite store, `gh` CLI
- No new runtime dependencies
- No new dev dependencies (all tooling exists)

### Acceptance Criteria

- [ ] `e2e/scenarios/completed-workout-summary.spec.ts` renders the post-workout
      screen with mock data and produces a screenshot + metadata JSON.
- [ ] `e2e/scenarios/workout-history-populated.spec.ts` same, for populated
      history.
- [ ] `pauseAndCapture(label)` helper exists, writes to
      `.pixelslop/audits/<date>/<scenario>/`, and emits metadata sibling JSON.
- [ ] DB seed helper is a no-op when `window.__TEST_SCENARIO__` is unset AND in
      production builds (guarded by `__DEV__`).
- [ ] `scripts/audit-bundle.sh` uploads a bundle as a GH pre-release asset and
      prints the release URL.
- [ ] `/skills/AGENTS-ux-designer.md` describes the CableSnap audit role —
      stale OpenCode content removed.
- [ ] ux-designer agent successfully runs one end-to-end audit that files ≥1
      finding issue (proved by running it against the pre-BLD-480-fix commit).
- [ ] Board activates the pre-provisioned Paperclip routine
      (`ab23d3ed-e434-4357-ab62-7ccf41159989`) once primitives land and the
      `ux-designer` agent is wired up; first scheduled run fires at 09:00 PT.
- [ ] No new production code paths are added (scenario seed helper must be
      dev-only/test-only).

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Scenario spec fails (app crash) | Engineer reports failure on audit issue, ux-designer treats as P0 finding and files it to CEO. |
| Clean audit (no findings) | ux-designer posts `Clean audit ✅` on audit issue, closes to `done`. No noise in CEO's inbox. |
| Bundle upload fails (GH rate limit) | `audit-bundle.sh` retries once with backoff, else exits non-zero; engineer marks audit `blocked`. |
| Vision finds false positives | Over time, CEO closes findings as `cancelled` with reason; ux-designer's prompt is tuned in a follow-up. Not a blocker for v1. |
| DB seed leaks into production bundle | Guarded by `__DEV__ && window.__TEST_SCENARIO__`; tree-shaken in release. CI typecheck + `expo export` sanity check. |
| Two audits in one day (manual + cron) | Issues are keyed by date; on conflict, reuse the existing issue and append a second bundle. |
| Audit runs on broken build | Engineer reports build failure; ux-designer defers and escalates to CEO. |
| Screenshot flakiness | `pauseAndCapture` waits for network idle + a `data-test-ready="true"` flag the scenario sets after seeding; retry once. |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Web viewport screenshots miss native-only bugs | Med | Med | Accepted for v1. React Native Web renders the same component tree; most layout bugs (including BLD-480) reproduce on web. Native audit is a follow-up. |
| DB seed helper ends up in production bundle | Low | High | `__DEV__` guard + tree-shaking + runtime flag; validated via `expo export` bundle inspection in the acceptance criteria. |
| Vision model hallucinates findings | Med | Low | CEO triages — false positives cost one `cancelled` issue per occurrence. Tune prompt iteratively. |
| Paperclip lacks native cron (or CEO can't create routines) | **Resolved 2026-04-22** | — | Board pre-provisioned the routine (`ab23d3ed-e434-4357-ab62-7ccf41159989`, paused); will activate post-plan-approval. Upstream fix to routine authz tracked as paperclipai/paperclip#4264. GH Actions retained only as disaster-recovery fallback. |
| Bundle storage growth | Low | Low | Prune to last 14 pre-releases in `audit-bundle.sh`. |
| ux-designer vision cost per run | Low | Low | Opus vision at ~12 screenshots/day × 2 viewports = 24 images ≈ acceptable. Bounded. |
| False sense of security (web-only audit) | Med | Med | Document the limitation in the agent's standard finding template: "web viewport audit — native not covered". |

## Follow-ups (out of scope for v1 implementation)

- **Upstream Paperclip fix** — loosen routine authorization so CEO/manager
  agents with `routines:assign` (or equivalent) can create routines for direct
  reports in their chain of command. Current `assigneeAgentId === actorAgentId`
  check blocks legitimate manager→report delegation. Tracked upstream as
  [paperclipai/paperclip#4264](https://github.com/paperclipai/paperclip/issues/4264).
  Once fixed, future routines won't require board pre-provisioning.
- **Remaining 5 scenarios** — onboarding, active workout, empty history,
  settings, Strava connection flow. Each as a separate ticket after v1 proves.
- **Native-viewport audit** — Detox or Maestro integration for iOS/Android-only
  layout bugs. Defer until web audit proves valuable.

## Review Feedback

<!-- Filled by reviewers -->

### Quality Director (UX Critique)

**Verdict: APPROVE WITH CONDITIONS (non-blocking)**
**Reviewer:** quality-director · **Date:** 2026-04-22 · **Plan SHA:** fddeee7

QD concurs with all 7 of TL's directed improvements and adds 5 quality-of-quality conditions to fold into implementation. None are blockers.

**QD conditions (fold into implementation)**

1. **Regression-catcher as permanent daily smoke.** Pin the pre-fix commit (parent of `6f067cc`) and run the BLD-480 scenario against *both* current HEAD and the pinned SHA every day. If vision ever stops reporting a finding on the pre-fix commit, the audit loop has silently degraded — this is the primary trust-anchor for the whole system. Without it, a broken vision pipeline produces green audits indefinitely.
2. **Tighten regression-catcher acceptance.** "≥1 finding on pre-fix commit" is too permissive (hallucinations satisfy it). Require the finding's `description` or `scenario`+`label` to match one of: `crop`, `truncat`, `clip`, `maxHeight`, `cut off`, or reference `MusclesWorkedCard` / body-figure region (case-insensitive).
3. **Finding dedup across consecutive days.** Prevent CEO-inbox DoS when a defect persists 3+ days. Before filing, ux-designer searches open issues labeled `ux-audit` for matching `(scenario, fingerprint)` where fingerprint = hash of normalized description + scenario + label; on match, post "+1 recurrence" comment on the existing issue. Create the `ux-audit` label. Add to ux-designer agent spec.
4. **Severity rubric in vision prompt.**
   - **critical**: blocks core action (can't see primary info, unusable tap target, unreadable content)
   - **major**: visual defect degrading trust (cropping, overflow, misalignment, inconsistent with sibling screens) — BLD-480 is the calibration anchor
   - **minor**: polish (spacing, minor contrast, typography inconsistency)
5. **Unit-test the seed-hook guards.** In addition to TL's bundle-grep PR gate, add a jest test asserting `seed()` is a no-op when any of `__DEV__ === false`, `window.__TEST_SCENARIO__` unset, or `Platform.OS !== 'web'`.

**Non-blocking observations**

- "Two audits in one day" → specify the **later** bundle is the one ux-designer reviews (not both), to avoid double-charging vision cost.
- `(audit-date, commit SHA)` dedup key to prevent P0 filings when the build was already known-broken by claudecoder's prior comment.
- Weekly QD rollup of `ux-audit` trend signal → **follow-up ticket**, not v1.

### Tech Lead (Technical Feasibility)

**Verdict: APPROVE (with directed implementation notes)**
**Reviewer:** techlead · **Date:** 2026-04-22

**Why APPROVE**

1. **Infra reuse is correct.** `e2e/screenshot-capture.spec.ts`, `e2e/screen-registry.ts`, `e2e/helpers.ts`, and `.pixelslop/screenshots/` already exist and do exactly what this plan extends. No new framework (no Maestro/Detox) keeps the CI pathway unchanged.
2. **`window.__TEST_SCENARIO__` matches a proven pattern.** `hooks/useAppInit.ts:21` already consumes `window.__SKIP_ONBOARDING__`, set via `addInitScript` in `e2e/helpers.ts:17`. The new flag fits the same shape — no new architecture.
3. **Web DB is already in-memory.** `lib/db/helpers.ts:47-55` falls back to `:memory:` on web when the on-disk open fails; on web builds under Playwright, seeded scenario state never touches user storage. This is *safer* than the plan claims — it's a structural property, not just a `__DEV__` guard.
4. **Scope is sharp.** 2 scenarios for v1 + BLD-480 regression-catcher as the exit criterion is the right risk-first cut.
5. **Cron path is unblocked.** Paperclip routine pre-provisioned out-of-band, upstream authz bug tracked (paperclipai/paperclip#4264). No further engineering required to ship v1.

**Directed improvements (fold into implementation — non-blocking)**

1. **Belt-and-suspenders seed guard.** `__DEV__ && window.__TEST_SCENARIO__` is sufficient on web (tree-shaken in production), but add `Platform.OS === 'web'` as a hard top-level check in `lib/db/test-seed.ts`. If someone later wires a scenario spec against a native target, we must not mutate the on-disk `cablesnap.db`. Cheap insurance.
2. **Define the seed-vs-init ordering explicitly.** Production `seed()` runs during `getDatabase()` (`lib/db/helpers.ts:42`). The plan doesn't specify whether scenarios (a) set the flag pre-load and the production init consults it, or (b) clear + reseed post-init and gate the capture behind a `data-test-ready="true"` flag. Option (b) is simpler and already aligned with the flakiness mitigation in the Edge Cases table. Pick (b) explicitly in the helper's doc comment so future contributors don't reintroduce (a).
3. **Production-bundle verification is a real acceptance criterion.** The plan already lists `expo export` bundle inspection — make it a PR gate, not a manual step. Add to CI or a preflight script (`scripts/verify-scenario-hook-not-in-bundle.sh`): grep the exported bundle for `__TEST_SCENARIO__` string and fail if present.
4. **Viewport scope for v1.** Default scenario specs to the `mobile` Playwright project only for v1 (not all 5 viewports). 2 scenarios × 5 viewports × ~2 captures each blows vision cost + triage noise past the plan's ~24-image estimate. Expand viewports in a follow-up once the loop proves signal. Add to Scope (In Scope v1).
5. **Bundle prune must delete tags.** `gh release delete --cleanup-tag` in `scripts/audit-bundle.sh` or the `audit-*` tag space accumulates forever. Also set an upper bound (e.g., `--per-page 100`) to avoid missing older tags during prune.
6. **Pin the BLD-480 regression commit.** Acceptance criterion says "commit immediately before BLD-480's fix." Pin the SHA in the plan (the commit before `6f067cc fix: remove maxHeight crop on workout summary muscle heatmap (#292)`) so the regression-catcher test is reproducible and re-runnable as a permanent smoke.
7. **Audit issue template belongs in the plan.** Plan describes fields ux-designer puts in the audit issue verbally but doesn't codify the template. Add a fenced markdown block showing the exact body so ux-designer and claudecoder agree on the schema.

**Non-blocking notes**

- The duplicate plan-review issues (BLD-486/487/488/489/491 for QD, BLD-490 for TL, this one BLD-492) should be collapsed by dispatch — not a plan concern, flagging for awareness.
- Vision cost (24 images/day) is fine today; if we scale to 7 scenarios × 3 viewports it jumps ~4x. Revisit before expanding.
- Scenario-fail vs. broken-build handling in Edge Cases may double-file if not deduplicated by the `(audit-date, commit SHA)` key. Consider explicit dedup in the ux-designer prompt.

**What I'm NOT blocking on**

Technical feasibility is fully established. The acceptance criteria are testable. The Paperclip routine path is pre-provisioned. Proceed with implementation; the 7 items above are better addressed as the code lands than as another review round.

### CEO Decision

**APPROVED 2026-04-22.** Both reviewers (techlead, quality-director) have posted APPROVE. TL's 7 directed improvements and QD's 5 conditions are folded into the implementation subtask spec — no further plan-review rounds. Proceeding to implementation phase.
