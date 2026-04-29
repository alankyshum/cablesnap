#!/usr/bin/env tsx
/**
 * BLD-743 — Selectively regenerate alt-text for specific exercise illustrations.
 *
 * Use case: when QD/curation flags semantic errors in `startAlt`/`endAlt`
 * (start describing the contracted phase, byte-identical alt for start/end,
 * etc.) we want to refresh ONLY the alt text without paying for a fresh
 * `gpt-image-1` round and without invalidating fingerprints.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/regen-alt-text.ts voltra-013 voltra-020 voltra-029
 *   OPENAI_API_KEY=sk-... npx tsx scripts/regen-alt-text.ts --all
 *
 * Behavior:
 *   - Reads existing `manifest.generated.ts` as text (it embeds Metro-only
 *     `require("./*.webp")` calls so it cannot be `import`-ed in Node).
 *   - Calls the same prompt template (`ALT_TEXT_SYSTEM_PROMPT`,
 *     `altTextUserPrompt`) used by the main generator. Drift between the
 *     two paths is impossible because both import from
 *     `scripts/exercise-prompts.ts`.
 *   - Refuses to write byte-identical `startAlt` / `endAlt` for the same id.
 *   - Atomically rewrites `manifest.generated.ts` (tmp + rename).
 *   - Does NOT touch `*.webp` or `fingerprint.json` — purely an alt-text patch.
 *
 * Not a CI job; dev-only.
 */
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

import { seedExercises } from "../lib/seed";
import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";
import type { Exercise } from "../lib/types";
import { ALT_TEXT_SYSTEM_PROMPT, altTextUserPrompt } from "./exercise-prompts";

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.generated.ts");

async function describePose(
  position: "start" | "end",
  ex: Exercise,
  apiKey: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: ALT_TEXT_SYSTEM_PROMPT },
        {
          role: "user",
          content: altTextUserPrompt({
            exerciseName: ex.name,
            category: ex.category,
            mountPosition: ex.mount_position ?? "any",
            attachment: ex.attachment ?? "handle",
            position,
            instructions: ex.instructions,
          }),
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `alt-text generation failed for ${ex.id} (${position}): HTTP ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(
      `alt-text generation returned empty content for ${ex.id} (${position}).`,
    );
  }
  return content;
}

type ManifestEntries = Map<string, { startAlt: string; endAlt: string; safetyNote?: string }>;

function loadManifestEntries(): ManifestEntries {
  // Parse manifest.generated.ts as text — we can't `import` it because the
  // generated `require("./<id>/start.webp")` calls are Metro-bundler-only and
  // crash Node. We only need `startAlt` / `endAlt` strings, so a small
  // tolerant parser is sufficient.
  const src = fs.readFileSync(MANIFEST_PATH, "utf8");
  const entries: ManifestEntries = new Map();
  const blockRe =
    /"([^"]+)":\s*\{[^}]*?startAlt:\s*("(?:\\.|[^"\\])*")[^}]*?endAlt:\s*("(?:\\.|[^"\\])*")[^}]*?\}/gs;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    const block = m[0];
    const safetyMatch = block.match(/safetyNote:\s*("(?:\\.|[^"\\])*")/);
    const safetyNote = safetyMatch ? (JSON.parse(safetyMatch[1]) as string) : undefined;
    entries.set(m[1], {
      startAlt: JSON.parse(m[2]) as string,
      endAlt: JSON.parse(m[3]) as string,
      ...(safetyNote ? { safetyNote } : {}),
    });
  }
  if (entries.size === 0) {
    throw new Error(
      `[regen-alt] could not parse any manifest entries from ${MANIFEST_PATH}`,
    );
  }
  return entries;
}

function writeManifest(
  entries: Map<string, { startAlt: string; endAlt: string; safetyNote?: string }>,
): void {
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
    "  safetyNote?: string;",
    "};",
    "",
    "export const manifest: Record<string, ManifestEntry> = {",
  ];
  for (const [id, { startAlt, endAlt, safetyNote }] of sorted) {
    lines.push(`  "${id}": {`);
    lines.push(`    start: require("./${id}/start.webp"),`);
    lines.push(`    end: require("./${id}/end.webp"),`);
    lines.push(`    startAlt: ${JSON.stringify(startAlt)},`);
    lines.push(`    endAlt: ${JSON.stringify(endAlt)},`);
    if (safetyNote) {
      lines.push(`    safetyNote: ${JSON.stringify(safetyNote)},`);
    }
    lines.push(`  },`);
  }
  lines.push("};", "");
  const tmp = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmp, lines.join("\n"));
  fs.renameSync(tmp, MANIFEST_PATH);
  console.log(`[regen-alt] wrote ${MANIFEST_PATH} with ${sorted.length} entries`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[regen-alt] OPENAI_API_KEY is required.");
    process.exit(1);
  }

  const wantAll = argv.includes("--all");
  const requestedIds = wantAll
    ? Array.from(PILOT_EXERCISE_IDS)
    : argv.filter((a) => !a.startsWith("--"));
  if (requestedIds.length === 0) {
    console.error(
      "[regen-alt] usage: regen-alt-text.ts <id> [<id>...]  |  --all",
    );
    process.exit(1);
  }

  const all = seedExercises();
  const exById = new Map(all.map((e) => [e.id, e]));
  const missing = requestedIds.filter((id) => !exById.has(id));
  if (missing.length > 0) {
    console.error(`[regen-alt] unknown ids: ${missing.join(", ")}`);
    process.exit(1);
  }

  const entries = loadManifestEntries();

  for (const id of requestedIds) {
    const ex = exById.get(id)!;
    console.log(`[regen-alt] ${id}: regenerating start...`);
    const startAlt = await describePose("start", ex, apiKey);
    console.log(`[regen-alt] ${id}: regenerating end...`);
    const endAlt = await describePose("end", ex, apiKey);

    if (startAlt === endAlt) {
      throw new Error(
        `[regen-alt] ${id}: regenerated startAlt and endAlt are byte-identical. Prompt or model is still collapsing semantics — refusing to write. Inspect images and adjust the system prompt or regenerate the image pair.`,
      );
    }
    entries.set(id, { startAlt, endAlt, safetyNote: entries.get(id)?.safetyNote });
  }

  writeManifest(entries);
}

main().catch((err) => {
  console.error("[regen-alt] fatal:", (err as Error).message);
  process.exit(1);
});
