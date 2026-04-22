import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../..");
const layout = [
  fs.readFileSync(path.join(root, "app/_layout.tsx"), "utf-8"),
  fs.readFileSync(path.join(root, "constants/screen-config.ts"), "utf-8"),
].join("\n");
const names = [...layout.matchAll(/name:\s*"([^"]+)"/g), ...layout.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
// Deduplicate
const uniqueNames = [...new Set(names)];

function exists(route: string): boolean {
  const base = path.join(root, "app", route);
  if (fs.existsSync(base + ".tsx")) return true;
  if (fs.existsSync(path.join(base, "_layout.tsx"))) return true;
  if (fs.existsSync(path.join(base, ".tsx"))) return true;
  if (fs.existsSync(base)) return fs.statSync(base).isFile();
  return false;
}

describe("Stack.Screen route names", () => {
  it("should have extracted route names from _layout.tsx", () => {
    expect(uniqueNames.length).toBeGreaterThan(0);
  });

  it("every route name maps to an existing file", () => {
    for (const name of uniqueNames) {
      if (!exists(name)) {
        throw new Error(`Route '${name}' does not map to an existing file under app/`);
      }
    }
  });
});
