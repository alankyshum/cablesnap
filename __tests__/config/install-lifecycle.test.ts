/**
 * Regression lock: `npm install` must succeed in headless / production
 * containers (NODE_ENV=production, npm config omit=dev) without requiring
 * the `--ignore-scripts` workaround.
 *
 * Failure mode (BLD-741): `patch-package` was previously a devDependency,
 * so it was absent in production-mode installs and the `postinstall` hook
 * crashed. Similarly, `husky` (devDep) crashed the `prepare` hook.
 *
 * Invariants:
 *   1. `patch-package` is declared in `dependencies` so it is always
 *      installed regardless of NODE_ENV / omit=dev.
 *   2. `postinstall` invokes `npx --no-install patch-package` — the
 *      `--no-install` flag forces resolution to `node_modules/.bin/`
 *      instead of relying on shell PATH.
 *   3. `prepare` is guarded with `|| true` so missing husky (production)
 *      does not break the install.
 *
 * Refs: BLD-741.
 */
import fs from "fs";
import path from "path";

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe("Install lifecycle scripts (BLD-741)", () => {
  const pkg: PackageJson = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../package.json"),
      "utf8",
    ),
  );

  it("declares patch-package in dependencies (not devDependencies) so headless installs do not skip it", () => {
    expect(pkg.dependencies?.["patch-package"]).toBeDefined();
    expect(pkg.devDependencies?.["patch-package"]).toBeUndefined();
  });

  it("postinstall hook invokes patch-package via `npx --no-install` to bypass PATH lookup", () => {
    const postinstall = pkg.scripts?.postinstall ?? "";
    expect(postinstall).toContain("patch-package");
    // `npx --no-install` resolves directly from node_modules/.bin and never
    // attempts a network install — required for offline / locked-down agent
    // containers.
    expect(postinstall).toMatch(/npx\s+--no-install\s+patch-package/);
  });

  it("prepare hook tolerates missing husky in production / agent containers", () => {
    const prepare = pkg.scripts?.prepare ?? "";
    // Either `husky || true` (current fix) or any other shell construct that
    // exits 0 on husky absence is acceptable. We assert the `|| true` guard
    // explicitly because that is what the documented fix uses; revisit if a
    // different mechanism is adopted.
    expect(prepare).toMatch(/husky\s*\|\|\s*true/);
  });
});
