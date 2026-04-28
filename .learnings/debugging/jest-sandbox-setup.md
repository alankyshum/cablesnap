# Jest in the Agent Sandbox — How It Resolves

**Status:** Resolved as of 2026-04-28 (BLD-738).
**Audience:** Any agent attempting to run jest locally inside the BLD agent sandbox.

## TL;DR

Run jest with the worktree-local binary, not via `rtk run npx jest`:

```bash
cd /projects/cablesnap
node node_modules/.bin/jest <path-or-pattern>
```

Preset loading now works. Tests load and execute. If you hit
`TypeError: actImplementation is not a function`, that is a **separate**
issue tracked in **BLD-740** (`@testing-library/react-native` version
mismatch with the sandbox's React copy). It is not the preset issue.

## Why this matters

For a while, every jest invocation aborted before any test ran with one of:

- `The React Native Jest preset has moved to a separate package. ... preset: '@react-native/jest-preset'`
- `TypeError: actImplementation is not a function` (when invoked through `rtk run npx jest`).

The first one was the preset issue (BLD-738). It is resolved at the
sandbox layer:

- `/tmp/m0-tools/node_modules/@react-native/jest-preset/` is now present.
- The previous symlink `node_modules/jest-expo → /tmp/m0-tools/node_modules/jest-expo`
  is gone; each cablesnap worktree resolves `jest-expo@55.0.16` from its
  own `node_modules/`.
- `jest.config.js` continues to use `preset: 'jest-expo'`, which now
  loads cleanly.

## Verification recipe

```bash
cd /projects/cablesnap
node node_modules/.bin/jest --listTests | head        # preset loads, tests enumerated
node node_modules/.bin/jest __tests__/lib/             # pure-logic suites pass
node node_modules/.bin/jest __tests__/components/      # component suites hit BLD-740 actImplementation
```

If `--listTests` works, the preset is fine. If component renders fail
with `actImplementation is not a function`, see BLD-740.

## Anti-patterns

- ❌ `rtk run npx jest …` — pulls a different `jest-expo` from the sandbox `npx` cache and gets the old failure mode. Avoid.
- ❌ Editing `jest.config.js` to `preset: '@react-native/jest-preset'` — `jest-expo` already wraps that under the hood; switching breaks expo-specific transforms.
- ❌ Re-running `npm install` inside a worktree to "fix" jest — breaks on `patch-package` postinstall and is unnecessary.

## Cross-references

- BLD-738 — Infra: jest-expo preset mismatch (this issue, resolved).
- BLD-740 — `@testing-library/react-native` actImplementation mismatch (still open).
- BLD-742 — CI workflow that runs tsc + jest on PRs (separate track; CI uses fresh `npm ci`, not the sandbox's symlink layout).
