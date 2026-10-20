// Ticket-less: regression coverage for the agent feature-map consistency gate.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { affectedFeatures, inspectFeatureMap, runFeatureMap, type Feature } from "../feature-map";

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-map-"));
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agents/feature-map"), { recursive: true });
  fs.mkdirSync(path.join(root, "components/example"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/index.tsx"), "export default function Screen() { return null; }\n");
  fs.writeFileSync(path.join(root, "components/example/Card.tsx"), "export const Card = null;\n");
  return root;
}

function writeFeature(root: string, routes: string[], paths: string[]): void {
  fs.writeFileSync(path.join(root, ".agents/feature-map/example.md"), `---
id: example
title: Example
aliases: ["sample"]
routes: ${JSON.stringify(routes)}
paths: ${JSON.stringify(paths)}
---
# Example
`);
}

describe("feature-map generator", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("reports an unmapped user route", () => {
    const root = fixture();
    writeFeature(root, [], ["components/example/Card.tsx"]);
    expect(inspectFeatureMap(root).errors).toContainEqual(expect.stringContaining("Unmapped route '/'"));
    expect(runFeatureMap(root, true)).toBe(1);
  });

  it("reports a dead paths glob", () => {
    const root = fixture();
    writeFeature(root, ["/"], ["components/moved/**"]);
    expect(inspectFeatureMap(root).errors).toContainEqual(expect.stringContaining("matches no files"));
    expect(runFeatureMap(root, true)).toBe(1);
  });

  it("maps changed paths and routes to affected features", () => {
    const features: Feature[] = [
      { id: "example", title: "Example", aliases: [], routes: ["/example/[id]"], paths: ["components/example/**"], file: ".agents/feature-map/example.md" },
      { id: "other", title: "Other", aliases: [], routes: ["/other"], paths: ["lib/other.ts"], file: ".agents/feature-map/other.md" },
    ];
    expect(affectedFeatures(features, ["components/example/Card.tsx"]).map((feature) => feature.id)).toEqual(["example"]);
    expect(affectedFeatures(features, ["app/example/[id].tsx"]).map((feature) => feature.id)).toEqual(["example"]);
    expect(affectedFeatures(features, ["hooks/unclaimed.ts"])).toEqual([]);
  });
});
