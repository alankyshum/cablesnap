/**
 * BLD-2040 — agent-worktree.sh `guard` subcommand regression test
 *
 * The `guard` subcommand was added to close the loophole that caused the
 * BLD-2039 race (conditional language allowed agents to skip worktrees for
 * "pure source edits"). Guard is a preflight check agents call before working
 * in /projects/cablesnap to fail fast if they are in the shared primary
 * checkout.
 *
 * Test pattern mirrors scripts/__tests__/npmrc-devdeps-bld998.test.ts:
 * invoke the script via execFileSync with controlled cwd + env.
 *
 * Acceptance criteria covered:
 *   AC1: guard refuses when cwd == primary checkout → exits 3 with stderr message
 *   AC2: guard passes when cwd is NOT the primary checkout → exits 0
 *   AC3: guard is listed in the usage/help output
 *   AC6 (partial): bash -n syntax check passes; start/stop/list/status exit codes unchanged
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, rmdirSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

const SCRIPT = resolve(__dirname, '..', 'agent-worktree.sh');

/** Run `bash <SCRIPT> guard [args]` and return exit code + combined output */
function runGuard(
  cwd: string,
  env: Record<string, string> = {},
  guardArgs: string[] = [],
): { code: number; out: string } {
  const result = spawnSync('bash', [SCRIPT, 'guard', ...guardArgs], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = (result.stderr ?? '') + (result.stdout ?? '');
  return { code: result.status ?? 1, out };
}

describe('BLD-2040: agent-worktree.sh guard subcommand', () => {
  // A temporary directory that is definitely NOT the primary checkout
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'bld2040-guard-test-'));
  });

  afterAll(() => {
    try {
      rmdirSync(tmpDir);
    } catch {
      // ignore — tmpdir cleanup failure shouldn't fail tests
    }
  });

  // ─── AC1 ────────────────────────────────────────────────────────────────────

  describe('AC1: guard refuses when directory is the shared primary checkout', () => {
    it('exits 3 when CABLESNAP_PRIMARY_CHECKOUT points at cwd', () => {
      const { code } = runGuard(tmpDir, { CABLESNAP_PRIMARY_CHECKOUT: tmpDir });
      expect(code).toBe(3);
    });

    it('prints a REFUSING message on stderr when in the primary checkout', () => {
      const { out } = runGuard(tmpDir, { CABLESNAP_PRIMARY_CHECKOUT: tmpDir });
      expect(out).toMatch(/REFUSING/);
    });

    it('stderr message mentions starting a worktree', () => {
      const { out } = runGuard(tmpDir, { CABLESNAP_PRIMARY_CHECKOUT: tmpDir });
      expect(out).toMatch(/start a worktree/i);
    });

    it('exits 3 when the hardcoded /projects/cablesnap path is passed as explicit dir argument', () => {
      // This tests the hardcoded-path fallback (Method 3). We pass the
      // primary path explicitly as an argument rather than as cwd so the test
      // works even when the test runner is NOT inside /projects/cablesnap.
      const { code } = runGuard(tmpDir, {}, ['/projects/cablesnap']);
      expect(code).toBe(3);
    });
  });

  // ─── AC2 ────────────────────────────────────────────────────────────────────

  describe('AC2: guard passes when directory is NOT the primary checkout', () => {
    it('exits 0 when CABLESNAP_PRIMARY_CHECKOUT points elsewhere and cwd differs', () => {
      // Simulate being inside a /tmp/wt-* worktree: override primary to tmpDir
      // and run from a different temp dir.
      const otherDir = mkdtempSync(resolve(tmpdir(), 'bld2040-guard-other-'));
      try {
        const { code } = runGuard(otherDir, { CABLESNAP_PRIMARY_CHECKOUT: tmpDir });
        expect(code).toBe(0);
      } finally {
        try { rmdirSync(otherDir); } catch { /* ignore */ }
      }
    });

    it('prints an OK message on stderr when safe', () => {
      const otherDir = mkdtempSync(resolve(tmpdir(), 'bld2040-guard-ok-'));
      try {
        const { out } = runGuard(otherDir, { CABLESNAP_PRIMARY_CHECKOUT: tmpDir });
        expect(out).toMatch(/OK/);
      } finally {
        try { rmdirSync(otherDir); } catch { /* ignore */ }
      }
    });

    it('exits 0 when an explicit safe dir argument is passed', () => {
      const { code } = runGuard(tmpDir, { CABLESNAP_PRIMARY_CHECKOUT: tmpDir }, [tmpdir()]);
      expect(code).toBe(0);
    });
  });

  // ─── AC3 ────────────────────────────────────────────────────────────────────

  describe('AC3: guard is listed in usage/help', () => {
    it('usage output includes the guard subcommand', () => {
      const result = spawnSync('bash', [SCRIPT, 'help'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const helpText = (result.stderr ?? '') + (result.stdout ?? '');
      expect(helpText).toMatch(/guard/);
    });

    it('unknown subcommand still exits 2 (guard does not break unknown-cmd behavior)', () => {
      const result = spawnSync('bash', [SCRIPT, 'notasubcommand'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result.status).toBe(2);
    });
  });

  // ─── AC6 (partial) ──────────────────────────────────────────────────────────

  describe('AC6: no regressions — existing subcommands and syntax are unchanged', () => {
    it('bash -n syntax check passes', () => {
      const result = spawnSync('bash', ['-n', SCRIPT], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result.status).toBe(0);
    });

    it('list subcommand exits 0', () => {
      const result = spawnSync('bash', [SCRIPT, 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result.status).toBe(0);
    });

    it('status subcommand exits 0 for an unknown branch (shows missing)', () => {
      const result = spawnSync('bash', [SCRIPT, 'status', 'bld-9999-nonexistent'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result.status).toBe(0);
    });

    it('stop on a nonexistent branch exits 0 (no-op)', () => {
      const result = spawnSync('bash', [SCRIPT, 'stop', 'bld-9999-nonexistent'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result.status).toBe(0);
    });

    it('CABLESNAP_PRIMARY_CHECKOUT env is honored: same dir → exits 3, different dir → exits 0', () => {
      const dir1 = mkdtempSync(resolve(tmpdir(), 'bld2040-env1-'));
      const dir2 = mkdtempSync(resolve(tmpdir(), 'bld2040-env2-'));
      try {
        const refused = runGuard(dir1, { CABLESNAP_PRIMARY_CHECKOUT: dir1 });
        expect(refused.code).toBe(3);

        const allowed = runGuard(dir2, { CABLESNAP_PRIMARY_CHECKOUT: dir1 });
        expect(allowed.code).toBe(0);
      } finally {
        try { rmdirSync(dir1); } catch { /* ignore */ }
        try { rmdirSync(dir2); } catch { /* ignore */ }
      }
    });
  });
});
