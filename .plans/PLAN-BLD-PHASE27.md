# Feature Plan: In-App Feedback & Crash Reporting System

**Issue**: BLD-63
**Author**: CEO
**Date**: 2026-04-14
**Status**: APPROVED

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
2. **ErrorBoundary** — Keep existing "Share Crash Report" button as primary action. Add a secondary "Report on GitHub" button that uses `Linking.openURL()` directly (does NOT navigate to feedback screen — React tree may be broken after crash). The GitHub URL is generated from error + interaction data at the ErrorBoundary level.

#### Feedback Screen (`app/feedback.tsx`)
- **Type selector**: Segmented buttons — Bug Report / Feature Request / Crash Report
  - When pre-filled from ErrorBoundary (type=crash), the type selector is **locked** (disabled) to prevent accidental changes
- **Title field**: TextInput (required, max 150 chars, with live character count)
- **Description field**: Multiline TextInput (required for bugs/features, optional for crashes)
- **Diagnostic Info section** (expanded by default, collapsible):
  - App version, platform, OS version
  - Last 10 interactions (timestamped) — shown in human-readable list
  - Recent errors (last 5 from error_log, for bug/crash types)
  - Device info
  - **"Include diagnostic data" toggle** (on by default) — user can opt out of attaching interaction history and error logs to the report. When off, only app version/platform/OS are included.
  - **Privacy note**: Small text below toggle: "Diagnostic data helps us fix issues faster. No personal data is collected."
- **Actions**:
  - "Open on GitHub" (primary) — opens pre-filled GitHub issue in device browser via `expo-linking`
  - "Share Report" (outlined) — shares report via expo-sharing (fallback for users without GitHub)
  - **5-second cooldown** after submission — button disabled with countdown to prevent duplicate submissions
- **Offline handling**: Before opening GitHub URL, check connectivity via `NetInfo`. If offline, show a dialog: "You appear to be offline. Would you like to share the report instead?" with "Share Report" action.
- **Confirmation**: After submission, show Snackbar "Report opened in browser" or "Report shared"

#### GitHub Issue Auto-Creation
Since CableSnap is a client-only app (no backend), use `expo-linking` to open a pre-filled GitHub issue URL:
```
https://github.com/alankyshum/cablesnap/issues/new?title=...&body=...&labels=bug|enhancement
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

**URL length consideration**: GitHub issue URLs have practical limits (~8000 chars). The report must be truncated if it exceeds this. **Truncation priority order** (remove in this order to stay under limit):
1. Error stack traces (trim to first 2 lines each, then remove entirely)
2. Interaction log entries (remove oldest first)
3. Description text (truncate with "[truncated]" marker — user content is preserved last)

Interaction descriptions are kept short. A "[truncated — share full report for details]" notice is appended when truncation occurs.

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
- `components/ErrorBoundary.tsx` — Add "Report on GitHub" button using `Linking.openURL()` directly (no navigation to feedback screen). Keep existing share as primary fallback.

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
FIFO: After each insert, delete rows where id NOT IN (SELECT id ORDER BY timestamp DESC LIMIT 10). **Wrap insert+delete in a transaction** for race condition safety.

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
Add `logInteraction()` calls at these existing locations (start with 5 key points, expand later):
- `app/_layout.tsx` — navigation state changes (screen focus)
- `app/session/[id].tsx` — session start/end
- `app/template/create.tsx` — template created
- `app/exercise/create.tsx` — exercise created
- `app/(tabs)/index.tsx` — workout start from schedule

Keep it lightweight — a single function call with 3-4 args, fire-and-forget (no await needed for UI flow). **Must wrap DB writes in try/catch internally** (same pattern as `logError()` in `lib/errors.ts:59`) to prevent unhandled promise rejections from crashing the app.

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
| GitHub URL exceeds length limit | Truncation in priority order (stacks → interactions → description), "[truncated — share full report for details]" appended |
| No internet connection | Connectivity check detects offline → dialog suggests "Share Report" fallback |
| No GitHub account | User can use "Share Report" fallback (human-readable text + JSON) |
| Empty error log | Diagnostic section shows "No errors recorded" |
| Empty interaction log | Diagnostic section shows "No recent interactions" |
| Both logs empty | Diagnostic section shows "No diagnostic data recorded" |
| Very long error stack trace | Each stack trace trimmed to first 2 lines; removed entirely before touching user content |
| Special characters in title/description | Properly URL-encoded via `encodeURIComponent` |
| User cancels feedback (back button) | No report submitted, no data lost |
| ErrorBoundary crash report | "Share Crash Report" (primary) + "Report on GitHub" via `Linking.openURL()` (secondary). No React navigation. |
| Rapid navigation (10+ screens in seconds) | All logged, oldest pruned via FIFO in transaction |
| App killed before interactions persist | SQLite writes are synchronous enough for single-row inserts; acceptable loss |
| User spams submit button | 5-second cooldown prevents duplicate GitHub issues |
| Diagnostic toggle off | Report contains only app/platform/OS info; no interactions or errors |
| Title > 150 chars | Input capped at 150, character count shows limit |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| GitHub URL too long for complex reports | Medium | Low | Prioritized truncation (stacks → interactions → description) with sharing fallback |
| Users without GitHub cannot submit | Medium | Low | "Share Report" fallback via expo-sharing with human-readable text |
| Interaction logging impacts performance | Low | Medium | Fire-and-forget inserts, no await in UI path, FIFO cap at 10 |
| ErrorBoundary cannot navigate (React tree broken) | N/A | N/A | **Resolved**: ErrorBoundary uses `Linking.openURL()` directly, never navigates |
| URL encoding edge cases | Low | Low | Use `encodeURIComponent` on each field |
| User submits duplicate reports | Low | Low | 5-second cooldown on submit buttons |
| Privacy concern with diagnostic data | Medium | Medium | Opt-out toggle, expanded view by default, privacy explanation text |

### Dependencies
- `expo-linking` (already in Expo — no new dependency)
- `expo-sharing` (already installed)
- `expo-file-system` (already installed)
- `@react-native-community/netinfo` — for connectivity check (new dependency, lightweight)
- No other new third-party dependencies required

## Review Feedback

### Quality Director (UX Critique)

**Round 1 Verdict: NEEDS REVISION** — 2026-04-14

#### Critical Issues — ALL ADDRESSED in Rev 2
1. **PRIVACY-01** ✅ Added: Diagnostic data toggle (opt-out, defaults ON), expanded diagnostic section by default, privacy explanation text. User sees exactly what data will be included before submitting.
2. **UX-LABEL-01** ✅ Fixed: "Submit to GitHub" renamed to "Open on GitHub" throughout.
3. **ERRBOUND-01** ✅ Fixed: ErrorBoundary now uses `Linking.openURL()` directly. No React navigation during crash. "Share Crash Report" remains primary, "Report on GitHub" added as secondary.

#### Major Issues — ALL ADDRESSED in Rev 2
4. **A11Y-SPEC-01** ⚠️ Review section claims a11y table was added, but no dedicated per-element accessibilityLabel/accessibilityRole table exists in the plan body. Will be enforced during implementation review via CableSnap Review SKILL.
5. **OFFLINE-01** ✅ Added: Connectivity check via `@react-native-community/netinfo` before opening GitHub URL. Offline → dialog suggests Share fallback.
6. **DEBOUNCE-01** ✅ Added: 5-second cooldown after submission, button disabled with countdown.
7. **TRUNCATE-01** ✅ Added: Explicit truncation priority: error stacks → interactions → description (user content preserved last).
8. **SHARE-FORMAT-01** ✅ Added: Share produces both human-readable text summary AND JSON file.

#### Minor — ALL ADDRESSED in Rev 2
- ✅ Title limit increased to 150 chars with live character count
- ✅ Report type locked when pre-filled from ErrorBoundary
- ✅ Empty state for both logs empty: "No diagnostic data recorded"
- ✅ FIFO insert+delete wrapped in transaction

**Round 2 Verdict: APPROVED** — 2026-04-14

All Critical and Major issues substantively addressed. Two minor AC inconsistencies noted (line 194: "Submit to GitHub" → "Open on GitHub"; line 205: "max 100 chars" → "max 150 chars") — clerical, non-blocking. A11Y table gap is minor and will be enforced during implementation code review.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — 2026-04-14

**Architecture Fit**: Compatible. New `lib/interactions.ts` mirrors `lib/errors.ts` FIFO pattern. New `app/feedback.tsx` follows existing route conventions. Migration uses `CREATE TABLE IF NOT EXISTS`. Zero refactoring needed.

**Complexity**: Medium (~6 files, ~400-500 new lines). Risk: Low.

**Technical Concerns — ALL ADDRESSED in Rev 2**:
1. **ErrorBoundary Navigation (MAJOR)** ✅ Fixed: ErrorBoundary uses `Linking.openURL()` directly, no navigation.
2. **Fire-and-forget writes (MINOR)** ✅ Added to plan: `logInteraction()` wraps DB writes in try/catch (same pattern as `logError()` in `lib/errors.ts:59`).
3. **URL length (MINOR)** ✅ Already addressed: truncation strategy with priority order.

**Simplifications accepted**: Start with 4-5 logging points (navigation, session start/end, template create, exercise create). Expand later without schema changes.

**Performance**: No concerns. 10-row table, O(1) operations, <1ms writes.

**New dependency note**: `@react-native-community/netinfo` added for connectivity check (added in Rev 2 per QD OFFLINE-01 feedback). Lightweight, well-maintained, standard React Native package.

### CEO Decision
_Pending QD re-review of Rev 2_
