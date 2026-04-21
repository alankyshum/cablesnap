# CableSnap Knowledge Base

Last updated: 2026-04-21
Total learnings: 211

## How to Use This Knowledge Base

Before starting work on a task, search this index for relevant learnings:
1. Check the category that matches your task type
2. Read the pitfalls section for your technology stack
3. Review recent decisions for architectural context
4. Search by tags if looking for something specific

## Categories

### Patterns
- [React Native + Expo](patterns/react-native.md) — 110 learnings
- [Testing](patterns/testing.md) — 16 learnings

### Pitfalls
- [Dependencies](pitfalls/dependencies.md) — 8 learnings
- [Build Configuration](pitfalls/build-config.md) — 15 learnings
- [Theming](pitfalls/theming.md) — 6 learnings
- [SQL Queries](pitfalls/sql-queries.md) — 23 learnings
- [Type Safety](pitfalls/type-safety.md) — 5 learnings

### Process
- [Quality Pipeline](process/quality-pipeline.md) — 14 learnings
- [PR Workflow](process/pr-workflow.md) — 4 learnings

### Decisions
- [Architecture](decisions/architecture.md) — 9 learnings

### Debugging
- [Common Errors](debugging/common-errors.md) — 2 learnings

## Recent Learnings

| Date | Source | Title | Category | File |
|------|--------|-------|----------|------|
| 2026-04-21 | BLD-466 | Expo Router Route Params Cannot Transport Large Data Payloads | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-21 | BLD-465 | Validate All Interpolated SQL Identifiers — Not Just Table Names | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-20 | BLD-460 | Multi-Signal Analytics Feature Architecture — Pure Module + loadHomeData Integration | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-460 | Create Dedicated DB Queries for New Analytics — Do Not Repurpose Existing Ones | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-20 | BLD-460 | ErrorBoundary Around Replacement UI Components to Prevent Stable Feature Regression | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-459 | Define Minimum Data Sufficiency Thresholds Per Signal in Multi-Signal Analytics | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-20 | BLD-457 | test.each Reduces Source-Level Budget Without Losing Runtime Coverage | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-20 | BLD-457 | Test Infrastructure Changes Are Self-Masking — Require External Coverage Verification | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-20 | BLD-456 | Widen Batch DB Query and Pre-Filter at Consumer for Feature Addition | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-456 | Validate Plan Heuristic Inputs Against Actual Codebase Data Model | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-20 | BLD-454 | Render-Prop Components Cannot Be String-Mocked in Jest | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-20 | BLD-454 | Sub-Module Imports Bypass Barrel Export Mocks | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-20 | BLD-454 | UI Elements Moved to Navigation Layout Are Invisible to Component Tests | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-20 | BLD-453 | Remove getItemLayout When Adding ListHeaderComponent to FlatList | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-447 | Nested Pressable Components Create Gesture Conflicts on Native — Extract as Siblings | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-447 | Bodyweight Exercises Must Use weight=null Not weight=0 | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-436 | SQLite Has No Native MEDIAN() — Use Two-Step SQL+JS Pattern | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-20 | BLD-436 | Wrap Non-Critical Promise.all Members with Individual .catch() Fallbacks | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-433 | Wire State Transition Triggers — CRUD + UI Is Not a Complete Feature | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-432 | Use Bottom Sheets for User Input in FlatList Headers to Avoid Scroll Jumps | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-432 | Prefer React Query Computation Over Denormalized SQLite Cache Columns | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-20 | BLD-431 | Partial<Record> Override Pattern for Per-Entity Customizable Defaults | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-418 | Fixed-Width Label Containers Truncate on Varying Screen Sizes | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-426 | FlatList Virtualization Breaks findByText in Tests — Mock VirtualizedList Defaults | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-20 | BLD-420 | Epley e1RM Formula Requires Rep Cap at 12 in SQL Aggregation | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-20 | BLD-419 | Audit All Instances When Fixing a Root Cause Pattern | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-20 | BLD-413, BLD-419 | FlashList v2 Renders Empty on Foldable Devices and Inside Modals | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-413 | Bottom Sheet Keyboard Avoidance Must Clamp to MAX_TRANSLATE_Y | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-20 | BLD-411 | Lazy Auto-Assignment for New Ordering Columns with DEFAULT 0 | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-20 | BLD-410 | Do Not Repurpose Intra-Entity Ordering Columns for Inter-Entity Position | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-20 | BLD-410 | FlashList Requires extraData Counter to Re-Render on Array Reorder | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-403 | Proactive Sweep Task to Silence Recurring Automated Reviewer Findings | Process | [pr-workflow.md](process/pr-workflow.md) |
| 2026-04-19 | BLD-402 | Consolidate Single-Assertion it() Blocks to Free Test Budget Slots | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-19 | BLD-402 | Track fetchedId in useReducer to Prevent Stale Data on Rapid Prop Changes | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-400 | Event-Driven Side Effects Over Reactive useEffect for Action-Triggered Features | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-400 | Non-Blocking try/catch for Optional Delight Features | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-400 | cancelAnimation on Every Shared Value in useEffect Cleanup | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-398 | solve() Is Plate Decomposition Not Rounding — Use roundToPlates() Wrapper | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-396 | Settings UI Must Be Wired End-to-End — Don't Ship Cosmetic Toggles | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-389 | JSON Snapshot Dirty-Check for Auto-Save Forms | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-384 | Audit Existing Screen Elements for Information Overlap Before Adding New UI Components | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-19 | BLD-384 | Verify Data Query Availability Claims Against Actual Code Before Plan Approval | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-19 | BLD-385 | Detect Dark Mode via useColorScheme — Never Compare Background Hex Strings | Pitfalls | [theming.md](pitfalls/theming.md) |
| 2026-04-19 | BLD-344 | React Native Crashes on Bare Numeric Children Outside Text | Pitfalls | [type-safety.md](pitfalls/type-safety.md) |
| 2026-04-19 | BLD-376 | Absolute Timestamps for Mobile Timers — Not Cumulative setInterval | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-376 | Persistence Write Without Restore Path Is Incomplete Crash Recovery | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-376 | Idempotent ALTER TABLE ADD COLUMN via PRAGMA table_info Guard | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-19 | BLD-369 | Mock-Based DB Tests Cannot Gate Query Refactoring | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-19 | BLD-369 | ORM Schema File Alongside Migration File Is a Dual Source of Truth | Pitfalls | [type-safety.md](pitfalls/type-safety.md) |
| 2026-04-19 | BLD-370 | Schema-Only ORM Adoption — Types Before Queries | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-19 | BLD-370 | Drizzle $inferSelect Does Not Cover JOIN Results or Union-Narrowed Types | Pitfalls | [type-safety.md](pitfalls/type-safety.md) |
| 2026-04-19 | BLD-366 | Add Independent Data Fetches to Existing Promise.all Batches | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-367 | Mutation Version Tracking for Direct-DB-Write Apps Using React Query | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-368 | Timer-Ticking Screens Amplify FlashList Inline Function Costs | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-363 | SQLite Bare Columns in GROUP BY Produce Non-Deterministic Batch Results | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-19 | BLD-363 | Two-Step SQL + JS Pattern for Per-Group Top-N Batch Queries | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-365 | expo-image Requires Config Plugin Registration for Native Builds | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-365 | FlashList v2 Auto-Measures Items — estimatedItemSize Prop Removed | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-351 | Use Blue/Yellow/Red Instead of Green/Yellow/Red for Status Heatmaps | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-351 | full_body Exercises Break Per-Muscle-Group Analysis — Filter Them Out | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-19 | BLD-348 | Add Callback Props to Replace router.push When Embedding Screen Components in Sheets | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-348 | Bottom Sheet Mutual Exclusion — Close Before Open | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-379 | React Compiler: Ref Writes During Render Are Real Bugs | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-379 | React Compiler: Hoist Impure Calls Out of Render Loops | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-379 | React Compiler: Extract Optional Chaining from useMemo Deps | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-381 | Scheduled Notification Lifecycle: Cancel from Every Exit Path | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-19 | BLD-379 | Automated Reviewer Scans Entire Repo, Not PR Diff | Process | [pr-workflow.md](process/pr-workflow.md) |
| 2026-04-19 | BLD-346 | Swipe Gestures Need Relative Thresholds and Discoverability Hints | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-341 | expo-localization firstWeekday Is 1-Indexed — Not JS Convention | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-339 | Avoid Hidden Re-Queries in Composed Data-Layer Functions | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-335 | New Database Tables Require Five-Point Backup/Restore Integration | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-18 | BLD-334 | moduleNameMapper Enforces __mocks__/ Directory Mock Resolution for Reanimated | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-18 | BLD-334 | Snapshot Composite Entity Before Cascade Delete for Undo Restoration | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-332 | Extract Heavy Constant Data into Companion Data Files | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-322 | Barrel Re-Export for Non-Breaking Module Splits | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-322 | CableSnap DB Migrations Live in lib/db/migrations.ts (UPDATE) | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-18 | BLD-318 | Decompose Large Components via Domain-Specific Hook Extraction | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-318 | Route Elimination via Query Params for Mode-Switching UI | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-318 | Use queueMicrotask for Deferred State Updates Inside useEffect | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-326 | Pre-Push Hooks Do Not Run tsc — File Deletions Bypass Import Validation | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-18 | BLD-314 | Library Migration Must Audit Behavioral Contracts, Not Just Visual Rendering | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-314 | Vendored UI Components Expand Reanimated Mock Surface Area | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-18 | BLD-313 | BNA UI Card style Prop Requires StyleSheet.flatten — No Array Support | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-313 | BNA UI Component Gaps — DataTable, List.Item, Card.onPress Require Manual Replacements | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-18 | BLD-307 | Serializing Concurrent Countdown-Undo Actions to Prevent UI/DB Desync | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-302 | SDK Status Check Must Precede Initialization — Init Failure Masks Availability State | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-17 | BLD-301 | Health Connect SDK Requires Four Setup Steps Beyond the NPM Package | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-301 | Android SDK Feature Availability Is a Four-State Machine — UX Must Branch on All States | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-300 | Expo/React Native Cannot Target Wear OS — Wearable Features Require Separate Native Codebase | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-17 | BLD-299 | Dynamic import() for Native-Only Module Isolation in Cross-Platform Apps | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-298 | CableSnap DB Migrations Live in lib/db/helpers.ts, Not a Separate Schema File | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-17 | BLD-298 | expo-secure-store and expo-auth-session Are Native-Only — Platform-Gate OAuth Features | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-17 | BLD-298 | Persistent SQLite Queue for Fire-and-Forget External API Sync | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-17 | BLD-295 | FlashList renderItem Must Return Single View Root — Not Fragment | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-296 | JSON Settings Field Migration Requires Centralized Transform at ALL Read Sites | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-290 | FlashList Inline ListHeaderComponent Causes Keyboard Dismiss | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-287 | Expo Managed Workflow Cannot Access Native Platform Logs | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-17 | BLD-287 | DB-Backed Diagnostic Logs Need Count-Based Not Time-Based Pruning | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-17 | BLD-276 | Guard console.warn and console.log with __DEV__ in React Native | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-17 | BLD-277 | Null-Initial State for Smart Defaults Without Overriding User Intent | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-272 | Defense-in-Depth Error Isolation for Composite Screens | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-270 | Unused DB Functions Accumulate Silent Bugs — Audit Before Wiring Up | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-17 | BLD-268 | Boolean-to-Enum Migration via Dual-Write and Partition Alignment | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-17 | BLD-266 | Boolean Filter Column on Core Table Requires Exhaustive Aggregation Query Audit | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-17 | BLD-265 | Extensible Session Population via URL Params | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-265 | LEFT JOIN to Detect Deleted Referenced Entities Before Loading | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-17 | BLD-260 | Feature Plans Must Include an Existing Code Inventory to Prevent Scope Duplication | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-17 | BLD-254 | React Native Easing and Reanimated Easing Are Not Interchangeable | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-17 | BLD-252 | Conditionally-Rendered Overlays Must Reset Internal State on Reopen | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-248 | Dedup Record Reuse Must Apply All User-Requested Mutations | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-17 | BLD-247 | External API Integration Plans Require Three Data Integrity Specifications | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-16 | BLD-241 | Mutation Features Require "Before State" Columns When History Views Exist | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-240 | Session Mutations Must Preserve Completed Records as Immutable | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-236/237 | Design Token Drift Extends Beyond Colors — Seven Categories Need Tokenization | Pitfalls | [theming.md](pitfalls/theming.md) |
| 2026-04-16 | BLD-234 | Alert.prompt Is iOS-Only — Use Cross-Platform Modal for Text Input Dialogs | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-16 | BLD-234 | Bump Export Format Version When Adding Columns — Track Future-Version Guard | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-16 | BLD-198/212 | Source-Level Structural Tests for Design System Compliance | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-16 | BLD-203 | Flex Text Overflow: minWidth: 0 and Conditional flexBasis for Responsive Wrapping | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-195 | Playwright Worker Isolation Breaks Module-Level State Aggregation | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-16 | BLD-183 | Debounced Save Must Clear Timer on Unmount and Guard Async State | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-200/202 | Adding Module Exports Breaks Partial jest.mock() Declarations | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-16 | BLD-200/202 | Use @gorhom/bottom-sheet Instead of Modal for Expandable Drawers | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-205 | Absolute-Positioned Bars Need Exported Height Constants | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-205 | Android overflow: visible Does Not Propagate Touches | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-16 | BLD-205 | Android Elevation Clips to Parent View Bounds | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-16 | BLD-182 | COUNT(*) Overcounts When Joining Tables with Duplicate Dimension Values | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-16 | BLD-182 | Conditional Algorithm Specs Require Branch-by-Branch Verification | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-17 | BLD-174/187/255 | Seed Data Repair Must Cover the Entire Entity Graph | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-16 | BLD-186/187 | Canonical Constants as UI Fallback for DB-Sourced Display Data | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-16 | BLD-179 | GitHub Actions Release Notes with Markdown Break GITHUB_OUTPUT Heredoc | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-16 | BLD-179 | Expo Kotlin NoSuchMethodError on Newer Android = SDK Version Too Old | Debugging | [common-errors.md](debugging/common-errors.md) |
| 2026-04-16 | BLD-181 | Four Plan Specification Gaps That Block Approval | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-16 | BLD-174 | INSERT OR IGNORE Cannot Repair Corrupted Existing Rows | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-16 | BLD-174 | Import/Export Must Include All Semantic Columns | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-15 | BLD-149 | Expo SDK Major Upgrades Require Config and Mock Fixups Beyond Version Bumps | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-15 | BLD-55 | Use Real Domain Data in Acceptance Tests — Only Mock Infrastructure | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-15 | BLD-136 | Expo Go Cannot Load Custom Native Modules — Migrate to expo-dev-client First | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-15 | BLD-44/52/53/57 | Rebase on Main Before PR When Parallel Branches Are In Flight | Process | [pr-workflow.md](process/pr-workflow.md) |
| 2026-04-15 | BLD-137 | Retroactive Feature Evaluation with Silent-Earn UX | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-137 | accessibilityRole="button" on Non-Interactive Elements | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-15 | BLD-120 | Cascading Multi-Pass Entity Matching for Data Import | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-129 | Use Tilde Ranges for Expo SDK Packages | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-15 | BLD-123 | Directory Route Grouping for Multi-Screen Feature Areas | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-123 | Filesystem + SQLite Hybrid for User Media Management | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-120 | Deterministic Multi-Pass Name Matching for Data Import | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-25/26 | Silent Calculation Bugs Require Reference-Value Unit Tests | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-15 | BLD-27 | Product Pivots Cascade Through Data Models | Decisions | [architecture.md](decisions/architecture.md) |
| 2026-04-15 | BLD-63 | Proactive Interaction History for Crash Diagnostics | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-97/107 | Pure Calculation Module Pattern for Domain Logic | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-72 | Verify All Output Formats in Multi-Format Share/Export | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-15 | BLD-114 | accessibilityState for Collapsible Section Toggles | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-114 | RN accessibilityRole Does Not Support 'grid' — Use 'summary' | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-100/108 | upload-pages-artifact path Becomes Site Root — Not a URL Prefix | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-15 | BLD-112 | Double-Cast Through `unknown` for Unrelated Type Assertions | Pitfalls | [type-safety.md](pitfalls/type-safety.md) |
| 2026-04-15 | BLD-112 | `Array.includes()` Fails on Readonly Tuple Types | Pitfalls | [type-safety.md](pitfalls/type-safety.md) |
| 2026-04-15 | BLD-99 | Separate Additive Seed Data into Dedicated Module Files | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-15 | BLD-95/96 | Expo Router Directory Routes Register as `directory/index` | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-15 | BLD-95/96 | Static Route-Name Validation Test for Expo Router | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-14 | BLD-90 | Lazy-Load Audio with replayAsync for Repeated Sound Effects | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-88 | Pure State Machine Guard Clauses Create Silent UI Failures | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-84 | Integer Arithmetic for Precise Decimal Calculations | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-23 | Animated.Value with useRef for Non-Interactive Transient Animations | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-23 | hitSlop for Invisible Touch Target Expansion | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-82 | Manual Row Mapping Silently Drops New SQLite Columns | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-14 | BLD-79/80 | Bounded Query Results Produce Wrong Aggregates When Re-Filtered Client-Side | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-14 | BLD-75 | Pin react-test-renderer to Match Expo SDK's React Version | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-14 | BLD-75/76 | Mock expo-router with useFocusEffect-as-useEffect for Flow Tests | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-14 | BLD-70 | Progressive Content Truncation for URL-Length-Limited Payloads | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-69 | Use Inner Pressable Instead of Card onPress When Card Contains Interactive Children (Web) | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-62 | Use FlatList with keyExtractor — Never ScrollView + .map() for Dynamic Lists | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-62 | Set accessibilityViewIsModal on Overlay Pickers and Custom Modals | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-65 | Pair Color with a Secondary Visual Channel for Category Distinction | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-35 | Splash Screen Gate + Redirect for Conditional First-Launch Flow | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-32 | Version-Based Seed Data Evolution with app_settings Table | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-32 | Deep-Copy Entities with Internal Grouping References (link_id Remapping) | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-30 | Seed Data Pivot via Soft-Delete + Idempotent Re-Seed | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-30 | Map Custom User Data When Restructuring Category Enums | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-13 | BLD-28 | Use Middleware for COOP/COEP Headers — Static Server Config Is Unreliable | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-13 | BLD-28 | Platform-Aware Graceful Degradation for expo-sqlite Web | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-15 | Bundle Static Reference Data as JSON for Read-Only Datasets | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-15 | Set keyboardShouldPersistTaps on FlatList with Embedded TextInputs | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-24 | Reset Module Singletons with jest.resetModules() + jest.doMock() | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-13 | BLD-24/25/26 | Bootstrap React Native Tests with jest-expo and transformIgnorePatterns | Patterns | [testing.md](patterns/testing.md) |
| 2026-04-13 | BLD-8 | Expo Router: New Screen Files Require Explicit Stack.Screen Registration | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-13 | BLD-8 | Documented Pitfalls Still Recur — Agents Must Read Learnings Before Implementation | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-13 | BLD-20 | Numeric Map Keys Collide Across Unit Systems — Use Unit-Qualified Keys | Pitfalls | [theming.md](pitfalls/theming.md) |
| 2026-04-13 | BLD-21 | MD3 Container Tokens Need Separate Light/Dark Values for WCAG Contrast | Pitfalls | [theming.md](pitfalls/theming.md) |
| 2026-04-13 | BLD-2 | Use Refs for Non-Rendering State Inside useFocusEffect | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-21 | Per-Value Contrast Colors for Semantic Badges | Pitfalls | [theming.md](pitfalls/theming.md) |
| 2026-04-13 | BLD-3 | Async Singleton Initialization Requires a Promise Mutex | Debugging | [common-errors.md](debugging/common-errors.md) |
| 2026-04-13 | BLD-6 | PRAGMA table_info Guard for SQLite Column Migrations | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-6 | Enforce Group Minimum-Membership Invariant at Every Deletion Path | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-13 | BLD-14 | Buffer Text Inputs — Save on Blur, Not on Keystroke | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-1 | Derive Shared Display Flags Before Rendering Concurrent Async Results | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-1 | Nested Subquery for "Last N in Chronological Order" in SQLite | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-7 | Wrap Multi-Step State Machine Mutations in Transactions | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-7 | Validate Persisted Entity References Before Use | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-13 | BLD-5 | COALESCE with Zero Default Creates False Positives in Comparison Queries | Pitfalls | [sql-queries.md](pitfalls/sql-queries.md) |
| 2026-04-13 | BLD-3 | Use useFocusEffect for Data Refresh on List Screens | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-3 | Soft-Delete Requires LEFT JOIN Audit on All Existing Queries | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-16 | Single-Fetch + Client-Side Derivation for Bounded Datasets | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-17 | Store Measurements in Canonical Units | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-21 | Semantic Color Constants for Domain-Specific Theming | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-21 | Embed Accessibility in Every Feature Spec | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-12 | BLD-19 | ErrorBoundary Must Wrap Outside Context Providers | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-13 | BLD-11, BLD-22 | Always Use try/catch/finally for Async Loading State | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-12 | BLD-8 | GitHub PAT Requires `workflow` Scope for CI Files | Process | [pr-workflow.md](process/pr-workflow.md) |
| 2026-04-12 | BLD-9, BLD-13 | Never Hardcode Hex Colors — Use Theme Tokens | Pitfalls | [theming.md](pitfalls/theming.md) |
| 2026-04-12 | BLD-12, BLD-14 | legacy-peer-deps Masks Missing Peer Dependencies | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-12 | BLD-13 | Use expo-document-picker for File Selection | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-12 | BLD-14 | Metro Bundler Requires Explicit WASM Extension | Pitfalls | [build-config.md](pitfalls/build-config.md) |
| 2026-04-12 | BLD-10, BLD-12, BLD-14 | Never Trust PR Self-Verification | Process | [quality-pipeline.md](process/quality-pipeline.md) |
| 2026-04-12 | BLD-13 | Wrap Bulk SQLite Inserts in withTransactionAsync | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-12 | BLD-13 | Never Execute Side Effects Inside setState Updaters | Patterns | [react-native.md](patterns/react-native.md) |
| 2026-04-14 | BLD-93 | expo-notifications Requires Explicit expo-modules-core | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
| 2026-04-14 | BLD-93 | qa-cablesnap CODE-02 False Positive with sub.remove() | Pitfalls | [dependencies.md](pitfalls/dependencies.md) |
