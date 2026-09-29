# Testing guidance

Use the shared [`test--acceptance` skill](../dotfiles/config/claude-code/skills/test--acceptance/SKILL.md) when adding or consolidating regression coverage. Prefer a small real flow through production entrypoints, serialization, and persistence to collections of isolated mocked tests. Keep self-contained algorithm tests when appropriate, and preserve security, fail-closed, and data-loss boundary checks.

Before importing application code or collecting tests, inspect the test command's lifecycle hooks and isolate credentials, application state, child processes, network, and filesystem effects. A temporary `HOME` or parent-process mock is not isolation. Prove restrictive execution with harmless sentinels first; use synthetic credentials and loopback-only fixtures. If the boundary cannot be proven, do not run the suite and report the limitation.

For a claimed regression, identify the production root cause and demonstrate RED/GREEN in an isolated copy; do not mutate working production source for the proof. Report exactly which tests executed, whether they exercised behavior or only static source/config policy, and any unverified remainder. Static architecture assertions are policy checks, not behavioral acceptance coverage. Do not call mocked repository call-count assertions persistence acceptance.

## Known test-command hazards

- `npm test` invokes `jest.global-setup.js`, which runs `patch-package` and writes into `node_modules`; don't run it against the working checkout without a verified isolated process/filesystem boundary.
- `npm run test:ai:live` uses provider credentials and HTTPS. Never use it as part of ordinary local verification; do not expose real credentials to test processes.
- Playwright/E2E commands create and remove `.expo/e2e-web-${PORT}`, launch a server, and write reports. Isolate those paths and do not reuse an existing server before running them.
