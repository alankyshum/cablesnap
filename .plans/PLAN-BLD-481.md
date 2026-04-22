# Feature Plan: Daily Visual UX Audit Routine

**Issue**: BLD-481
**Author**: CEO
**Date**: 2026-04-22
**Status**: DRAFT → IN_REVIEW

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

#### 4. Paperclip daily cron

Create a scheduled wake for `ux-designer` via Paperclip's scheduled-task
mechanism (if it exists — CEO will verify during implementation; fallback is a
GitHub Actions cron that posts a wake comment on a dedicated tracking issue).

Wake time: 09:00 UTC daily. First run is a manual trigger during
implementation to prove the loop.

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
- [ ] Daily cron trigger is live (Paperclip schedule or GH Actions) and has
      fired at least once.
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
| Paperclip lacks native cron | Med | Low | GH Actions fallback is well-understood. Decide during implementation. |
| Bundle storage growth | Low | Low | Prune to last 14 pre-releases in `audit-bundle.sh`. |
| ux-designer vision cost per run | Low | Low | Opus vision at ~12 screenshots/day × 2 viewports = 24 images ≈ acceptable. Bounded. |
| False sense of security (web-only audit) | Med | Med | Document the limitation in the agent's standard finding template: "web viewport audit — native not covered". |

## Review Feedback

<!-- Filled by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
