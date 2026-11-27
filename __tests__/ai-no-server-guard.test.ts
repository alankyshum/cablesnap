// BLD-5100: protects removal of the provider-backed AI Coach and the Agent-access network boundary.
import { readdirSync, readFileSync } from "fs";
import { extname, join, relative } from "path";

const ROOT = join(__dirname, "..");
const SOURCE_ROOTS = ["app", "components", "hooks", "lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ALLOWED_RELAY_HOST = "cablesnap-agent-relay.alankyshum.workers.dev";

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe("BLD-5100 Agent access network guard", () => {
  it("contains no legacy AI-provider SDK or direct-provider references in app source", () => {
    const providerHost = ["open", "router.ai"].join("");
    const providerPackage = ["@open", "router/ai-sdk-provider"].join("");
    const violations: string[] = [];

    for (const file of SOURCE_ROOTS.flatMap((root) => collectFiles(join(ROOT, root)))) {
      const source = readFileSync(file, "utf8");
      if (source.includes(providerHost) || source.includes(providerPackage) || /from\s+["']ai["']/.test(source)) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it("allows Agent-access networking only through the configured relay host", () => {
    const appConfig = readFileSync(join(ROOT, "app.config.ts"), "utf8");
    const relayConfigHosts = [...appConfig.matchAll(/agentRelayUrl\s*:\s*["'`]([^"'`]+)["'`]/g)]
      .map((match) => new URL(match[1]).hostname);
    for (const host of relayConfigHosts) expect(host).toBe(ALLOWED_RELAY_HOST);

    const agentFiles = SOURCE_ROOTS.flatMap((root) => collectFiles(join(ROOT, root)))
      .filter((file) => /agent[-/]access/i.test(relative(ROOT, file)));
    const violations: string[] = [];
    for (const file of agentFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:https?:)?\/\/([^/\s"'`]+)/g)) {
        if (match[1] !== ALLOWED_RELAY_HOST) violations.push(`${relative(ROOT, file)}: ${match[1]}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
