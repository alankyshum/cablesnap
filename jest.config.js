// BLD-844: Force NODE_ENV=test before any module loads. React 19 only exposes
// `React.act` (and `react-test-renderer`'s `act`) when process.env.NODE_ENV ===
// 'test' at the moment the `react` module is first required — the export is
// gated in react/index.js for production-bundle size. Jest auto-sets NODE_ENV
// to 'test' only if the variable is not already set in the parent environment.
// CI/harness/IDE contexts that pre-set NODE_ENV (e.g. 'production',
// 'development', or unset+inherited) bypass that auto-set, leaving React.act
// undefined. @testing-library/react-native@13.x captures
// `typeof React.act === 'function' ? React.act : reactTestRenderer.act` at
// module-load time; with both undefined every render() throws
// "TypeError: actImplementation is not a function".
//
// Setting NODE_ENV here in jest.config.js is the earliest jest-controlled hook
// — it runs before jest-expo resolves React, before setupFiles run, and before
// any test file loads `@testing-library/react-native`. The npm test script
// already does `cross-env NODE_ENV=test`, but this guard covers direct `jest`,
// `npx jest`, IDE runners, and CI flows that bypass the npm script.
//
// See `.learnings/INDEX.md` (BLD-844) for the full timeline and next-bump
// guidance when React/RN are upgraded again.
process.env.NODE_ENV = 'test';

// BLD-2482: Size the Jest worker pool to the actual MEMORY budget, not just CPU.
//
// Symptom fixed: full parallel `npm run test` non-deterministically reported
// "Test suite failed to run … signal=SIGKILL, exitCode=null" for a DIFFERENT
// set of suites each run, with 0 failed assertions (4600+ tests all pass).
// SIGKILL + null exit code on a Jest worker CHILD process is the definitive
// kernel OOM-killer signature (the kernel kills it, so Node sees no exit code) —
// not a real test failure. Confirmed via `--logHeapUsage`: per-worker heapUsed
// climbs past ~1.1 GB (median ~651 MB) as the heavy react-native + jest-expo +
// `--experimental-sqlite` module graph and SQLite state accumulate across files.
//
// Why CPU-based sizing was wrong: BLD-918 set `maxWorkers:'100%'`, which resolves
// via os.availableParallelism()=2 on this box. But the container runs under a
// 6 GB cgroup memory cap (/sys/fs/cgroup/memory.max) with a persistent ~2.2 GB
// environmental floor, leaving only ~3.5 GB usable. Two workers peaking ~1.5–2 GB
// RSS each blow past 6 GB → the kernel SIGKILLs whichever worker is mid-load →
// the non-deterministic red suite. A previous attempt (workerIdleMemoryLimit
// alone) only recycles heap BETWEEN files, so a single heavy file can still spike
// RSS across the cap mid-run — it survived 5 runs then OOM'd on run 6 (6 SIGKILLs).
//
// Fix: derive maxWorkers from min(CPU parallelism, memory budget). memoryWorkers =
// floor((memBudget − reserve) / perWorkerBudget). This yields 1 (serial) under
// the 6 GB cgroup — which is exactly what CI's `--runInBand` job already does with
// zero flakes — while still granting full parallelism on developer machines with
// real RAM (e.g. 6 workers on a 16 GB/8-core laptop). It can never oversubscribe
// memory, so the OOM is structurally impossible rather than merely less frequent.
// No test is skipped or modified. CI wall-time is unchanged (CI already serial);
// only the default local/agent `jest` run trades ~120 s for determinism.
const os = require('os');
const fs = require('fs');
const path = require('path');
function cgroupMemLimitBytes() {
  // cgroup v2 (this container): "max" means unlimited.
  try {
    const v = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (v && v !== 'max') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {}
  // cgroup v1 fallback: sentinel is a near-INT64 value ≈ unlimited.
  try {
    const v = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
    if (Number.isFinite(v) && v > 0 && v < os.totalmem() * 4) return v;
  } catch {}
  return null;
}
function memoryAwareMaxWorkers() {
  const GB = 1024 ** 3;
  const cg = cgroupMemLimitBytes();
  const hostMem = os.totalmem();
  const memBudget = cg && cg < hostMem ? cg : hostMem;
  const RESERVE = 3.0 * GB;     // environmental floor (~2.2 GB anon) + spike headroom
  const PER_WORKER = 2.0 * GB;  // observed peak worker RSS on this suite
  const cpuMax = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const memMax = Math.max(1, Math.floor((memBudget - RESERVE) / PER_WORKER));
  return Math.max(1, Math.min(cpuMax, memMax));
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

const agentWorktreesPattern = `${escapeRegex(path.join(__dirname, '.paperclip', 'worktrees'))}/`;

module.exports = {
  preset: 'jest-expo',
  testTimeout: 10000,
  // See the BLD-2482 block above: memory-budget-aware worker count. Falls back to
  // full CPU parallelism when RAM is ample; clamps to 1 under a tight cgroup.
  maxWorkers: memoryAwareMaxWorkers(),
  // Defense-in-depth (kept from the first BLD-2482 attempt): even the surviving
  // worker(s) get recycled once V8 heapUsed crosses this ceiling, capping RSS
  // growth. Absolute bytes on purpose — jest-worker resolves a fraction/'%' against
  // os.totalmem() (host RAM), which ignores the cgroup, so a percentage would be
  // meaningless here. Harmless when only 1 worker runs; useful on parallel boxes.
  workerIdleMemoryLimit: 768 * 1024 * 1024,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|victory-native|react-native-safe-area-context|@gorhom/bottom-sheet)'
  ],
  moduleNameMapper: {
    'react-native-reanimated': '<rootDir>/__mocks__/react-native-reanimated.js',
  },
  // BLD-2161: Exclude paperclip agent worktrees so jest does not RUN test
  // files from isolated run-specific git worktrees.
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/', '__tests__/fixtures/', '/e2e/', agentWorktreesPattern],
  // BLD-2482 (primary flake): testPathIgnorePatterns only filters which test
  // FILES execute — it does NOT stop jest-haste-map from crawling those dirs to
  // build the module graph and register manual mocks. A sibling agent worktree
  // under .paperclip/worktrees/ (e.g. .../run/-issue-run/__mocks__/) therefore
  // still gets scanned: haste emits `duplicate manual mock found: <pkg>` and may
  // pick the WORKTREE copy as canonical (shadowing the real <rootDir>/__mocks__).
  // When another agent tears that worktree down MID-RUN (they churn constantly),
  // the chosen mock file vanishes and every suite that transitively imports it
  // dies with `Test suite failed to run: ENOENT ... /.paperclip/worktrees/.../
  // __mocks__/<pkg>`. That is the non-deterministic "N suites failed, different
  // set each run" symptom — reproduced here on clean main with a planted worktree
  // mock (254 suites red from a single deleted __mocks__/@sentry/react-native.js).
  //
  // Fix: exclude the worktrees from the MODULE/haste registry entirely, so their
  // __mocks__ are never registered and cannot shadow or dangle. modulePathIgnore-
  // Patterns is the jest-29 knob that gates haste-map registration (not just test
  // execution); watchPathIgnorePatterns keeps watch-mode from re-crawling them.
  modulePathIgnorePatterns: [agentWorktreesPattern],
  watchPathIgnorePatterns: [agentWorktreesPattern],
  globalSetup: './jest.global-setup.js',
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
};
