# Feature Plan: In-App Feedback & Crash Reporting System

**Issue**: BLD-63
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

Users currently have no direct way to report bugs, request features, or submit crash reports that reach the development team. The existing crash reporting is limited to:
- An error log viewer in Settings
- A JSON file share via expo-sharing (requires manual delivery)
- ErrorBoundary share button (only appears after fatal crash)

The board wants a **closed feedback loop**: user encounters issue → submits feedback → GitHub issue is auto-created with diagnostic data → team can act on it. This replaces guessing with real user signal.

## User Stories

- As a user who encounters a bug, I want to report it with one tap so that the developers can fix it quickly
- As a user with a feature idea, I want to submit it easily so that the app improves based on my needs
- As a user who experienced a crash, I want the crash report to include everything the developers need so I don't have to explain technical details
- As a developer, I want user reports to include interaction history and system info so I can reproduce issues faster

## Proposed Solution

### Overview

Build an in-app feedback system with three report types (bug, feature request, crash) that auto-creates pre-filled GitHub issues. Add an interaction logger that proactively caches the last 10 user actions for diagnostic context.

### UX Design

#### Entry Points
1. **Settings screen** — Replace current "Crash Reporting" section with "Feedback & Reports" section containing:
   - "Report a Bug" button (primary)
   - "Request a Feature" button (outlined)
   - "View Error Log" button (outlined, existing)
   - Error count badge preserved
2. **ErrorBoundary** — Update existing "Share Crash Report" to use the new feedback system with type=crash auto-selected

#### Feedback Screen (`app/feedback.tsx`)
- **Type selector**: Segmented buttons — Bug Report / Feature Request / Crash Report
- **Title field**: TextInput (required, max 100 chars)
- **Description field**: Multiline TextInput (required for bugs/features, optional for crashes)
- **Auto-attached data** (shown as expandable "Diagnostic Info" section):
  - App version, platform, OS version
  - Last 10 interactions (timestamped)
  - Recent errors (last 5 from error_log, for bug/crash types)
  - Device info
- **Actions**:
  - "Submit to GitHub" (primary) — opens pre-filled GitHub issue in device browser via `expo-linking`
  - "Share Report" (outlined) — shares full report via expo-sharing (fallback for users without GitHub)
- **Confirmation**: After submission, show Snackbar "Report opened in browser" or "Report shared"

#### GitHub Issue Auto-Creation
Since FitForge is a client-only app (no backend), use `expo-linking` to open a pre-filled GitHub issue URL:
```
https://github.com/alankyshum/fitforge/issues/new?title=...&body=...&labels=bug|enhancement
```

The issue body will be auto-filled with:
```markdown
## Description
[User's description]

## Steps to Reproduce
[For bugs — prompted in the description field]

## Diagnostic Info
- App Version: 1.0.0
- Platform: ios / android
- OS Version: 17.4

## Recent Interactions
1. [timestamp] Navigated to Exercises
2. [timestamp] Tapped exercise "Bench Press"
3. [timestamp] Started workout session
...

## Error Log (last 5)
- [timestamp] Error: ... (fatal: false)
...
```

**URL length consideration**: GitHub issue URLs have practical limits (~8000 chars). The report must be truncated if it exceeds this. Interaction descriptions are kept short. Stack traces are trimmed to first 3 lines each.

#### Interaction Logger
A lightweight event logger that records the last 10 user interactions in memory (AsyncStorage or SQLite). Each interaction captures:
- Timestamp
- Action type: `navigate`, `tap`, `submit`, `delete`, `create`
- Screen/component name
- Brief description (e.g., "Opened exercise: Bench Press")

Interactions are recorded at key points:
- Screen focus events (via expo-router)
- Major user actions (start session, save template, add food, etc.)

**Storage**: SQLite table with FIFO behavior (delete oldest when count exceeds 10 entries). This is simpler than AsyncStorage and consistent with the rest of the app.

### Technical Approach

#### New Files
- `lib/interactions.ts` — Interaction logger (log, get, types)
- `app/feedback.tsx` — Feedback submission screen

#### Modified Files
- `lib/db.ts` — Add `interaction_log` table migration + query functions
- `lib/errors.ts` — Update `generateReport()` to include interactions
- `lib/types.ts` — Add `Interaction` type
- `app/(tabs)/settings.tsx` — Replace "Crash Reporting" section with "Feedback & Reports"
- `app/_layout.tsx` — Add Stack.Screen for feedback route + integrate interaction logger for navigation events
- `components/ErrorBoundary.tsx` — Update "Share Crash Report" to navigate to feedback screen or use new report format

#### Data Model
```sql
CREATE TABLE IF NOT EXISTS interaction_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,       -- 'navigate' | 'tap' | 'submit' | 'delete' | 'create'
  screen TEXT NOT NULL,       -- screen/component name
  detail TEXT,                -- brief description
  timestamp INTEGER NOT NULL
);
```
FIFO: After each insert, delete rows where id NOT IN (SELECT id ORDER BY timestamp DESC LIMIT 10).

#### Report Generation
Update `generateReport()` to produce a comprehensive report:
```typescript
{
  type: "bug" | "feature" | "crash",
  title: string,
  description: string,
  generated_at: string,
  app_version: string,
  platform: string,
  os_version: string,
  interactions: Interaction[],   // last 10
  errors: ErrorEntry[],          // last 5
}
```

Add `generateGitHubURL(report)` function that:
1. Builds the issue body markdown from the report
2. URL-encodes title and body
3. Sets labels based on type (bug -> `bug`, feature -> `enhancement`, crash -> `bug,crash`)
4. Returns the full GitHub issue URL
5. Truncates body if URL would exceed 8000 chars

#### Interaction Logging Integration Points
Add `logInteraction()` calls at these existing locations:
- `app/_layout.tsx` — navigation state changes (screen focus)
- `app/session/[id].tsx` — session start
- `app/template/create.tsx` — template created
- `app/exercise/create.tsx` — exercise created
- `app/(tabs)/index.tsx` — workout start from schedule
- `app/nutrition/add.tsx` — food entry added

Keep it lightweight — a single function call with 3-4 args, fire-and-forget (no await needed for UI flow).

### Scope

**In Scope:**
- Interaction logger (SQLite-backed, FIFO, last 10)
- Feedback screen with bug/feature/crash type selection
- GitHub issue auto-creation via pre-filled URL
- Share report fallback via expo-sharing
- Updated settings screen section
- Updated ErrorBoundary to use new feedback flow
- Integration at 6-8 key action points for interaction logging
- Report truncation for URL length limits

**Out of Scope:**
- Backend/proxy service for GitHub API auth
- Push notification when issue is resolved
- Screenshot attachment (would require expo-media-library)
- Shake-to-report gesture
- Analytics/telemetry beyond interaction log
- Rate limiting of reports
- User identity/email collection

### Acceptance Criteria

- [ ] Given the user opens Settings, When they see the Feedback section, Then "Report a Bug" and "Request a Feature" buttons are visible
- [ ] Given the user taps "Report a Bug", When the feedback screen opens, Then type is pre-selected to "Bug Report"
- [ ] Given the user taps "Request a Feature", When the feedback screen opens, Then type is pre-selected to "Feature Request"
- [ ] Given the user fills title + description and taps "Submit to GitHub", When the browser opens, Then a pre-filled GitHub issue form appears with diagnostic info in the body
- [ ] Given the issue body would exceed URL limits, When generating the URL, Then the body is truncated with a "[truncated]" marker
- [ ] Given the user taps "Share Report" instead, When the share sheet opens, Then a JSON file with full diagnostic data is shared
- [ ] Given the app crashes and ErrorBoundary shows, When user taps "Report Crash", Then feedback screen opens with type=crash and error details pre-filled
- [ ] Given the user has navigated through 10+ screens, When a report is generated, Then only the last 10 interactions are included (FIFO)
- [ ] Given the user has 0 interactions logged, When a report is generated, Then the interactions section shows "No recent interactions"
- [ ] Given a bug report, When the GitHub issue is created, Then it has the `bug` label
- [ ] Given a feature request, When the GitHub issue is created, Then it has the `enhancement` label
- [ ] Given a crash report, When the GitHub issue is created, Then it has `bug` and `crash` labels
- [ ] Given the interaction logger is active, When the user navigates between screens, Then each navigation is logged with screen name
- [ ] Given interaction logging, When inserting the 11th interaction, Then the oldest is deleted (FIFO, max 10)
- [ ] Title field validates: required, max 100 chars
- [ ] Description field validates: required for bug/feature, optional for crash
- [ ] All new UI respects light/dark theme
- [ ] No hardcoded hex colors
- [ ] Touch targets >= 48dp
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] New tests cover: interaction FIFO logic, report generation, GitHub URL generation, URL truncation

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| GitHub URL exceeds length limit | Body truncated, "[truncated -- share full report for details]" appended |
| No internet connection | Browser/sharing still opens; user sees error from OS |
| No GitHub account | User can use "Share Report" fallback |
| Empty error log | Report includes empty errors array, diagnostic section shows "No errors recorded" |
| Empty interaction log | Report includes empty interactions array |
| Very long error stack trace | Each stack trace trimmed to first 3 lines |
| Special characters in title/description | Properly URL-encoded |
| User cancels feedback (back button) | No report submitted, no data lost |
| ErrorBoundary crash report | Feedback screen opened with crash type, error message pre-filled in description |
| Rapid navigation (10+ screens in seconds) | All logged, oldest pruned via FIFO |
| App killed before interactions persist | SQLite writes are synchronous enough for single-row inserts; acceptable loss |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| GitHub URL too long for complex reports | Medium | Low | Truncation logic with fallback to sharing |
| Users without GitHub cannot submit | Medium | Low | "Share Report" fallback via expo-sharing |
| Interaction logging impacts performance | Low | Medium | Fire-and-forget inserts, no await in UI path, FIFO cap at 10 |
| ErrorBoundary cannot navigate to feedback (React tree is broken) | Medium | Medium | ErrorBoundary keeps its own "Share" button as fallback; feedback screen is only used if React tree is recoverable |
| URL encoding edge cases | Low | Low | Use `encodeURIComponent` on each field |

### Dependencies
- `expo-linking` (already in Expo — no new dependency)
- `expo-sharing` (already installed)
- `expo-file-system` (already installed)
- No new third-party dependencies required

## Review Feedback

### Quality Director (UX Critique)

**Verdict: NEEDS REVISION** — 2026-04-14

#### Critical Issues (must fix)
1. **PRIVACY-01**: No diagnostic data consent mechanism. Auto-attaching interaction history (screen visits, exercises viewed) without opt-out is a privacy concern for a fitness/body-tracking app. Required: show data summary, add opt-out toggle, expand diagnostic info by default.
2. **UX-LABEL-01**: "Submit to GitHub" button is misleading — the actual flow opens a browser with a pre-filled form. Rename to "Open on GitHub" or "Create GitHub Issue".
3. **ERRBOUND-01**: ErrorBoundary should NOT navigate to feedback screen during a crash (React tree may be broken). Use `Linking.openURL()` directly from ErrorBoundary for GitHub reporting. Keep existing share as primary fallback.

#### Major Issues (should fix)
4. **A11Y-SPEC-01**: Missing accessibility specifications — no accessibilityLabel/Role specs for type selector, diagnostic info section, character count, or submission buttons. Add an Accessibility Requirements section.
5. **OFFLINE-01**: No connectivity check before opening GitHub URL. If offline, browser shows cryptic error. Check connectivity and suggest Share fallback.
6. **DEBOUNCE-01**: No submission debounce — user can spam-create duplicate GitHub issues. Add 5-second cooldown.
7. **TRUNCATE-01**: URL truncation priority not specified. Order: error stacks → interactions → description (user content last).
8. **SHARE-FORMAT-01**: Share Report produces raw JSON only. Add human-readable text summary alongside JSON.

#### Minor / Recommendations
- Consider 150-char title limit (bug titles tend to be descriptive)
- Lock report type when pre-filled from ErrorBoundary crash
- Add empty state for diagnostic info when both logs are empty
- Wrap FIFO insert+delete in transaction for race condition safety

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
