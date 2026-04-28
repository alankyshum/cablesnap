# CableSnap — Project Instructions

## License — AGPL-3.0 (MANDATORY)

CableSnap is licensed under **AGPL-3.0-or-later**. All agents MUST comply:

1. **Never add dependencies with AGPL-incompatible licenses.** Blocklisted licenses: proprietary, SSPL, Commons Clause, any "non-commercial only" license, CC-BY-NC, BSL (before conversion date). Check with `npm info <pkg> license` before adding.
2. **Allowed licenses:** MIT, BSD-2-Clause, BSD-3-Clause, ISC, Apache-2.0, 0BSD, Unlicense, CC0-1.0, WTFPL, LGPL-2.1, LGPL-3.0, GPL-2.0, GPL-3.0, AGPL-3.0, MPL-2.0.
3. **Never modify or replace the LICENSE file.** The LICENSE file is immutable. Any PR that alters it must be rejected.
4. **Never add code that removes or obscures the license notice.**
5. **Run `scripts/check-license.sh`** before adding any new dependency. The pre-push hook enforces this automatically.
6. **Trademark:** "CableSnap" name and branding belong to Persoack. Do not add code that strips or replaces license/trademark notices.

## Tech Stack
- **Framework:** Expo (React Native) with Expo Router
- **Language:** TypeScript
- **State:** TanStack React Query
- **Database:** expo-sqlite + Drizzle ORM (`drizzle-orm/expo-sqlite`)
- **Styling:** React Native StyleSheet
- **Testing:** Jest (unit), Playwright (e2e), Maestro (mobile e2e)

## Concurrent-Agent Safety (MANDATORY for parallel work)

`/projects/cablesnap` is a single shared filesystem mount across agent
containers. When two agents work in parallel, `git checkout` on one yanks
the working tree out from under the other — silently — and corrupts any
untracked artefacts (image gen output, build outputs, snapshots, dev-server
state). See `.learnings/INDEX.md` → "Concurrent-Agent Safety" and BLD-765.

**Rule:** Use a per-branch git worktree whenever the work
- generates untracked artefacts (image gen, builds, snapshots), OR
- requires a stable branch checkout while another CableSnap agent might be active.

When in doubt, use a worktree. The cost is sub-second; the upside is no clobbered work.

```bash
# Start (idempotent — reuses if the worktree already exists)
eval "$(./scripts/agent-worktree.sh start bld-N-feature)"
cd "$AGENT_WORKTREE_DIR"

# ... do work, run tests, generate artefacts ...

# Stop at session end (refuses if dirty; pass --force to discard)
eval "$(./scripts/agent-worktree.sh stop bld-N-feature)"
```

Subcommands:
- `start <branch>` — create or reuse `/tmp/wt-<branch>`. Fetches from origin if missing.
- `stop <branch> [--force]` — remove worktree. No-op if missing. Refuses dirty without `--force`.
- `status [<branch>]` — show one or all worktrees.
- `list` — `git worktree list` shorthand.

Full doctrine: [`.agents/CONCURRENT-AGENT-SAFETY.md`](../.agents/CONCURRENT-AGENT-SAFETY.md).

## Dev Server (Human — port 8081)

**The user starts the dev server manually on port 8081. Do NOT auto-start it.**
**Agents: use the Expo Dev Server section below instead — each agent gets its own port.**

### Starting the server
```bash
# Option 1: use the dev-server script (auto-restarts on dep changes + hourly)
./scripts/dev-server.sh --port 8081

# Option 2: just start Expo directly
npx expo start --port 8081
```

### After adding/changing dependencies
```bash
npm install --no-audit --no-fund
# Then restart Expo — the dev-server.sh script does this automatically
# If running Expo directly, kill and restart:
npx expo start --port 8081 --clear
```

### Port
- Use **port 8081** (default Expo port; confirmed working with Expo Go)
- If 8081 is occupied, check with `lsof -ti :8081` and kill or use another port

### Testing on physical device (Expo Go)
- Device connects via local network: `exp://192.168.50.140:8081`
- The user tests on an Android phone (Samsung Z Fold6) via Expo Go
- macOS firewall is enabled — if Expo Go can't connect, the node binary may need to be allowed through the firewall

### Checking server status
```bash
# View logs
tail -f /tmp/cablesnap-dev.log

# Check if running
lsof -ti :8081

# Check Expo status
curl -s http://localhost:8081/status
# Should return: packager-status:running
```

### Stopping the server
```bash
# Kill the dev-server.sh wrapper (it cleans up Expo too)
kill $(lsof -ti :8081)
# Or find by script name
ps aux | grep dev-server | grep -v grep | awk '{print $2}' | xargs kill
```

## Expo Dev Server (Agent Sessions)

Each agent runs its own isolated Expo dev server to avoid cross-agent interference.
Port range: **8090–8099** (up to 10 parallel agents).

### Starting (run at session start)
```bash
eval "$(/skills/scripts/expo-dev.sh start)"
# Sets: EXPO_DEV_PORT, EXPO_DEV_PID, EXPO_DEV_LOCKFILE, EXPO_DEV_LOG
```

### Stopping (run at session end — MANDATORY)
```bash
eval "$(/skills/scripts/expo-dev.sh stop)"
```

### Status check
```bash
/skills/scripts/expo-dev.sh status
```

### Using expo-mcp with your dev server
After starting, invoke expo-mcp tools via CLI pointing at your port:
```bash
npx expo-mcp --root /projects/cablesnap --dev-server-url "http://localhost:$EXPO_DEV_PORT"
```

## Expo MCP Tools

Available tools (require dev server running — see above):

| Tool | Description |
|------|-------------|
| `expo_router_sitemap` | List all routes in the Expo Router app |
| `automation_take_screenshot` | Screenshot the full app or a specific view by `testID` |
| `automation_tap` | Tap by coordinates (x, y) or by `testID` |
| `automation_find_view` | Inspect view properties by `testID` — useful for verifying layout, padding, styles |
| `collect_app_logs` | Collect JS console logs, Android logcat, or iOS syslog |
| `open_devtools` | Open React Native DevTools |

### Inspecting UI issues (e.g. padding, layout)
1. Start your dev server: `eval "$(/skills/scripts/expo-dev.sh start)"`
2. Use `automation_take_screenshot` to capture what the user sees
3. Use `automation_find_view` with the element's `testID` to get computed view properties
4. Compare actual properties against expected values from the StyleSheet
5. Stop your dev server when done: `eval "$(/skills/scripts/expo-dev.sh stop)"`

**Important:** Components must have `testID` props for `find_view` and `tap` by testID to work. When building new components, always add meaningful `testID` props.

## Commands
- **Lint:** `npm run lint`
- **Typecheck:** `npm run typecheck`
- **Test:** `npm test`
- **Test (watch):** `npm run test:watch`
- **Test (coverage):** `npm run test:coverage`
- **Test (e2e):** `npm run test:e2e`
- **Test audit:** `./scripts/audit-tests.sh` (or `--detail` for mock overlap matrix)
- **Build APK:** `npm run build:apk`

## Expo Router — File Conventions

Files inside `app/` are treated as routes by Expo Router. Non-route files (helpers, hooks, sub-components, styles, data) **must** be prefixed with `_` to exclude them from routing.

- `app/_screen-config.ts` — config/data file (underscore prefix)
- `app/onboarding/_recommend-styles.ts` — shared styles (underscore prefix)
- `app/onboarding/_use-onboarding-finish.ts` — hook (underscore prefix)

Alternatively, move non-route code out of `app/` entirely (into `components/`, `lib/`, `hooks/`, `constants/`).

## React Native — Common Pitfalls

1. **Never use `flexWrap: 'wrap'` on FlatList/VirtualizedList `contentContainerStyle`** — React Native does not support it and will emit a warning. If you need a wrapping layout with `scrollEnabled={false}`, use `<View style={{ flexWrap: 'wrap' }}>` + `.map()` instead of FlatList.
2. **Function size limits** — ESLint enforces `max-lines-per-function: 200` and `complexity: 15`. Extract sub-components (e.g., `PreviewList`, `ResultList`) to keep screen components under these limits. This applies to both `app/` screens and test callbacks (`describe`/`it` blocks).

## Test Budget & Deduplication

The test suite has a **budget of 1800 test cases**. Before adding tests, agents MUST:

1. Run `./scripts/audit-tests.sh` to check the current count
2. If over budget, consolidate overlapping tests before adding new ones
3. When writing new tests, check for existing coverage of the same behavior in `flows/`, `acceptance/`, `app/`, and `components/` — do NOT duplicate
4. Use shared helpers from `__tests__/helpers/` for router mocks and domain mock factories
5. Prefer extending an existing test file over creating a new one for the same feature
6. Avoid source-string tests (`fs.readFileSync` + regex) when a behavioral test already covers the same assertion

## Database Layer — Drizzle ORM

All database code lives in `lib/db/`. The schema is defined in `lib/db/schema.ts` (single source of truth).

### Rules for new database code

1. **Use Drizzle ORM for all new CRUD operations** — `getDrizzle()` from `lib/db/helpers.ts`
2. **Never use raw SQL** (`query()`, `queryOne()`, `execute()`, `db.runAsync()`, `db.getAllAsync()`) for new code unless it falls into an approved exception (see below)
3. **Schema changes** — add new tables/columns to `lib/db/schema.ts` AND `lib/db/tables.ts` (runtime DDL)
4. **Transactions** — use `withTransactionAsync()` from helpers; Drizzle calls inside participate in the same transaction
5. **Type safety** — use inferred types from schema (`typeof table.$inferSelect`) instead of manual row types

### Approved raw SQL exceptions (only these patterns)

| Pattern | Why raw SQL | Examples |
|---------|-------------|---------|
| Correlated subqueries in SELECT columns | Drizzle can't reference outer aliases in SELECT subqueries | `getSessionsByMonth`, `getDaySessionDetails` |
| Dual derived-table JOINs | Would be entirely `sql``\` with zero type safety | `getSessionPRs`, `getE1RMTrends` |
| Prepared statement loops | Performance-critical bulk operations | `addSetsBatch`, `updateSetsBatch` |
| DDL / migrations | Drizzle doesn't manage runtime schema | `migrations.ts`, `tables.ts` |
| Dynamic table names | Import/export across 20+ tables | `import-export.ts` |
| Nested subquery re-ordering | `SELECT * FROM (SELECT ... LIMIT N) ORDER BY` | `getExercise1RMChartData` |

### Common Drizzle patterns

```typescript
// Simple CRUD
const db = getDrizzle();
db.select().from(table).where(eq(table.id, id)).get();
db.insert(table).values({ ... });
db.update(table).set({ ... }).where(eq(table.id, id));
db.delete(table).where(eq(table.id, id));

// JOINs
db.select().from(a).innerJoin(b, eq(a.id, b.a_id)).where(...);
db.select().from(a).leftJoin(b, eq(a.id, b.a_id));

// Aggregates
db.select({ total: count() }).from(table).where(...);
db.select({ maxW: max(table.weight) }).from(table).groupBy(table.exercise_id);

// SQLite functions via sql``
db.select({ month: sql`strftime('%Y-%m', ...)` }).from(table).groupBy(sql`1`);
db.update(table).set({ retry_count: sql`retry_count + 1` });

// Upserts
db.insert(table).values({ ... }).onConflictDoUpdate({
  target: table.date,
  set: { weight: sql`excluded.weight` }
});
```
