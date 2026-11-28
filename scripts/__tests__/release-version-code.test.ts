// BLD-5101: prevent ABI-expanded F-Droid codes from becoming Android base codes.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "release-version-code.sh");

function sandbox(appCode: number, metadataCode: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bld5101-version-code-"));
  fs.mkdirSync(path.join(root, "fdroid", "metadata"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "app.config.ts"),
    [
      "export default {",
      "  android: {",
      `    versionCode: ${appCode},`,
      "  },",
      "};",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "fdroid", "metadata", "com.persoack.cablesnap.yml"),
    `CurrentVersionCode: ${metadataCode}\n`,
  );
  return root;
}

function run(args: string[], root?: string): string {
  return execFileSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...(root ? { RELEASE_VERSION_CODE_ROOT: root } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("BLD-5101 release base version-code guard", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the matching base code for republish and increments it for bump", () => {
    const root = sandbox(187009, 187009);
    roots.push(root);
    expect(run(["current"], root)).toBe("187009");
    expect(run(["next"], root)).toBe("187010");
  });

  it("rejects an ABI-expanded CurrentVersionCode before release", () => {
    const root = sandbox(187008, 187008004);
    roots.push(root);
    expect(() => run(["next"], root)).toThrow(/CurrentVersionCode must stay the base code/);
  });

  it("rejects the first base code whose ABI-4 result exceeds Android's limit", () => {
    const root = sandbox(2099999, 2099999);
    roots.push(root);
    expect(run(["current"], root)).toBe("2099999");
    expect(() => run(["next"], root)).toThrow(/overflows F-Droid VercodeOperation/);
    expect(run(["validate", "2099999"])).toBe("");
    expect(() => run(["validate", "2100000"])).toThrow(/overflows F-Droid VercodeOperation/);
  });
});
