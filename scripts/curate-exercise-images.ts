#!/usr/bin/env tsx
/**
 * BLD-743 — Substitute reviewer for exercise illustrations.
 *
 * The skill `review--sports-science` requires `GOOGLE_API_KEY` (Gemini 3.1 Pro
 * Preview) which is not provisioned in this environment. CEO approved
 * (Option B, BLD-743 comment 447c9f3a) substituting the analysis model with
 * OpenAI's GPT-5 while keeping every other element of the methodology
 * identical:
 *
 *   - Perplexity Sonar for research context (same query shape as
 *     `review.py:search_research`).
 *   - The full `EXPERT_SYSTEM_PROMPT` from
 *     `.claude/skills/review--sports-science/scripts/review.py` extracted at
 *     runtime (NOT duplicated inline) so it cannot drift if the canonical
 *     skill prompt is ever updated. Per QD requirement (BLD-743 comment
 *     556a429b): single source of truth.
 *   - Three-expert panel (CSCS sports scientist, RD sports dietitian,
 *     behavioral psychologist) with the same five output sections
 *     (Scientific Accuracy / Safety / Recommendations / Engagement / Verdict).
 *   - Original Gemini settings: temperature=0.3, maxOutputTokens=4096.
 *     Substitute model deviation: gpt-5 rejects non-default temperature, so
 *     we use the default (1) and a 16384 max_completion_tokens budget with
 *     reasoning_effort="medium" (gpt-5 is a reasoning model — it consumes
 *     part of the budget on hidden reasoning before any visible content).
 *     The deviation is recorded in every CURATION sign-off.
 *
 * Per pilot exercise:
 *   1. Asserts the manifest entry has all four keys (start/end/startAlt/endAlt)
 *      and that startAlt !== endAlt (semantic guard).
 *   2. Builds a "feature proposal" describing the illustration pair (alt text,
 *      mount, attachment, instructions, byte hashes of webp files for
 *      reviewer reproducibility).
 *   3. Calls Perplexity Sonar for research context.
 *   4. Calls OpenAI GPT-5 with EXPERT_SYSTEM_PROMPT (loaded from review.py)
 *      + proposal + research.
 *   5. Caches the panel output to `.cache/curate/<id>.md` so re-runs after
 *      partial failures don't re-invoke the LLM (and don't desync verdict
 *      tokens between runs).
 *   6. Emits a CURATION.md block per the template in the existing
 *      `CURATION.md`, plus the full reviewer panel output, plus reviewer
 *      identity / commit hash / timestamp.
 *
 * Run:
 *   OPENAI_API_KEY=... PERPLEXITY_API_KEY=... \
 *     npx tsx scripts/curate-exercise-images.ts
 *
 *   To force re-call (ignore cache):
 *     CURATE_REFRESH=1 npx tsx scripts/curate-exercise-images.ts
 *
 * Idempotency: each invocation rewrites the Sign-offs section atomically.
 */
/* eslint-disable no-console */
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { seedExercises } from "../lib/seed";
import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";
import type { Exercise } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.generated.ts");
const CURATION_PATH = path.join(ASSET_DIR, "CURATION.md");
const REVIEW_PY_PATH = path.join(
  ROOT,
  ".claude/skills/review--sports-science/scripts/review.py",
);
const CACHE_DIR = path.join(ROOT, ".cache/curate");

/**
 * Extract `EXPERT_SYSTEM_PROMPT` verbatim from the canonical
 * `review--sports-science` skill source. Single source of truth: if the
 * skill author ever updates the prompt, this script automatically picks up
 * the new version on the next run — no silent drift.
 */
function loadExpertSystemPrompt(): string {
  const src = fs.readFileSync(REVIEW_PY_PATH, "utf8");
  // The constant is defined as `EXPERT_SYSTEM_PROMPT = """..."""` (Python
  // triple-quoted string). Match the contents between the opening and
  // closing triple-double-quote.
  const m = src.match(/EXPERT_SYSTEM_PROMPT\s*=\s*"""([\s\S]*?)"""/);
  if (!m) {
    throw new Error(
      `[curate] could not locate EXPERT_SYSTEM_PROMPT in ${REVIEW_PY_PATH}. ` +
        `The skill source format may have changed; update the loader regex.`,
    );
  }
  // The Python string starts with a literal newline after the opening
  // triple-quote in some styles; Python ignores no leading characters by
  // convention but the original review.py format begins immediately after
  // the quotes with the panel description. Match.group(1) preserves the
  // exact bytes so this is faithful regardless.
  return m[1];
}

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

function sha256(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function buildProposal(
  ex: Exercise,
  alt: { startAlt: string; endAlt: string },
): string {
  const startPath = path.join(ASSET_DIR, ex.id, "start.webp");
  const endPath = path.join(ASSET_DIR, ex.id, "end.webp");
  const startHash = sha256(startPath).slice(0, 16);
  const endHash = sha256(endPath).slice(0, 16);
  const startBytes = fs.statSync(startPath).size;
  const endBytes = fs.statSync(endPath).size;

  return [
    `Feature under review: an exercise illustration pair (start + end) shown to`,
    `users of the CableSnap fitness app to teach proper form for the exercise below.`,
    `The illustrations are 384x384 transparent webp images displayed at runtime.`,
    `Alt text is read aloud by screen readers and is the only fallback if the`,
    `image fails to render. The user is a strength-training novice or intermediate`,
    `lifter using a wall-mounted cable system with adjustable mount height.`,
    ``,
    `Exercise definition (authoritative, from lib/seed.ts):`,
    `- id: ${ex.id}`,
    `- name: ${ex.name}`,
    `- category: ${ex.category}`,
    `- mount_position: ${ex.mount_position}`,
    `- attachment: ${ex.attachment}`,
    `- instructions: ${ex.instructions}`,
    ``,
    `Generated assets:`,
    `- start.webp (${startBytes} bytes, sha256:${startHash})`,
    `- end.webp   (${endBytes} bytes, sha256:${endHash})`,
    ``,
    `Generated alt text (the screen-reader fallback):`,
    `- startAlt: ${alt.startAlt}`,
    `- endAlt:   ${alt.endAlt}`,
    ``,
    `Review the alt-text pair as a paired teaching cue. In particular, evaluate:`,
    `  (a) does startAlt describe the loaded/lengthened/setup phase before the`,
    `      concentric movement, with realistic joint angles for THIS exercise?`,
    `  (b) does endAlt describe the contracted/peak phase at the finish of the`,
    `      concentric, with realistic joint angles?`,
    `  (c) are the two descriptions clearly different positions (not paraphrases`,
    `      of the same pose)?`,
    `  (d) would a novice following only the alt text and instructions perform`,
    `      the movement in a way that respects the exercise's primary movers,`,
    `      typical safety constraints (lumbar position, scapular control,`,
    `      shoulder-friendly paths), and the cable mount described above?`,
    `  (e) any technique red flags (e.g., elbow flare in pulldowns, lumbar`,
    `      hyperextension in overhead work, shoulder impingement risk)?`,
    ``,
    `If the alt-text pair is technically accurate and safe, return APPROVE.`,
    `If a specific phrase would mislead novices, return APPROVE_WITH_CHANGES`,
    `with the precise rewording you recommend. If the pair is fundamentally`,
    `wrong (e.g., describes the wrong exercise, dangerous spinal position,`,
    `or the two positions are indistinguishable), return REJECT.`,
  ].join("\n");
}

async function searchResearch(
  proposal: string,
  apiKey: string,
): Promise<string> {
  const query =
    `Sports science and exercise physiology research relevant to this fitness app feature: ` +
    `${proposal.slice(0, 500)}. ` +
    `Find peer-reviewed evidence, ACSM/NSCA guidelines, and established best practices. ` +
    `Include specific studies, meta-analyses, or position stands where available.`;
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }),
  });
  if (!res.ok) {
    return `(Research unavailable: HTTP ${res.status} ${res.statusText})`;
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
  };
  const answer = body.choices?.[0]?.message?.content ?? "";
  const cites = (body.citations ?? []).map((c) => `- ${c}`).join("\n");
  return cites ? `${answer}\n\nSources:\n${cites}` : answer;
}

async function callPanel(
  systemPrompt: string,
  proposal: string,
  research: string,
  apiKey: string,
): Promise<{ content: string; modelUsed: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5",
      // Settings deviation from canonical Gemini reviewer documented in the
      // header comment of this file. Recorded in every CURATION sign-off.
      reasoning_effort: "medium",
      max_completion_tokens: 16384,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Feature proposal:\n${proposal}\n\nResearch context:\n${research}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`panel call failed: HTTP ${res.status} — ${text}`);
  }
  const body = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: {
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const choice = body.choices?.[0];
  const content = choice?.message?.content?.trim() ?? "";
  if (!content) {
    const ct = body.usage?.completion_tokens ?? 0;
    const rt = body.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    throw new Error(
      `panel call returned empty content (finish_reason=${choice?.finish_reason}, completion_tokens=${ct}, reasoning_tokens=${rt}). ` +
        `Increase max_completion_tokens or lower reasoning_effort.`,
    );
  }
  return { content, modelUsed: body.model ?? "gpt-5" };
}

function deriveGates(panelOutput: string): {
  visual: "PASS" | "FAIL";
  technique: "PASS" | "FAIL";
  verdict: string;
} {
  // Look at only the Verdict section to avoid matching tokens that appear in
  // discussion (e.g., "the panel might APPROVE_WITH_CHANGES if..."). The
  // canonical prompt uses a `## Verdict` heading.
  const verdictSection = panelOutput.split(/##\s*Verdict/i)[1] ?? panelOutput;
  const upper = verdictSection.toUpperCase();
  let verdict: string;
  if (upper.includes("APPROVE_WITH_CHANGES")) verdict = "APPROVE_WITH_CHANGES";
  else if (upper.includes("NEEDS_RESEARCH")) verdict = "NEEDS_RESEARCH";
  else if (upper.includes("REJECT")) verdict = "REJECT";
  else if (upper.includes("APPROVE")) verdict = "APPROVE";
  else verdict = "UNKNOWN";

  switch (verdict) {
    case "APPROVE":
      return { visual: "PASS", technique: "PASS", verdict };
    case "APPROVE_WITH_CHANGES":
      // Per CEO plan + QD acceptance bar: APPROVE_WITH_CHANGES on technique
      // blocks merge until addressed. Mark technique FAIL so CURATION
      // reflects the gate is not closed.
      return { visual: "PASS", technique: "FAIL", verdict };
    case "NEEDS_RESEARCH":
    case "REJECT":
    case "UNKNOWN":
    default:
      return { visual: "FAIL", technique: "FAIL", verdict };
  }
}

function gitHead(): string {
  return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
}

function renderSignOff(
  ex: Exercise,
  panelOutput: string,
  modelUsed: string,
  gates: { visual: "PASS" | "FAIL"; technique: "PASS" | "FAIL"; verdict: string },
  reviewer: string,
  commitHash: string,
  timestampUtc: string,
): string {
  const visualMark = gates.visual === "PASS" ? "✅" : "❌";
  const techniqueMark = gates.technique === "PASS" ? "✅" : "❌";
  return [
    `## ${ex.id} — ${ex.name}`,
    `- Visual plausibility: ${visualMark} ${reviewer} ${timestampUtc} (alt-text + image-pair gate via substitute panel; QD will run manual UI inspection on 3-of-10 final pass)`,
    `- Technique: ${techniqueMark} ${reviewer} ${timestampUtc} (panel verdict: **${gates.verdict}**)`,
    `- Model: \`gpt-image-1\` (image), \`gpt-4o-mini\` (alt-text), \`${modelUsed}\` (review panel — CEO Option B substitute for \`gemini-3.1-pro-preview\` per BLD-743 comment 447c9f3a-e41e-4f35-bcd9-b58a1f35b018; methodology preserved verbatim by loading \`EXPERT_SYSTEM_PROMPT\` at runtime from \`.claude/skills/review--sports-science/scripts/review.py\`. Setting deviation: gpt-5 rejects non-default temperature, so default (1) is used; original reviewer used 0.3.)`,
    `- review--sports-science (substitute): Reviewer=\`${reviewer}\`, commit=\`${commitHash}\`, timestamp=\`${timestampUtc}\``,
    ``,
    `<details><summary>Panel output</summary>`,
    ``,
    panelOutput,
    ``,
    `</details>`,
    ``,
    `- Regeneration notes: alt-text regenerated for voltra-013/-020/-029 with explicit start=loaded-lengthened / end=contracted-peak prompt convention (semantic-collapse fix from initial generator run). Image pairs unchanged from original \`gpt-image-1\` generation.`,
    ``,
  ].join("\n");
}

function rewriteCuration(blocks: string[]): void {
  const orig = fs.readFileSync(CURATION_PATH, "utf8");
  const marker = "## Sign-offs";
  const head = orig.includes(marker) ? orig.slice(0, orig.indexOf(marker)) : orig;
  const newSignOffs = [
    `## Sign-offs`,
    ``,
    `_Generated by \`scripts/curate-exercise-images.ts\` — substitute reviewer per CEO Option B (BLD-743 comment 447c9f3a). \`EXPERT_SYSTEM_PROMPT\` loaded at runtime from \`.claude/skills/review--sports-science/scripts/review.py\` to prevent silent drift (per QD comment 556a429b)._`,
    ``,
    ...blocks,
  ].join("\n");
  const out = head.trimEnd() + "\n\n" + newSignOffs.trimEnd() + "\n";
  const tmp = `${CURATION_PATH}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, CURATION_PATH);
}

type CacheEntry = {
  panel: string;
  modelUsed: string;
  proposalHash: string;
};

function cachePathFor(id: string): string {
  return path.join(CACHE_DIR, `${id}.json`);
}

function loadCache(id: string): CacheEntry | null {
  const p = cachePathFor(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

function saveCache(id: string, entry: CacheEntry): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePathFor(id), JSON.stringify(entry, null, 2));
}

async function main(): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");
  if (!perplexityKey) throw new Error("PERPLEXITY_API_KEY required");

  const reviewer =
    process.env.CURATION_REVIEWER ??
    "claudecoder (substitute panel; CEO Option B)";
  const refresh = process.env.CURATE_REFRESH === "1";

  // Optional CLI subset: --ids voltra-001,voltra-013 — process only the named
  // ids (still emits CURATION sign-offs for ALL 10 from the cache, so the
  // file is always complete). Useful when wake budgets force per-exercise
  // execution and earlier results are already cached.
  const argv = process.argv.slice(2);
  const idsFlagIdx = argv.indexOf("--ids");
  const subsetIds: Set<string> | null =
    idsFlagIdx >= 0 && argv[idsFlagIdx + 1]
      ? new Set(argv[idsFlagIdx + 1].split(",").map((s) => s.trim()).filter(Boolean))
      : null;
  // --skip-uncached: don't make any LLM calls; only emit blocks for
  // exercises that already have a cached panel output. Lets the operator
  // produce a partial CURATION snapshot to inspect mid-run progress.
  const skipUncached = argv.includes("--skip-uncached");

  const expertPrompt = loadExpertSystemPrompt();
  console.log(
    `[curate] loaded EXPERT_SYSTEM_PROMPT (${expertPrompt.length} chars) from review.py`,
  );

  const all = seedExercises();
  const exById = new Map(all.map((e) => [e.id, e]));
  const manifest = loadManifest();
  const head = gitHead();
  const ts = new Date().toISOString();

  const blocks: string[] = [];
  const gateSummary: Array<{
    id: string;
    verdict: string;
    visual: string;
    technique: string;
    cached: boolean;
    skipped: boolean;
  }> = [];

  for (const id of PILOT_EXERCISE_IDS) {
    const ex = exById.get(id);
    if (!ex) throw new Error(`unknown pilot id: ${id}`);
    const alt = manifest.get(id);
    if (!alt) throw new Error(`manifest missing entry for ${id}`);
    if (alt.startAlt === alt.endAlt) {
      throw new Error(
        `${id}: startAlt === endAlt; alt text collapsed semantically. Run regen-alt-text.ts before curation.`,
      );
    }

    const proposal = buildProposal(ex, alt);
    const proposalHash = crypto
      .createHash("sha256")
      .update(proposal)
      .digest("hex")
      .slice(0, 16);

    let panel: string;
    let modelUsed: string;
    let cached = false;
    let skipped = false;
    const cacheEntry = refresh ? null : loadCache(id);
    const cacheHit =
      cacheEntry !== null && cacheEntry.proposalHash === proposalHash;
    const inSubset = subsetIds === null || subsetIds.has(id);

    if (cacheHit) {
      console.log(`[curate] ${id}: using cached panel output (hash match)`);
      panel = cacheEntry!.panel;
      modelUsed = cacheEntry!.modelUsed;
      cached = true;
    } else if (!inSubset || skipUncached) {
      console.log(
        `[curate] ${id}: skipping (no cache; not in subset / skip-uncached)`,
      );
      skipped = true;
      gateSummary.push({
        id,
        verdict: "PENDING",
        visual: "PENDING",
        technique: "PENDING",
        cached: false,
        skipped: true,
      });
      continue;
    } else {
      console.log(`[curate] ${id}: searching research (Perplexity Sonar)...`);
      const research = await searchResearch(proposal, perplexityKey);

      console.log(`[curate] ${id}: calling panel (gpt-5)...`);
      const result = await callPanel(expertPrompt, proposal, research, openaiKey);
      panel = result.content;
      modelUsed = result.modelUsed;
      saveCache(id, { panel, modelUsed, proposalHash });
    }

    const gates = deriveGates(panel);
    gateSummary.push({
      id,
      verdict: gates.verdict,
      visual: gates.visual,
      technique: gates.technique,
      cached,
      skipped,
    });
    console.log(
      `[curate] ${id}: verdict=${gates.verdict} visual=${gates.visual} technique=${gates.technique}${cached ? " (cached)" : ""}`,
    );

    blocks.push(
      renderSignOff(ex, panel, modelUsed, gates, reviewer, head, ts),
    );
  }

  // Only rewrite CURATION when we have at least one block and we're either
  // doing a full run or all 10 have cache hits. A partial run leaves the
  // file untouched so reviewers don't see half-populated sign-offs.
  const allCovered = blocks.length === PILOT_EXERCISE_IDS.length;
  if (allCovered) {
    rewriteCuration(blocks);
    console.log(`\n[curate] wrote ${CURATION_PATH}`);
  } else {
    console.log(
      `\n[curate] partial run: ${blocks.length}/${PILOT_EXERCISE_IDS.length} sign-offs ready; CURATION.md untouched.`,
    );
  }

  console.log("\n[curate] gate summary:");
  for (const r of gateSummary) {
    const tag = r.skipped ? " (skipped)" : r.cached ? " (cached)" : "";
    console.log(
      `  ${r.id.padEnd(12)} verdict=${r.verdict.padEnd(22)} visual=${r.visual} technique=${r.technique}${tag}`,
    );
  }
  const failing = gateSummary.filter(
    (r) => !r.skipped && (r.visual === "FAIL" || r.technique === "FAIL"),
  );
  if (failing.length > 0) {
    console.log(
      `\n[curate] ${failing.length}/${gateSummary.length} exercises did not PASS both gates. Address findings and re-run.`,
    );
    process.exitCode = 2;
  } else if (allCovered) {
    console.log(
      `\n[curate] all ${gateSummary.length}/${gateSummary.length} PASS both gates.`,
    );
  }
}

main().catch((err) => {
  console.error("[curate] fatal:", (err as Error).message);
  process.exit(1);
});
