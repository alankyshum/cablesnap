#!/usr/bin/env tsx
/**
 * BLD-561 — Exercise illustration generator.
 *
 * Generates start + end position illustrations for pilot Voltra exercises
 * using OpenAI `gpt-image-1` (per approved R2 plan).
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-exercise-images.ts
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-exercise-images.ts --force-regen
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-exercise-images.ts --contact-sheet
 *
 * Behavior:
 *   - Idempotent: fingerprint sidecar per exercise; skip if unchanged.
 *   - Fingerprint drift → warn and require `--force-regen`.
 *   - Output: 384×384 webp Q75, transparent alpha. Requires `cwebp` on PATH.
 *   - Writes manifest.generated.ts in deterministic id-sort order.
 *   - Never logs the API key.
 *   - Not a CI job; dev-only.
 *
 * Dry-run (no key needed): pass `--dry-run` to print prompt payloads only.
 */
/* eslint-disable no-console */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// NOTE: tsx can resolve tsconfig paths; using relative import for safety.
import { seedExercises } from "../lib/seed";
import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";
import type { Exercise } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.generated.ts");
const MODEL = "gpt-image-1";
const MODEL_VERSION = "2025-09"; // pinned per techlead; update alongside re-run
const IMAGE_SIZE = 384;
const WEBP_QUALITY = 75;

const PROMPT_TEMPLATE_VERSION = "1.0.0";
const PROMPT_TEMPLATE = `Minimalist educational illustration of a single person performing a cable-machine exercise.
Style: clean line-art with subtle flat shading, transparent background, no text, no watermarks, no brand logos, no equipment labels.
Framing: full body visible, centered, neutral pose, plausible anatomy.
Cable machine: render only the cable + handle + relevant mount point; no extra gym furniture.
Exercise: {NAME}
Category: {CATEGORY}
Mount position: {MOUNT}
Attachment: {ATTACHMENT}
Instructions (for pose reference): {INSTRUCTIONS}
Generate {POSITION} position only.
Also return a 1-2 sentence alt-text description of the pose in the same call output.`;

type Cli = {
  forceRegen: boolean;
  dryRun: boolean;
  contactSheet: boolean;
};

function parseArgs(argv: string[]): Cli {
  return {
    forceRegen: argv.includes("--force-regen"),
    dryRun: argv.includes("--dry-run"),
    contactSheet: argv.includes("--contact-sheet"),
  };
}

function fingerprintInput(ex: Exercise): string {
  return JSON.stringify({
    id: ex.id,
    name: ex.name,
    category: ex.category,
    mount_position: ex.mount_position ?? null,
    attachment: ex.attachment ?? null,
    instructions: ex.instructions,
    template: PROMPT_TEMPLATE,
    templateVersion: PROMPT_TEMPLATE_VERSION,
    model: MODEL,
    modelVersion: MODEL_VERSION,
  });
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

type Fingerprint = {
  promptHash: string;
  model: string;
  modelVersion: string;
  generatedAt: string;
};

function readFingerprint(dir: string): Fingerprint | null {
  const fpPath = path.join(dir, "fingerprint.json");
  if (!fs.existsSync(fpPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fpPath, "utf8")) as Fingerprint;
  } catch {
    return null;
  }
}

function writeFingerprint(dir: string, fp: Fingerprint): void {
  fs.writeFileSync(path.join(dir, "fingerprint.json"), JSON.stringify(fp, null, 2) + "\n");
}

function buildPrompt(ex: Exercise, position: "start" | "end"): string {
  return PROMPT_TEMPLATE
    .replace("{NAME}", ex.name)
    .replace("{CATEGORY}", ex.category)
    .replace("{MOUNT}", ex.mount_position ?? "n/a")
    .replace("{ATTACHMENT}", ex.attachment ?? "n/a")
    .replace("{INSTRUCTIONS}", ex.instructions.replace(/\n/g, " "))
    .replace("{POSITION}", position);
}

type GenerationResult = {
  pngBuffer: Buffer;
  altText: string;
};

async function callOpenAI(prompt: string, apiKey: string): Promise<GenerationResult> {
  // Ask the image endpoint for a transparent-background PNG sized 1024×1024,
  // we downscale + re-encode to webp Q75 @ 384×384 ourselves (guarantees the
  // alpha contract regardless of provider tweaks).
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: "1024x1024",
      background: "transparent",
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI image gen failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const body = (await res.json()) as { data: Array<{ b64_json?: string; revised_prompt?: string }> };
  const first = body.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI response missing b64_json payload");
  }
  // Use the revised_prompt as a weak alt-text fallback; the real alt text
  // should be requested from a text model (cheap, separate call) if we
  // want richer accessibility. See TODO below.
  const altText = first.revised_prompt?.trim() || "";
  return { pngBuffer: Buffer.from(first.b64_json, "base64"), altText };
}

async function describePose(prompt: string, position: "start" | "end", ex: Exercise, apiKey: string): Promise<string> {
  // Separate small text call for substantive accessibility alt-text.
  // Kept in the same script so one command produces both image and alt.
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
        {
          role: "system",
          content:
            "You write 1-2 sentence descriptive alt-text for an exercise illustration. Describe body position, cable path, and key joint angles. No second person, no bullet points.",
        },
        {
          role: "user",
          content: `Exercise: ${ex.name} (${ex.category}). Mount: ${ex.mount_position}. Attachment: ${ex.attachment}. Position: ${position}. Instructions: ${ex.instructions}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    // Hard-fail: never persist stub alt-text. Accessibility labels must be
    // substantive AI output or the generator must fail the run so the
    // manifest entry is not written.
    throw new Error(
      `alt-text generation failed for ${ex.id} (${position}): HTTP ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(
      `alt-text generation returned empty content for ${ex.id} (${position}); aborting run so manifest is not polluted with stub text.`
    );
  }
  return content;
}

function encodeWebp(pngPath: string, webpPath: string): void {
  // cwebp preserves alpha when present in the PNG input. -q 75 matches plan.
  // -m 6 and -pass 10 give best compression at a cost of encode time (fine for
  // offline generation).
  execFileSync("cwebp", ["-q", String(WEBP_QUALITY), "-m", "6", "-pass", "10", "-resize", String(IMAGE_SIZE), String(IMAGE_SIZE), pngPath, "-o", webpPath], { stdio: "inherit" });
}

function verifyAlpha(webpPath: string): void {
  // `identify` from ImageMagick reports alpha channel presence via %A.
  // Blob on RGB-only outputs so we don't silently ship a non-transparent image.
  try {
    const out = execFileSync("identify", ["-format", "%A", webpPath]).toString().trim();
    if (out !== "Blend" && out !== "True") {
      throw new Error(`Expected alpha channel on ${webpPath}, got '${out}'`);
    }
  } catch (err) {
    throw new Error(`Alpha verification failed for ${webpPath}: ${(err as Error).message}`);
  }
}

function writeManifest(entries: Map<string, { startAlt: string; endAlt: string }>): void {
  const sorted = Array.from(entries.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
  // Atomic write: tmp + rename so a mid-batch failure leaves the prior
  // manifest intact (QD R2 recommendation).
  const tmp = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmp, lines.join("\n"));
  fs.renameSync(tmp, MANIFEST_PATH);
  console.log(`[gen] wrote ${MANIFEST_PATH} with ${sorted.length} entries`);
}

function writeContactSheet(entries: Map<string, { startAlt: string; endAlt: string }>): void {
  const sorted = Array.from(entries.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const rows = sorted
    .map(([id, v]) => `<tr><td>${id}</td><td><img src="./${id}/start.webp" width="192"><br><small>${escapeHtml(v.startAlt)}</small></td><td><img src="./${id}/end.webp" width="192"><br><small>${escapeHtml(v.endAlt)}</small></td></tr>`)
    .join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>Exercise illustration contact sheet</title>
<style>body{font:14px system-ui;background:#111;color:#eee}table{border-collapse:collapse;width:100%}td{border:1px solid #333;padding:8px;vertical-align:top}small{color:#aaa}</style>
<h1>BLD-561 — Exercise illustration contact sheet</h1>
<table><thead><tr><th>id</th><th>start</th><th>end</th></tr></thead><tbody>${rows}</tbody></table>`;
  const outPath = path.join(ASSET_DIR, "curation");
  fs.mkdirSync(outPath, { recursive: true });
  fs.writeFileSync(path.join(outPath, "contact-sheet.html"), html);
  console.log(`[gen] wrote contact sheet to ${outPath}/contact-sheet.html`);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!cli.dryRun && !apiKey) {
    console.error("[gen] OPENAI_API_KEY is required (pass --dry-run to preview prompts without hitting the API).");
    process.exit(1);
  }

  // Preflight external binaries so we fail fast rather than deep in the loop.
  if (!cli.dryRun) {
    try {
      execFileSync("cwebp", ["-version"], { stdio: "ignore" });
    } catch {
      console.error("[gen] 'cwebp' not found on PATH. Install libwebp (e.g., `brew install webp`).");
      process.exit(1);
    }
    try {
      execFileSync("identify", ["-version"], { stdio: "ignore" });
    } catch {
      console.error("[gen] 'identify' (ImageMagick) not found on PATH. Install ImageMagick (e.g., `brew install imagemagick`).");
      process.exit(1);
    }
  }

  const all = seedExercises();
  const pilot = all.filter((ex) => PILOT_EXERCISE_IDS.includes(ex.id));
  const missing = PILOT_EXERCISE_IDS.filter((id) => !pilot.find((p) => p.id === id));
  if (missing.length > 0) {
    console.warn(`[gen] pilot ids not present in seed: ${missing.join(", ")}`);
  }
  console.log(`[gen] pilot exercises: ${pilot.length}/${PILOT_EXERCISE_IDS.length} resolved`);

  const manifestEntries = new Map<string, { startAlt: string; endAlt: string }>();

  for (const ex of pilot) {
    const exDir = path.join(ASSET_DIR, ex.id);
    fs.mkdirSync(exDir, { recursive: true });
    const fpInput = fingerprintInput(ex);
    const promptHash = sha256(fpInput);
    const existing = readFingerprint(exDir);
    const haveFiles = fs.existsSync(path.join(exDir, "start.webp")) && fs.existsSync(path.join(exDir, "end.webp"));

    if (haveFiles && existing?.promptHash === promptHash && !cli.forceRegen) {
      console.log(`[gen] ${ex.id}: up to date — skip`);
      // Attempt to read alt text from prior manifest.
      try {
        const prior = await import(MANIFEST_PATH);
        const entry = prior.manifest?.[ex.id];
        if (entry?.startAlt && entry?.endAlt) {
          manifestEntries.set(ex.id, { startAlt: entry.startAlt, endAlt: entry.endAlt });
        }
      } catch {
        // ignore — will regenerate on next run if alt missing
      }
      continue;
    }
    if (haveFiles && existing && existing.promptHash !== promptHash && !cli.forceRegen) {
      console.warn(`[gen] ${ex.id}: prompt fingerprint drift detected — pass --force-regen to regenerate.`);
      continue;
    }

    for (const position of ["start", "end"] as const) {
      const prompt = buildPrompt(ex, position);
      if (cli.dryRun) {
        console.log(`[gen:dry] ${ex.id} ${position}: ${prompt.slice(0, 120)}...`);
        continue;
      }
      console.log(`[gen] ${ex.id} ${position}: calling ${MODEL}...`);
      const { pngBuffer } = await callOpenAI(prompt, apiKey!);
      const pngPath = path.join(exDir, `${position}.png`);
      const webpPath = path.join(exDir, `${position}.webp`);
      fs.writeFileSync(pngPath, pngBuffer);
      encodeWebp(pngPath, webpPath);
      verifyAlpha(webpPath);
      fs.unlinkSync(pngPath);
    }
    if (cli.dryRun) continue;

    const startAlt = await describePose(buildPrompt(ex, "start"), "start", ex, apiKey!);
    const endAlt = await describePose(buildPrompt(ex, "end"), "end", ex, apiKey!);
    manifestEntries.set(ex.id, { startAlt, endAlt });

    writeFingerprint(exDir, {
      promptHash,
      model: MODEL,
      modelVersion: MODEL_VERSION,
      generatedAt: new Date().toISOString(),
    });
  }

  if (!cli.dryRun) {
    writeManifest(manifestEntries);
    if (cli.contactSheet) writeContactSheet(manifestEntries);
  }
}

main().catch((err) => {
  console.error("[gen] fatal:", (err as Error).message);
  process.exit(1);
});
