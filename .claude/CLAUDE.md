# FitForge — Project Instructions

## Tech Stack
- **Framework:** Expo (React Native) with Expo Router
- **Language:** TypeScript
- **State:** TanStack React Query
- **Database:** expo-sqlite
- **Styling:** React Native StyleSheet
- **Testing:** Jest (unit), Playwright (e2e), Maestro (mobile e2e)

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
tail -f /tmp/fitforge-dev.log

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
npx expo-mcp --root /projects/fitforge --dev-server-url "http://localhost:$EXPO_DEV_PORT"
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
- **Build APK:** `npm run build:apk`
