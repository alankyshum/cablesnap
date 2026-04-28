#!/usr/bin/env tsx
/**
 * BLD-743 — Apply expert panel's recommended alt-text rewrites to the manifest.
 *
 * After `scripts/curate-exercise-images.ts` runs, the panel often returns
 * APPROVE_WITH_CHANGES / REJECT with detailed prose rewrites of `startAlt`
 * and `endAlt`. The CEO acceptance criteria require zero APPROVE_WITH_CHANGES
 * and zero REJECT in the final commit, so the AI-generated alt text from
 * `gpt-4o-mini` (small, fast, cheap) needs to be replaced with the expert
 * panel's rewrites.
 *
 * Strategy:
 *   - Read each cached panel output from `.cache/curate/<id>.json`.
 *   - For exercises with a non-APPROVE verdict, ask gpt-5 (cheap structured
 *     extraction; ~1 short call per exercise) to extract the panel's final
 *     recommended `startAlt` and `endAlt` strings as strict JSON.
 *   - Apply the extracted strings to `manifest.generated.ts` atomically.
 *   - Bust the curate cache for the affected ids so the next curate run
 *     re-evaluates the new alt text.
 *
 * After this runs, re-execute `scripts/curate-exercise-images.ts` (full run,
 * cache-respecting) to verify the panel approves the new alt text.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx scripts/apply-panel-rewrites.ts
 *   OPENAI_API_KEY=... npx tsx scripts/apply-panel-rewrites.ts --ids voltra-001,voltra-005
 *   OPENAI_API_KEY=... npx tsx scripts/apply-panel-rewrites.ts --dry-run
 */
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.generated.ts");
const CACHE_DIR = path.join(ROOT, ".cache/curate");

type Manifest = Map<string, { startAlt: string; endAlt: string }>;

function loadManifest(): Manifest {
  const src = fs.readFileSync(MANIFEST_PATH, "utf8");
  const out: Manifest = new Map();
  const blockRe =
    /"([^"]+)":\s*\{[^}]*?startAlt:\s*("(?:\\.|[^"\\])*")[^}]*?endAlt:\s*("(?:\\.|[^"\\])*")[^}]*?\}/gs;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    out.set(m[1], {
      startAlt: JSON.parse(m[2]) as string,
      endAlt: JSON.parse(m[3]) as string,
    });
  }
  return out;
}

function writeManifest(entries: Manifest): void {
  const sorted = Array.from(entries.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const lines: string[] = [
    "// @generated — do not edit. Regenerate via `npm run generate:exercise-images`.",
    "//",
    "// BLD-561: Exercise illustrations pilot manifest.",
    "// Entries are deterministic-sorted by exercise id (localeCompare).",
    "// Each entry must have ALL FOUR keys (start, end, startAlt, endAlt) or",
    "// resolveExerciseImages() will return null per the both-or-neither rule.",
    "//",
    "// To populate: run `npm run generate:exercise-images` with OPENAI_API_KEY in env.",
    "// See scripts/generate-exercise-images.ts and CURATION.md.",
    "/* eslint-disable */",
    "",
    "export type ManifestEntry = {",
    "  start: number;",
    "  end: number;",
    "  startAlt: string;",
    "  endAlt: string;",
    "};",
    "",
    "export const manifest: Record<string, ManifestEntry> = {",
  ];
  for (const [id, { startAlt, endAlt }] of sorted) {
    lines.push(`  "${id}": {`);
    lines.push(`    start: require("./${id}/start.webp"),`);
    lines.push(`    end: require("./${id}/end.webp"),`);
    lines.push(`    startAlt: ${JSON.stringify(startAlt)},`);
    lines.push(`    endAlt: ${JSON.stringify(endAlt)},`);
    lines.push(`  },`);
  }
  lines.push("};", "");
  const tmp = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmp, lines.join("\n"));
  fs.renameSync(tmp, MANIFEST_PATH);
}

function readVerdict(panel: string): string {
  // Mirror deriveGates from curate-exercise-images.ts.
  const verdictSection = panel.split(/##\s*Verdict/i)[1] ?? panel;
  const upper = verdictSection.toUpperCase();
  if (upper.includes("APPROVE_WITH_CHANGES")) return "APPROVE_WITH_CHANGES";
  if (upper.includes("NEEDS_RESEARCH")) return "NEEDS_RESEARCH";
  if (upper.includes("REJECT")) return "REJECT";
  if (upper.includes("APPROVE")) return "APPROVE";
  return "UNKNOWN";
}

async function extractRewrites(
  exerciseId: string,
  exerciseName: string,
  panelOutput: string,
  apiKey: string,
): Promise<{ startAlt: string; endAlt: string }> {
  const systemPrompt =
    "You extract the expert panel's final recommended alt-text rewrites from a sports-science review. " +
    "The panel's review contains a `## Evidence-Based Recommendations` section with precise prose rewrites for " +
    "`startAlt` (start position) and `endAlt` (end position). " +
    "Your job is to output these EXACTLY as the panel recommended, in strict JSON form: " +
    `{"startAlt": "<panel's recommended start text>", "endAlt": "<panel's recommended end text>"}` +
    "\n\n" +
    "Rules:\n" +
    "- Use the panel's full recommended wording verbatim — do not summarize or shorten.\n" +
    "- If the panel embeds a 'Start position:' / 'End position:' label as plain prose, KEEP that label as part of the alt text.\n" +
    "- Strip outer quotes, leading bullets, and 'startAlt (replace with):' style prefixes — keep ONLY the text the panel said should be the alt text.\n" +
    "- Keep the alt text to roughly 1-3 sentences (typical alt-text length); if the panel offered multiple paragraphs, take the recommended single coherent description.\n" +
    "- If the panel APPROVED without changes, return the EXISTING startAlt/endAlt from the proposal section unchanged.\n" +
    "- The two strings MUST differ (start = lengthened/setup, end = contracted/peak).\n" +
    "- Output strict JSON only — no markdown fences, no commentary.";

  const userPrompt =
    `Exercise: ${exerciseName} (${exerciseId})\n\n` +
    `Expert panel review output:\n${panelOutput}\n\n` +
    `Extract the recommended startAlt and endAlt as strict JSON.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5",
      reasoning_effort: "minimal",
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`extract HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`extract returned empty content for ${exerciseId}`);
  const parsed = JSON.parse(content) as { startAlt?: string; endAlt?: string };
  if (!parsed.startAlt || !parsed.endAlt) {
    throw new Error(
      `extract missing startAlt/endAlt for ${exerciseId}: ${JSON.stringify(parsed)}`,
    );
  }
  if (parsed.startAlt === parsed.endAlt) {
    throw new Error(
      `extract returned identical startAlt/endAlt for ${exerciseId} — panel rewrites must differ`,
    );
  }
  return { startAlt: parsed.startAlt, endAlt: parsed.endAlt };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required");
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const idsFlagIdx = argv.indexOf("--ids");
  const subsetIds: Set<string> | null =
    idsFlagIdx >= 0 && argv[idsFlagIdx + 1]
      ? new Set(argv[idsFlagIdx + 1].split(",").map((s) => s.trim()).filter(Boolean))
      : null;

  // Need exercise names (for the extractor prompt). Read them via simple
  // pass over seedExercises in a Node-importable way.
  const { seedExercises } = await import("../lib/seed");
  const exById = new Map(seedExercises().map((e) => [e.id, e]));

  const manifest = loadManifest();
  const updates: Array<{ id: string; before: { startAlt: string; endAlt: string }; after: { startAlt: string; endAlt: string }; verdict: string }> = [];

  for (const id of PILOT_EXERCISE_IDS) {
    if (subsetIds && !subsetIds.has(id)) continue;
    const cachePath = path.join(CACHE_DIR, `${id}.json`);
    if (!fs.existsSync(cachePath)) {
      console.log(`[apply] ${id}: no cache; skipping`);
      continue;
    }
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as { panel: string };
    const verdict = readVerdict(cached.panel);
    if (verdict === "APPROVE") {
      console.log(`[apply] ${id}: panel APPROVE — leaving alt text unchanged`);
      continue;
    }
    const ex = exById.get(id);
    if (!ex) throw new Error(`unknown id ${id}`);

    console.log(`[apply] ${id}: extracting rewrites (verdict=${verdict})...`);
    const before = manifest.get(id);
    if (!before) throw new Error(`manifest missing ${id}`);
    const after = await extractRewrites(id, ex.name, cached.panel, apiKey);
    updates.push({ id, before, after, verdict });
    if (!dryRun) {
      manifest.set(id, after);
      // Bust the curate cache for this id so next curate run re-evaluates.
      try {
        fs.unlinkSync(cachePath);
      } catch {
        /* best effort */
      }
    }
  }

  if (dryRun) {
    console.log("\n[apply] dry-run; manifest unchanged. Diffs:");
    for (const u of updates) {
      console.log(`\n=== ${u.id} (was: ${u.verdict}) ===`);
      console.log("BEFORE startAlt:", u.before.startAlt.slice(0, 200));
      console.log("AFTER  startAlt:", u.after.startAlt.slice(0, 200));
      console.log("BEFORE endAlt:  ", u.before.endAlt.slice(0, 200));
      console.log("AFTER  endAlt:  ", u.after.endAlt.slice(0, 200));
    }
    return;
  }

  if (updates.length > 0) {
    writeManifest(manifest);
    console.log(`\n[apply] wrote ${MANIFEST_PATH}; updated ${updates.length} entries`);
    console.log(`[apply] busted curate cache for: ${updates.map((u) => u.id).join(", ")}`);

    // Bump manifest.round.json so curate's round lock-in (BLD-743 Guardrail
    // #4) refuses to emit CURATION blocks from any cache entry whose
    // `round` is stale. The proposalHash check already busts stale cache
    // for updated entries; the round bump is the visible governance trail
    // ("which alt-text iteration is in the manifest right now").
    const roundPath = path.join(ASSET_DIR, "manifest.round.json");
    const prev = fs.existsSync(roundPath)
      ? (JSON.parse(fs.readFileSync(roundPath, "utf8")) as {
          round: number;
          updatedAt: string;
          notes?: string;
        })
      : { round: 0, updatedAt: new Date(0).toISOString() };
    const next = {
      round: prev.round + 1,
      updatedAt: new Date().toISOString(),
      notes: `Bumped by scripts/apply-panel-rewrites.ts after applying panel-recommended alt-text rewrites for: ${updates.map((u) => u.id).join(", ")}.`,
    };
    fs.writeFileSync(roundPath, JSON.stringify(next, null, 2) + "\n");
    console.log(
      `[apply] bumped ${roundPath}: round ${prev.round} → ${next.round}`,
    );
    console.log(`[apply] next: re-run scripts/curate-exercise-images.ts to verify panel APPROVE`);
  } else {
    console.log("\n[apply] no updates needed");
  }
}

main().catch((err) => {
  console.error("[apply] fatal:", (err as Error).message);
  process.exit(1);
});
