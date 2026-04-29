/**
 * Jest globalSetup — ensure `patch-package` patches are applied before any
 * test runs.
 *
 * Why: `__tests__/lib/expo-sqlite-worker-channel-length.test.ts` (BLD-660 /
 * BLD-831) reads `node_modules/expo-sqlite/web/WorkerChannel.ts` from disk to
 * guard the BLD-660 length-prefix patch. The patch is normally applied by the
 * `postinstall` hook (`patch-package`). Any environment that installs deps
 * with `--ignore-scripts` (CI cache restores, security-locked installs, the
 * exact reproduction command in BLD-831) skips postinstall and leaves the
 * file unpatched, causing a deterministic test failure unrelated to the
 * codebase under test.
 *
 * Running `patch-package` here is idempotent — already-applied patches are a
 * no-op — and adds <1s to a cold test run. If `patch-package` itself isn't
 * installed (e.g. a stripped-down node_modules), we silently skip and let the
 * downstream test fail with its own clear message.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function globalSetup() {
  const repoRoot = __dirname;
  const patchPackageBin = path.join(
    repoRoot,
    'node_modules',
    '.bin',
    'patch-package',
  );

  if (!fs.existsSync(patchPackageBin)) {
    return;
  }

  const patchesDir = path.join(repoRoot, 'patches');
  if (!fs.existsSync(patchesDir)) {
    return;
  }

  const result = spawnSync(patchPackageBin, [], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(
      `[jest globalSetup] patch-package failed (exit ${result.status}):\n` +
        `${stdout}\n${stderr}`,
    );
  }
};
