#!/usr/bin/env tsx
/**
 * BLD-743 — Curation gate verifier.
 *
 * CEO Option A (comment 90c5899b) ratifies QD's Guardrail #2 + #3:
 *   #2 — Single source of truth for the gate decision is the
 *        `gateBlocks()` function in `scripts/curate-exercise-images.ts`.
 *        This script imports it (does NOT reimplement it) so pre-push
 *        hooks and CI use byte-identical logic.
 *   #3 — The committed `assets/exercise-illustrations/CURATION.md` is the
 *        binding artifact. This verifier parses every sign-off block and
 *        runs `gateBlocks()` against the recorded verdict + safety class.
 *        Exit 0 if every block PASSes; exit non-zero with a per-exercise
 *        breakdown otherwise.
 *
 * It does NOT call the LLM panel — it only validates the committed file.
 * Operators run `npx tsx scripts/curate-exercise-images.ts` to refresh
 * CURATION.md; this verifier confirms the result and is wired into:
 *   - .husky/pre-push (local guard before push)
 *   - .github/workflows/bundle-gate.yml (CI guard on every PR)
 *
 * Additionally, asserts the round number in every sign-off block matches
 * `manifest.round.json` (Guardrail #4 — round lock-in invariant on the
 * committed artifact, not just on cache).
 *
 * Run:
 *   npx tsx scripts/check-curation-gate.ts
 */
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";
import {
  gateBlocks,
  type SafetyClass,
} from "./curate-exercise-images";

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const CURATION_PATH = path.join(ASSET_DIR, "CURATION.md");
const MANIFEST_ROUND_PATH = path.join(ASSET_DIR, "manifest.round.json");

type ParsedBlock = {
  id: string;
  round: number | null;
  verdict: string;
  safetyClass: SafetyClass | null;
};

/**
 * Parse the sign-off blocks from CURATION.md.
 *
 * The block shape (emitted by `renderSignOff()`) starts with `## voltra-XXX`
 * and contains the recorded fields on the lines immediately following.
 * We tolerate whitespace and the verbose-prose form of those lines.
 *
 * Exported for unit testability.
 */
export function parseCurationBlocks(text: string): ParsedBlock[] {
  // Split on `## voltra-` headings; the first chunk is preamble.
  const parts = text.split(/^## (?=voltra-)/m);
  const out: ParsedBlock[] = [];
  for (const part of parts.slice(1)) {
    const headerMatch = /^(voltra-\d+)\b/.exec(part);
    if (!headerMatch) continue;
    const id = headerMatch[1];

    const roundMatch = /-\s*Round:\s*\*\*(\d+)\*\*/.exec(part);
    const round = roundMatch ? Number(roundMatch[1]) : null;

    // Curation gate line: `- Curation gate: ✅ PASS (verdict=`X`, safety-class=`Y` ...)
    const gateMatch =
      /-\s*Curation gate:[^\n]*verdict=`([A-Z_]+)`[^\n]*safety-class=`([A-Za-z/]+)`/.exec(
        part,
      );
    const verdict = gateMatch ? gateMatch[1] : "UNKNOWN";
    const rawClass = gateMatch ? gateMatch[2] : null;
    const safetyClass: SafetyClass | null =
      rawClass === "SAFETY" || rawClass === "REFINEMENT" || rawClass === "N/A"
        ? rawClass
        : null;

    out.push({ id, round, verdict, safetyClass });
  }
  return out;
}

function main(): void {
  if (!fs.existsSync(CURATION_PATH)) {
    console.error(`[gate] missing ${CURATION_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(MANIFEST_ROUND_PATH)) {
    console.error(`[gate] missing ${MANIFEST_ROUND_PATH}`);
    process.exit(1);
  }

  const text = fs.readFileSync(CURATION_PATH, "utf8");
  const roundFile = JSON.parse(
    fs.readFileSync(MANIFEST_ROUND_PATH, "utf8"),
  ) as { round: number };
  const expectedRound = roundFile.round;

  const blocks = parseCurationBlocks(text);
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const failures: string[] = [];
  console.log(`[gate] CURATION.md: ${blocks.length} sign-off blocks parsed`);
  console.log(`[gate] expected round (manifest.round.json): ${expectedRound}`);
  console.log("");
  console.log(
    `  ${"id".padEnd(12)} ${"round".padEnd(6)} ${"verdict".padEnd(22)} ${"safety".padEnd(11)} gate`,
  );
  console.log(`  ${"".padEnd(60, "-")}`);

  for (const id of PILOT_EXERCISE_IDS) {
    const b = byId.get(id);
    if (!b) {
      failures.push(`${id}: missing sign-off block in CURATION.md`);
      console.log(`  ${id.padEnd(12)} ${"-".padEnd(6)} ${"MISSING".padEnd(22)} ${"-".padEnd(11)} BLOCK`);
      continue;
    }
    if (b.safetyClass === null) {
      failures.push(
        `${id}: could not parse safety-class from sign-off (missing or malformed Curation gate line)`,
      );
    }
    if (b.round === null) {
      failures.push(`${id}: missing Round field in sign-off`);
    } else if (b.round !== expectedRound) {
      failures.push(
        `${id}: round mismatch — sign-off says ${b.round}, manifest.round.json says ${expectedRound}`,
      );
    }
    const cls = b.safetyClass ?? "N/A";
    const blocking = gateBlocks(b.verdict, cls);
    if (blocking) {
      failures.push(
        `${id}: gate BLOCKS (verdict=${b.verdict}, safety-class=${cls})`,
      );
    }
    console.log(
      `  ${id.padEnd(12)} ${String(b.round ?? "?").padEnd(6)} ${b.verdict.padEnd(22)} ${cls.padEnd(11)} ${blocking ? "BLOCK" : "PASS "}`,
    );
  }

  console.log("");
  if (failures.length > 0) {
    console.log(`[gate] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    console.log("");
    console.log(
      `[gate] To regenerate CURATION.md, run:`,
    );
    console.log(`         OPENAI_API_KEY=… PERPLEXITY_API_KEY=… \\`);
    console.log(`           npx tsx scripts/curate-exercise-images.ts`);
    process.exit(1);
  }
  console.log(`[gate] PASS — all ${blocks.length} sign-offs cleared the curation gate.`);
}

// Only run main() when invoked as a CLI entry point. Importing this module
// from tests must not trigger a process.exit().
const invokedAsScript =
  require.main === module ||
  (process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(__filename));
if (invokedAsScript) {
  main();
}
