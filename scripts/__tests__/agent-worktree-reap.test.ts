/**
 * BLD-2251 — agent-worktree.sh reap / count / guard-count regression tests
 *
 * dispatch heartbeat path-scan crashed with ARG_MAX because 40+ worktrees +
 * hundreds of /tmp dirs blew past the argv limit. These subcommands census,
 * reap stale worktrees, and provide a regression guard so the count never
 * climbs back into the danger zone.
 *
 * Pattern mirrors agent-worktree-guard.test.ts: build a throwaway git repo,
 * add real worktrees, and drive the script via spawnSync with a controlled
 * REPO_DIR (AGENT_WORKTREE_ROOT) + cwd.
 *
 * Acceptance criteria:
 *   count          → prints number of non-primary worktrees
 *   guard-count    → exits 1 at/over limit, 0 under
 *   reap --dry-run → lists stale, removes none
 *   reap           → removes stale+clean, keeps fresh, keeps package-lock-only,
 *                    keeps dirty-real-change, keeps unmerged work
 */

import { spawnSync, execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const SCRIPT = resolve(__dirname, '..', 'agent-worktree.sh');

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function run(repo: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: repo,
    env: {
      ...process.env,
      AGENT_WORKTREE_REPO_DIR: repo,
      AGENT_WORKTREE_ROOT: env.ROOT ?? '/tmp',
      ...env,
    },
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, out: (r.stderr ?? '') + (r.stdout ?? '') };
}

describe('BLD-2251: agent-worktree.sh reap/count/guard-count', () => {
  let repo: string;
  let wtRoot: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'bld2251-repo-'));
    wtRoot = mkdtempSync(join(tmpdir(), 'bld2251-wt-'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 't@t.t');
    git(repo, 'config', 'user.name', 't');
    git(repo, 'checkout', '-q', '-b', 'main');
    writeFileSync(join(repo, 'a.txt'), 'x');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    // emulate an 'origin/main' remote tracking ref so reap's merge-safety
    // check (git cherry origin/main HEAD) resolves.
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'main');
    // create worktrees: clean (stale), fresh, dirty (real change), unmerged
    git(repo, 'worktree', 'add', '-q', join(wtRoot, 'wt-clean'), '-b', 'clean', 'main');
    git(repo, 'worktree', 'add', '-q', join(wtRoot, 'wt-fresh'), '-b', 'fresh', 'main');
    git(repo, 'worktree', 'add', '-q', join(wtRoot, 'wt-dirty'), '-b', 'dirty', 'main');
    git(repo, 'worktree', 'add', '-q', join(wtRoot, 'wt-unmerged'), '-b', 'unmerged', 'main');
    writeFileSync(join(wtRoot, 'wt-dirty', 'real.txt'), 'change');
    // unmerged: stale + clean but has a commit not in origin/main → must be kept
    writeFileSync(join(wtRoot, 'wt-unmerged', 'b.txt'), 'extra');
    git(join(wtRoot, 'wt-unmerged'), 'add', '.');
    git(join(wtRoot, 'wt-unmerged'), 'commit', '-qm', 'unmerged work');
    // age wt-clean and wt-unmerged past threshold
    spawnSync('touch', ['-d', '3 days ago', join(wtRoot, 'wt-clean')]);
    spawnSync('touch', ['-d', '3 days ago', join(wtRoot, 'wt-unmerged')]);
  });

  afterAll(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(wtRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('count prints number of non-primary worktrees', () => {
    const { out } = run(repo, ['count']);
    expect(parseInt(out.trim(), 10)).toBe(4);
  });

  it('guard-count exits 1 when over limit', () => {
    expect(run(repo, ['guard-count', '--limit', '3']).code).toBe(1);
  });

  it('guard-count exits 0 when under limit', () => {
    expect(run(repo, ['guard-count', '--limit', '99']).code).toBe(0);
  });

  it('reap --dry-run removes nothing', () => {
    run(repo, ['reap', '--dry-run', '--max-age-hours', '48']);
    expect(existsSync(join(wtRoot, 'wt-clean'))).toBe(true);
  });

  it('reap removes stale+clean, keeps fresh/dirty/unmerged', () => {
    run(repo, ['reap', '--max-age-hours', '48']);
    expect(existsSync(join(wtRoot, 'wt-clean'))).toBe(false);    // stale+clean → reaped
    expect(existsSync(join(wtRoot, 'wt-fresh'))).toBe(true);     // fresh → kept
    expect(existsSync(join(wtRoot, 'wt-dirty'))).toBe(true);     // real changes → kept
    expect(existsSync(join(wtRoot, 'wt-unmerged'))).toBe(true);  // unmerged work → kept
  });

  it('bash -n syntax check passes', () => {
    expect(spawnSync('bash', ['-n', SCRIPT]).status).toBe(0);
  });

  it('usage lists reap/count/guard-count', () => {
    const help = run(repo, ['help']).out;
    expect(help).toMatch(/reap/);
    expect(help).toMatch(/count/);
    expect(help).toMatch(/guard-count/);
  });
});
