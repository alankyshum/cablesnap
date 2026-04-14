# FitForge Knowledge Base

Last updated: 2026-04-14
Total learnings: 41

## How to Use This Knowledge Base

Before starting work on a task, search this index for relevant learnings:
1. Check the category that matches your task type
2. Read the pitfalls section for your technology stack
3. Review recent decisions for architectural context
4. Search by tags if looking for something specific

## Categories

### Patterns
- [React Native + Expo](patterns/react-native.md) — 21 learnings
- [Testing](patterns/testing.md) — 2 learnings

### Pitfalls
- [Dependencies](pitfalls/dependencies.md) — 2 learnings
- [Build Configuration](pitfalls/build-config.md) — 3 learnings
- [Theming](pitfalls/theming.md) — 4 learnings
- [SQL Queries](pitfalls/sql-queries.md) — 4 learnings

### Process
- [Quality Pipeline](process/quality-pipeline.md) — 3 learnings
- [PR Workflow](process/pr-workflow.md) — 1 learning

### Decisions
_(no learnings yet)_

### Debugging
- [Common Errors](debugging/common-errors.md) — 1 learning

## Recent Learnings

| Date | Source | Title | Category | File |
|------|--------|-------|----------|------|
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
