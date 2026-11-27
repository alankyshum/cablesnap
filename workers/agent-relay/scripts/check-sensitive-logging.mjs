// BLD-5100 AC12: fail if relay logging could capture tokens, URLs, or payloads.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = ["src/index.ts"];
for (const file of files) {
  const text = await readFile(path.join(root, file), "utf8");
  const calls = [...text.matchAll(/console\.(?:log|info|warn|error|debug)\s*\(([^;]*)/g)];
  const forbidden = calls.filter((match) => /request|url|authorization|bearer|body|payload|token|snapshot|proposal/i.test(match[1]));
  if (forbidden.length) throw new Error(`${file} logs potentially sensitive request data`);
}
const wrangler = await readFile(path.join(root, "wrangler.toml"), "utf8");
if (!/\[observability\][\s\S]*?enabled\s*=\s*false/.test(wrangler) ||
    !/\[observability\.logs\][\s\S]*?enabled\s*=\s*false/.test(wrangler) ||
    !/invocation_logs\s*=\s*false/.test(wrangler) ||
    !/head_sampling_rate\s*=\s*0/.test(wrangler)) {
  throw new Error("wrangler observability and request invocation logging must be disabled");
}
const sourceNames = await readdir(path.join(root, "src"));
if (sourceNames.some((name) => !/\.ts$/.test(name))) throw new Error("Unexpected Worker source file");
process.stdout.write("Sensitive Worker logging guard: OK\n");
