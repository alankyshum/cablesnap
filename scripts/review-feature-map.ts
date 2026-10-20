#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { affectedFeatures, inspectFeatureMap, type Feature } from "./feature-map";

type Cli = "claude" | "codex" | "opencode";
type Options = { all: boolean; dryRun: boolean; since?: string };
type Command = { executable: string; args: string[] };

const CLIS: Cli[] = ["claude", "codex", "opencode"];
const SOURCE_PREFIXES = ["app/", "components/", "lib/", "hooks/"];

function parseOptions(args: string[]): Options {
  const options: Options = { all: false, dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--since" && args[index + 1]) options.since = args[++index];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (options.all && options.since) throw new Error("Use either --all or --since, not both");
  return options;
}

function commandExists(command: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function pickCli(): Cli {
  const override = process.env.FEATURE_MAP_AGENT;
  if (override) {
    if (!CLIS.includes(override as Cli)) throw new Error(`FEATURE_MAP_AGENT must be one of: ${CLIS.join(", ")}`);
    if (!commandExists(override)) throw new Error(`FEATURE_MAP_AGENT=${override}, but '${override}' was not found on PATH`);
    return override as Cli;
  }
  const found = CLIS.find(commandExists);
  if (!found) throw new Error(`No supported local agent CLI found on PATH. Install or log in to one of: ${CLIS.join(", ")}`);
  return found;
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function resolveSince(root: string, requested?: string): string {
  if (requested) {
    git(root, ["rev-parse", "--verify", `${requested}^{commit}`]);
    return requested;
  }
  const tag = git(root, ["describe", "--tags", "--abbrev=0"]);
  if (!tag) throw new Error("No release tag found; pass --since <ref> or use --all");
  return tag;
}

function changedFiles(root: string, since: string): string[] {
  const output = git(root, ["diff", "--name-only", "--diff-filter=ACMRD", since, "--", "app", "components", "lib", "hooks"]);
  return output ? output.split("\n").filter((file) => SOURCE_PREFIXES.some((prefix) => file.startsWith(prefix))) : [];
}

function buildPrompt(features: Feature[], since: string | null): string {
  const files = features.map((feature) => feature.file);
  return `Review CableSnap's agent-facing feature map for semantic accuracy${since ? ` based on code changed since ${since}` : ""}.

Feature files in scope:
${files.map((file) => `- ${file}`).join("\n")}

Read each file and the current code matched by its routes and paths. Edit only the feature files listed above. Do not edit .agents/feature-map/README.md or any source/configuration file.

For each feature, verify that its description, aliases, Sub-features, How to get to it (user POV), Code entry points, and Gotchas still match the implemented product. Fix inaccurate or stale content, add missing user vocabulary and important sub-features, and keep the file compact and token-efficient. Preserve the feature id exactly and do not remove any existing route. Do not describe broken or incomplete behavior as expected behavior; leave the map truthful and report any broken behavior in your final response instead. Do not run generators, tests, formatters, or git commands—the calling script handles validation. If no edits are needed, say so.`;
}

function cliCommand(cli: Cli, root: string, prompt: string): Command {
  if (cli === "claude") {
    return { executable: "claude", args: ["--print", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Grep,Glob,Edit", "--output-format", "text", prompt] };
  }
  if (cli === "codex") {
    return { executable: "codex", args: ["--cd", root, "--sandbox", "workspace-write", "--ask-for-approval", "never", "exec", "--ephemeral", prompt] };
  }
  return { executable: "opencode", args: ["run", "--auto", "--format", "default", prompt] };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function fileHash(root: string, file: string): string {
  const target = path.join(root, file);
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return "missing";
  return crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function dirtySnapshot(root: string): Map<string, string> {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || "git status failed");
  const files = result.stdout.split("\n").filter(Boolean).map((line) => line.slice(3))
    .map((file) => file.includes(" -> ") ? file.split(" -> ")[1] : file);
  return new Map(files.map((file) => [file, fileHash(root, file)]));
}

function forbiddenAgentChanges(root: string, before: Map<string, string>, allowed: Set<string>): string[] {
  const after = dirtySnapshot(root);
  const candidates = new Set([...before.keys(), ...after.keys()]);
  return [...candidates].filter((file) => !allowed.has(file) && before.get(file) !== after.get(file));
}

function assertRoutesPreserved(before: Feature[], after: Feature[]): void {
  const byId = new Map(after.map((feature) => [feature.id, feature]));
  for (const feature of before) {
    const current = byId.get(feature.id);
    if (!current) throw new Error(`Agent removed or changed feature id '${feature.id}'`);
    const dropped = feature.routes.filter((route) => !current.routes.includes(route));
    if (dropped.length > 0) throw new Error(`Agent removed routes from '${feature.id}': ${dropped.join(", ")}`);
  }
}

function runChecked(command: string, args: string[], root: string): void {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
}

function main(): number {
  const root = process.cwd();
  try {
    const options = parseOptions(process.argv.slice(2));
    const inspection = inspectFeatureMap(root);
    if (inspection.errors.length > 0) throw new Error(`Feature map is structurally invalid:\n${inspection.errors.join("\n")}`);
    const since = options.all ? null : resolveSince(root, options.since);
    const changed = options.all ? [] : changedFiles(root, since!);
    const features = options.all ? inspection.features : affectedFeatures(inspection.features, changed);
    if (features.length === 0) {
      console.log(`No feature-map areas affected${since ? ` since ${since}` : ""}; semantic review skipped.`);
      return 0;
    }
    const cli = pickCli();
    const prompt = buildPrompt(features, since);
    const command = cliCommand(cli, root, prompt);
    console.log(`Reviewing ${features.length} feature(s) with ${cli}: ${features.map((feature) => feature.id).join(", ")}`);
    if (options.dryRun) {
      console.log(`\nCommand:\n${[command.executable, ...command.args].map(shellQuote).join(" ")}\n\nPrompt:\n${prompt}`);
      return 0;
    }
    const beforeDirty = dirtySnapshot(root);
    const allowed = new Set(features.map((feature) => feature.file));
    const result = spawnSync(command.executable, command.args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`${cli} semantic review failed with exit code ${result.status ?? "unknown"}`);
    const forbidden = forbiddenAgentChanges(root, beforeDirty, allowed);
    if (forbidden.length > 0) throw new Error(`Agent changed files outside its allowed feature-map scope: ${forbidden.join(", ")}`);
    const afterInspection = inspectFeatureMap(root);
    assertRoutesPreserved(features, afterInspection.features);
    runChecked("npm", ["run", "feature-map"], root);
    runChecked("npm", ["run", "feature-map:check"], root);
    runChecked("git", ["diff", "--stat", "--", ".agents/feature-map"], root);
    console.log("Semantic review complete. Feature-map changes are intentionally left uncommitted for the release commit.");
    return 0;
  } catch (error) {
    console.error(`feature-map review failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = main();
