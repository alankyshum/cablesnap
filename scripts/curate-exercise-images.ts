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
import type { Exercise, MountPosition } from "../lib/types";

/**
 * Seed data may still carry the legacy `mount_position` field that BLD-771
 * removed from the canonical Exercise type. Extend locally so downstream
 * access is type-safe without broad `Record<string, unknown>` casts.
 */
type SeedExercise = Exercise & { mount_position?: MountPosition | null };

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.generated.ts");
const MANIFEST_ROUND_PATH = path.join(ASSET_DIR, "manifest.round.json");
const CURATION_PATH = path.join(ASSET_DIR, "CURATION.md");
const REVIEW_PY_PATH = path.join(
  ROOT,
  ".claude/skills/review--sports-science/scripts/review.py",
);
const CACHE_DIR = path.join(ROOT, ".cache/curate");

/**
 * Frozen safety-keyword list for the deterministic discriminator.
 *
 * BLD-743 — CEO Option A (comment 90c5899b) ratifies QD's Guardrail #1:
 * a deterministic regex-based discriminator over the panel's "Safety
 * Concerns" section, NOT an LLM classifier (no second-order judgement
 * calls). Case-insensitive whole-word matching against this list, plus
 * ratings tokens {LOW, MEDIUM, HIGH, CRITICAL} (NONE → not a hit).
 *
 * The list is FROZEN at this commit. Any expansion requires a fresh CEO
 * sign-off (record the addition in CURATION.md alongside the link to
 * the new approval). Do NOT mutate this array via tooling — it is a
 * governance constant.
 */
const SAFETY_KEYWORDS: readonly string[] = Object.freeze([
  "risk",
  "injury",
  "danger",
  "unsafe",
  "avoid",
  "harm",
  "strain",
  "compress",
  "impinge",
  "herniat",
  "tear",
  "sprain",
  "hyperextend",
  "overload",
  "pinch",
  "nerve",
  "disc",
  "lumbar",
  "shear",
  "instabil",
  "dislocat",
  "subluxat",
  "contraindicat",
]);

/**
 * (Severity tiering supersedes the prior `NON_NONE_RATINGS` constant —
 * `classifySafety` now distinguishes MEDIUM/HIGH/CRITICAL from LOW
 * inline via word-boundary regex; see `SafetyClass` below.)
 */

export type SafetyClass = "SAFETY_HIGH" | "SAFETY_LOW" | "REFINEMENT" | "N/A";

/**
 * Extract the verbatim "Safety Concerns" section from a panel output.
 * Returns the empty string if the section is missing.
 *
 * The expert-system prompt mandates a `Safety Concerns` heading; we accept
 * `## Safety Concerns`, `Safety Concerns:`, or bare `Safety Concerns` and
 * stop at the next heading-like line (any line starting with the next
 * top-level section name from the prompt: Evidence-Based Recommendations,
 * Engagement Psychology, Verdict, or any `##`-prefixed heading).
 */
export function extractSafetySection(panel: string): string {
  const re = /(^|\n)\s*(?:#{1,6}\s*)?Safety Concerns\s*:?\s*\n/i;
  const m = re.exec(panel);
  if (!m) return "";
  const start = m.index + m[0].length;
  const tail = panel.slice(start);
  const stopRe =
    /\n\s*(?:#{1,6}\s*)?(?:Evidence-Based Recommendations|Engagement Psychology|Verdict)\b|\n#{1,6}\s/i;
  const stop = stopRe.exec(tail);
  const body = stop ? tail.slice(0, stop.index) : tail;
  return body.trim();
}

/**
 * Severity-tiered safety/refinement discriminator (BLD-743 — CEO ruling
 * comment 0e827b56, ratifying QD's spec from comment 50965182).
 *
 * Returns one of four classes:
 *   - SAFETY_HIGH  — section contains a MEDIUM/HIGH/CRITICAL severity
 *                    rating (matched case-sensitively against the
 *                    prompt's uppercase grammar; lowercase prose words
 *                    like "too high" must NOT trigger). Catches
 *                    `LOW to MEDIUM` correctly because the bare uppercase
 *                    `MEDIUM` token is present. BLOCKS merge when paired
 *                    with APPROVE_WITH_CHANGES.
 *   - SAFETY_LOW   — only LOW rating(s) are present, OR a SAFETY_KEYWORD
 *                    is present without an explicit rating. ALLOWED
 *                    through the gate as a refinement-with-coaching-note.
 *   - REFINEMENT   — section is non-empty but has no keywords and no
 *                    severity ratings (pure stylistic feedback).
 *   - N/A          — section absent. Fail-closed: gateBlocks() treats
 *                    N/A on AWC as blocking (panel didn't follow format).
 *
 * Edge cases explicitly handled (CEO + QD asked for unit-test fixtures):
 *   - "LOW to MEDIUM"  → SAFETY_HIGH (MEDIUM token present)
 *   - "NONE–LOW"       → SAFETY_LOW  (no MEDIUM+, has LOW + likely keyword)
 *   - "Severity: NONE" → REFINEMENT  (NONE rating ignored; if no keywords
 *                                     either, drops through to REFINEMENT)
 */
export function classifySafety(panel: string): SafetyClass {
  const section = extractSafetySection(panel);
  if (!section || section.trim() === "") return "N/A";

  // Strip explicit "NONE" tokens before scanning so they don't false-match
  // any future tooling that looks for severity tokens broadly.
  // Severity-rating tokens MUST match the prompt's uppercase grammar
  // (LOW/MEDIUM/HIGH/CRITICAL/NONE). Case-insensitive matching produces
  // false positives on prose words like "too high" or "too low"; observed
  // with voltra-029 (BLD-743 round-2 follow-up). The canonical
  // EXPERT_SYSTEM_PROMPT in review.py emits ratings in uppercase.
  const hasMediumPlus = /\b(?:MEDIUM|HIGH|CRITICAL)\b/.test(section);
  if (hasMediumPlus) return "SAFETY_HIGH";

  const hasLow = /\bLOW\b/.test(section);
  const keywordRe = new RegExp(
    `\\b(?:${SAFETY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\w*\\b`,
    "i",
  );
  const hasKeyword = keywordRe.test(section);

  // LOW rating with or without keyword → SAFETY_LOW (the panel flagged
  // a real but minor risk).
  if (hasLow) return "SAFETY_LOW";

  // Keyword without explicit rating → conservatively classify SAFETY_LOW
  // (panel mentioned a risk vocabulary item even if not severity-rated).
  if (hasKeyword) return "SAFETY_LOW";

  // Non-empty section with no risks named: pure REFINEMENT.
  return "REFINEMENT";
}

type RoundFile = { round: number; updatedAt: string; notes?: string };

function loadManifestRound(): RoundFile {
  if (!fs.existsSync(MANIFEST_ROUND_PATH)) {
    throw new Error(
      `[curate] missing ${MANIFEST_ROUND_PATH}. Create it with {"round": 1, "updatedAt": "<iso>"} or run apply-panel-rewrites.ts to bump it.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(MANIFEST_ROUND_PATH, "utf8"));
  if (typeof raw.round !== "number" || !Number.isInteger(raw.round) || raw.round < 0) {
    throw new Error(
      `[curate] ${MANIFEST_ROUND_PATH}: round must be a non-negative integer; got ${JSON.stringify(raw.round)}`,
    );
  }
  return raw as RoundFile;
}

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

type Manifest = Map<string, { startAlt: string; endAlt: string; safetyNote?: string }>;

function loadManifest(): Manifest {
  const src = fs.readFileSync(MANIFEST_PATH, "utf8");
  const out: Manifest = new Map();
  const blockRe =
    /"([^"]+)":\s*\{[^}]*?startAlt:\s*("(?:\\.|[^"\\])*")[^}]*?endAlt:\s*("(?:\\.|[^"\\])*")[^}]*?\}/gs;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    // Extract safetyNote if present in the block
    const block = m[0];
    const safetyMatch = block.match(/safetyNote:\s*("(?:\\.|[^"\\])*")/);
    const safetyNote = safetyMatch ? (JSON.parse(safetyMatch[1]) as string) : undefined;
    out.set(m[1], {
      startAlt: JSON.parse(m[2]) as string,
      endAlt: JSON.parse(m[3]) as string,
      ...(safetyNote ? { safetyNote } : {}),
    });
  }
  return out;
}

function sha256(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function buildProposal(
  ex: SeedExercise,
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
    `- mount_position: ${ex.mount_position ?? "any"}`,
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

function deriveGates(
  panelOutput: string,
  safetyClass: SafetyClass,
): {
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

  // Single source of truth: the gate decision is gateBlocks(). The visual
  // marker is informational; the binding decision is the curation gate
  // line in the rendered sign-off. We mirror gateBlocks here so the
  // ✅/❌ glyphs in CURATION agree with the merge decision.
  const blocking = gateBlocks(verdict, safetyClass);
  if (!blocking) {
    return { visual: "PASS", technique: "PASS", verdict };
  }
  switch (verdict) {
    case "APPROVE_WITH_CHANGES":
      // Blocking AWC means safety-classed AWC. Visual is fine; technique
      // fails because the panel flagged real safety concerns.
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

/**
 * Single source of truth for the merge-blocking rule.
 *
 * BLD-743 — CEO Option A (comment 90c5899b) ratifies QD's Guardrail #2
 * verbatim: a verdict blocks the gate if it is REJECT, NEEDS_RESEARCH,
 * UNKNOWN, OR if it is APPROVE_WITH_CHANGES classified as SAFETY.
 * APPROVE_WITH_CHANGES classified as REFINEMENT is allowed; pure APPROVE
 * is allowed.
 *
 * `check-curation-gate.ts` re-exports this function so the pre-push hook
 * and the Bundle Gate CI step run the *same* logic against the committed
 * CURATION.md — no second implementation, no drift.
 */
export function gateBlocks(
  verdict: string,
  safetyClass: SafetyClass,
  opts?: { hasSafetyNote?: boolean },
): boolean {
  const v = verdict.toUpperCase().trim();
  if (v === "REJECT" || v === "NEEDS_RESEARCH" || v === "UNKNOWN") return true;
  if (v === "APPROVE_WITH_CHANGES") {
    // Severity tiering (CEO ruling 0e827b56, QD spec 50965182):
    //   - SAFETY_HIGH  → BLOCK (MEDIUM/HIGH/CRITICAL named risk)
    //                    UNLESS a safetyNote is present in the manifest
    //                    (BLD-843: safetyNote mitigates the concern in-UI)
    //   - SAFETY_LOW   → PASS  (LOW-rated risk or unrated keyword;
    //                            ship as-is with coaching-note follow-up)
    //   - REFINEMENT   → PASS  (no risks named, pure stylistic feedback)
    //   - N/A          → BLOCK (panel did not emit Safety Concerns section
    //                            — fail-closed; verdict not trustworthy)
    if (safetyClass === "N/A") return true;
    if (safetyClass === "SAFETY_HIGH") {
      return !opts?.hasSafetyNote;
    }
    return false;
  }
  return false;
}

function renderSignOff(
  ex: SeedExercise,
  panelOutput: string,
  modelUsed: string,
  gates: { visual: "PASS" | "FAIL"; technique: "PASS" | "FAIL"; verdict: string },
  reviewer: string,
  commitHash: string,
  timestampUtc: string,
  round: number,
  safetyClass: SafetyClass,
): string {
  const visualMark = gates.visual === "PASS" ? "✅" : "❌";
  const techniqueMark = gates.technique === "PASS" ? "✅" : "❌";
  const blocking = gateBlocks(gates.verdict, safetyClass);
  const gateMark = blocking ? "❌ BLOCK" : "✅ PASS";
  const safetySection = extractSafetySection(panelOutput);
  const safetyExcerpt =
    safetySection.length > 0
      ? safetySection
      : "_(panel did not emit a Safety Concerns section — classified N/A and fail-closed BLOCK on AWC)_";
  return [
    `## ${ex.id} — ${ex.name}`,
    `- Round: **${round}**`,
    `- Curation gate: ${gateMark} (verdict=\`${gates.verdict}\`, safety-class=\`${safetyClass}\` — \`gateBlocks()\` from \`scripts/curate-exercise-images.ts\`)`,
    `- Visual plausibility: ${visualMark} ${reviewer} ${timestampUtc} (alt-text + image-pair gate via substitute panel; QD will run manual UI inspection on 3-of-10 final pass)`,
    `- Technique: ${techniqueMark} ${reviewer} ${timestampUtc} (panel verdict: **${gates.verdict}**)`,
    `- Model: \`gpt-image-1\` (image), \`gpt-4o-mini\` (alt-text), \`${modelUsed}\` (review panel — CEO Option B substitute for \`gemini-3.1-pro-preview\` per BLD-743 comment 447c9f3a-e41e-4f35-bcd9-b58a1f35b018; methodology preserved verbatim by loading \`EXPERT_SYSTEM_PROMPT\` at runtime from \`.claude/skills/review--sports-science/scripts/review.py\`. Setting deviations: \`temperature\` defaulted (1) — gpt-5 rejects non-default; \`reasoning_effort=medium\`; \`max_completion_tokens=16384\`.)`,
    `- review--sports-science (substitute): Reviewer=\`${reviewer}\`, commit=\`${commitHash}\`, timestamp=\`${timestampUtc}\``,
    ``,
    `<details><summary>Safety Concerns (verbatim, classifier input)</summary>`,
    ``,
    safetyExcerpt,
    ``,
    `</details>`,
    ``,
    `<details><summary>Panel output (full)</summary>`,
    ``,
    panelOutput,
    ``,
    `</details>`,
    ``,
    `- Regeneration notes: alt-text round ${round} (panel-recommended rewrites applied via \`scripts/apply-panel-rewrites.ts\`). Image pairs unchanged from original \`gpt-image-1\` generation.`,
    ``,
  ].join("\n");
}

function rewriteCuration(blocks: string[], roundFile: RoundFile): void {
  const orig = fs.readFileSync(CURATION_PATH, "utf8");
  const marker = "## Sign-offs";
  const head = orig.includes(marker) ? orig.slice(0, orig.indexOf(marker)) : orig;
  const newSignOffs = [
    `## Sign-offs`,
    ``,
    `_Generated by \`scripts/curate-exercise-images.ts\` — substitute reviewer per CEO Option B (BLD-743 comment 447c9f3a). \`EXPERT_SYSTEM_PROMPT\` loaded at runtime from \`.claude/skills/review--sports-science/scripts/review.py\` to prevent silent drift (per QD comment 556a429b)._`,
    ``,
    `**Curation gate (BLD-743 — CEO Option C with severity tiering, comment 0e827b56; QD spec 50965182):**`,
    `- Manifest alt-text round: **${roundFile.round}** (\`manifest.round.json\` updated ${roundFile.updatedAt})`,
    `- Discriminator: severity-tiered regex over the panel's "Safety Concerns" section. Tiers: \`SAFETY_HIGH\` (MEDIUM/HIGH/CRITICAL token), \`SAFETY_LOW\` (LOW token or unrated \`SAFETY_KEYWORDS\` mention), \`REFINEMENT\` (non-empty, no risk named), \`N/A\` (section absent). See \`scripts/curate-exercise-images.ts\` \`classifySafety()\`.`,
    `- Gate logic: \`gateBlocks(verdict, safetyClass)\` — blocks on REJECT, NEEDS_RESEARCH, UNKNOWN, or APPROVE_WITH_CHANGES with \`SAFETY_HIGH\`/\`N/A\`. APPROVE_WITH_CHANGES with \`SAFETY_LOW\` or \`REFINEMENT\` is allowed (ship as-is; coaching-note follow-ups for SAFETY_LOW tracked in \`coachingNotes\` field).`,
    `- Verifier: \`scripts/check-curation-gate.ts\` (wired into \`.husky/pre-push\` and the Bundle Gate CI step).`,
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
  /**
   * Manifest round at the time the panel was called. Used by the
   * round lock-in assertion (BLD-743 Guardrail #4): if a cache entry's
   * round disagrees with the current `manifest.round.json`, we refuse to
   * emit a CURATION block from it (force a fresh panel call).
   */
  round?: number;
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

  const roundFile = loadManifestRound();
  console.log(
    `[curate] manifest round=${roundFile.round} (updated ${roundFile.updatedAt})`,
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
    safetyClass: SafetyClass;
    blocking: boolean;
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
    if (alt.safetyNote && alt.safetyNote.length > 300) {
      console.warn(
        `[curate] WARNING: ${id} safetyNote is ${alt.safetyNote.length} chars (>300). Consider shortening.`,
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
      // Round lock-in (Guardrail #4): if a cached entry is missing the
      // `round` stamp (legacy) we adopt the current round on first re-emit
      // and update the cache. If it's present and disagrees, refuse to
      // emit — operator must `CURATE_REFRESH=1` to re-call.
      if (cacheEntry!.round === undefined) {
        console.log(
          `[curate] ${id}: cache predates round-stamping; stamping round=${roundFile.round}`,
        );
        saveCache(id, {
          panel,
          modelUsed,
          proposalHash,
          round: roundFile.round,
        });
      } else if (cacheEntry!.round !== roundFile.round) {
        // Hash matched (alt text unchanged for THIS exercise) but the
        // global manifest round was bumped because OTHER exercises in
        // the same batch had alt-text changes. The cached panel output
        // is still valid for this exercise — re-stamp the cache to the
        // new round and continue. (BLD-743 — supports CEO/QD severity-
        // tiering follow-up where only voltra-001/-013/-020 needed
        // alt-text rewrites in round 2.)
        console.log(
          `[curate] ${id}: hash match; re-stamping cache round ${cacheEntry!.round} → ${roundFile.round} (alt text unchanged)`,
        );
        saveCache(id, {
          panel,
          modelUsed,
          proposalHash,
          round: roundFile.round,
        });
      }
    } else if (!inSubset || skipUncached) {
      console.log(
        `[curate] ${id}: skipping (no cache; not in subset / skip-uncached)`,
      );
      skipped = true;
      gateSummary.push({
        id,
        verdict: "PENDING",
        safetyClass: "N/A",
        blocking: true,
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
      saveCache(id, {
        panel,
        modelUsed,
        proposalHash,
        round: roundFile.round,
      });
    }

    const safetyClass = classifySafety(panel);
    const gates = deriveGates(panel, safetyClass);
    const blocking = gateBlocks(gates.verdict, safetyClass);
    gateSummary.push({
      id,
      verdict: gates.verdict,
      safetyClass,
      blocking,
      visual: gates.visual,
      technique: gates.technique,
      cached,
      skipped,
    });
    console.log(
      `[curate] ${id}: verdict=${gates.verdict} safety=${safetyClass} block=${blocking}${cached ? " (cached)" : ""}`,
    );

    blocks.push(
      renderSignOff(
        ex,
        panel,
        modelUsed,
        gates,
        reviewer,
        head,
        ts,
        roundFile.round,
        safetyClass,
      ),
    );
  }

  // Only rewrite CURATION when we have at least one block and we're either
  // doing a full run or all 10 have cache hits. A partial run leaves the
  // file untouched so reviewers don't see half-populated sign-offs.
  const allCovered = blocks.length === PILOT_EXERCISE_IDS.length;
  if (allCovered) {
    rewriteCuration(blocks, roundFile);
    console.log(`\n[curate] wrote ${CURATION_PATH}`);
  } else {
    console.log(
      `\n[curate] partial run: ${blocks.length}/${PILOT_EXERCISE_IDS.length} sign-offs ready; CURATION.md untouched.`,
    );
  }

  console.log("\n[curate] gate summary:");
  for (const r of gateSummary) {
    const tag = r.skipped ? " (skipped)" : r.cached ? " (cached)" : "";
    const blockTag = r.blocking ? "BLOCK" : "PASS ";
    console.log(
      `  ${r.id.padEnd(12)} verdict=${r.verdict.padEnd(22)} safety=${r.safetyClass.padEnd(10)} gate=${blockTag}${tag}`,
    );
  }
  const blocking = gateSummary.filter((r) => !r.skipped && r.blocking);
  if (blocking.length > 0) {
    console.log(
      `\n[curate] ${blocking.length}/${gateSummary.length} exercises BLOCK the curation gate. Address findings and re-run.`,
    );
    process.exitCode = 2;
  } else if (allCovered) {
    console.log(
      `\n[curate] all ${gateSummary.length}/${gateSummary.length} PASS the curation gate.`,
    );
  }
}

// Only run main() when invoked as a CLI entry point. Importing this module
// (e.g., from `scripts/check-curation-gate.ts` to reuse `gateBlocks()` —
// QD Guardrail #2: single source of truth) must NOT trigger a panel run.
const invokedAsScript =
  require.main === module ||
  (process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(__filename));
if (invokedAsScript) {
  main().catch((err) => {
    console.error("[curate] fatal:", (err as Error).message);
    process.exit(1);
  });
}
