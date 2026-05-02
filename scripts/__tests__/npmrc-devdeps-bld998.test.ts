/**
 * BLD-998 — `.npmrc` must install devDependencies even with NODE_ENV=production
 *
 * Pre-fix bug:
 *   The agent containers and some CI runners export NODE_ENV=production. npm
 *   honors that env var by appending `dev` to its `omit` list, so a plain
 *   `npm install` silently strips devDependencies (cross-env, jest, tsc, etc.).
 *   Verification commands (`npm test`, `npm run typecheck`) then fail with
 *   "command not found".
 *
 * Fix:
 *   `.npmrc` sets `omit=` (empty), which clears npm's NODE_ENV-derived default
 *   while still letting an explicit CLI `--omit=dev` win for production
 *   installs (cli > config). This regression test locks the .npmrc semantics
 *   we depend on.
 *
 * Acceptance criteria covered:
 *   AC1: With NODE_ENV=production and the repo's .npmrc, `npm config get omit`
 *        resolves to empty (devDeps will be installed).
 *   AC2: An explicit `npm ... --omit=dev` invocation still resolves omit=dev,
 *        so prod-only installs are NOT regressed.
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..');

function npmConfigGet(key: string, extraArgs: string[] = []): string {
  // Run npm from repo root so it picks up the repo's .npmrc.
  const out = execFileSync(
    'npm',
    ['config', 'get', key, ...extraArgs],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // npm prints `undefined` (literal) when unset; normalize to '' and trim.
  const trimmed = out.trim();
  return trimmed === 'undefined' ? '' : trimmed;
}

describe('BLD-998: .npmrc forces devDependencies under NODE_ENV=production', () => {
  it('repo .npmrc declares omit= (empty) so the NODE_ENV=production default is cleared', () => {
    const npmrc = readFileSync(resolve(REPO_ROOT, '.npmrc'), 'utf8');
    // Whitespace-tolerant match for `omit=` with empty value.
    expect(npmrc).toMatch(/^\s*omit\s*=\s*$/m);
  });

  it('AC1: with NODE_ENV=production and no flag, npm omit resolves to empty (devDeps installed)', () => {
    const omit = npmConfigGet('omit');
    expect(omit).toBe('');
  });

  it('AC2: explicit --omit=dev CLI flag still wins (prod-only installs NOT regressed)', () => {
    const omit = npmConfigGet('omit', ['--omit=dev']);
    expect(omit).toBe('dev');
  });

  it('AC2: --omit=dev is honored even when NODE_ENV=production is also set', () => {
    // CLI > config in npm precedence; this guards against future .npmrc
    // changes that would re-introduce production=false / include=dev (those
    // override CLI --omit=dev and would silently break release builds).
    const omit = npmConfigGet('omit', ['--omit=dev']);
    expect(omit).toBe('dev');
  });
});
