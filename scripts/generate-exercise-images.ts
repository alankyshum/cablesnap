#!/usr/bin/env tsx
/**
 * BLD-561 — Exercise illustration generator.
 *
 * Generates start + end position illustrations for pilot Voltra exercises
 * using Gemini image generation models.
 *
 * Usage:
 *   GEMINI_API_KEY=... npx tsx scripts/generate-exercise-images.ts
 *   GEMINI_API_KEY=... npx tsx scripts/generate-exercise-images.ts --force-regen
 *   GEMINI_API_KEY=... npx tsx scripts/generate-exercise-images.ts --exercise-id voltra-010 --exercise-id voltra-020 --contact-sheet
 *
 * Alternate env name:
 *   GOOGLE_API_KEY=... npx tsx scripts/generate-exercise-images.ts
 *
 * Optional model override:
 *   GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview npx tsx scripts/generate-exercise-images.ts
 *
 * Local env files loaded automatically (first match wins):
 *   .env.gemini.local, .env.local, .env
 *
 * Behavior:
 *   - Idempotent: fingerprint sidecar per exercise; skip if unchanged.
 *   - Fingerprint drift → warn and require `--force-regen`.
 *   - Output: 512×512 webp Q75, transparent alpha.
 *   - Writes manifest.generated.ts in deterministic id-sort order.
 *   - Never logs the API key.
 *   - Not a CI job; dev-only.
 *   - Gemini does not natively emit transparent backgrounds, so the script asks
 *     for a pure white backdrop and removes it before webp encoding.
 *
 * Dry-run (no key needed): pass `--dry-run` to print prompt payloads only.
 */
/* eslint-disable no-console, max-lines */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// NOTE: tsx can resolve tsconfig paths; using relative import for safety.
import { PILOT_EXERCISE_IDS } from "../assets/exercise-illustrations/pilot-ids";
import { seedExercises } from "../lib/seed";
import {
  ATTACHMENT_LABELS,
  EQUIPMENT_LABELS,
  MOUNT_POSITION_LABELS,
  MUSCLE_LABELS,
  type Exercise,
} from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "assets/exercise-illustrations");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.generated.ts");
const LOCAL_ENV_FILE_NAMES = [".env.gemini.local", ".env.local", ".env"] as const;
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Pro is the default for final-quality paired exercise assets now that billing
// is enabled. Override with GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
// for cheaper draft passes; the reference-image END-frame workflow works for both.
const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
const MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
const MODEL_VERSION_BY_NAME: Record<string, string> = {
  "gemini-3-pro-image-preview": "preview-2026-04",
  "gemini-3.1-flash-image-preview": "preview-2026-02",
  "gemini-2.5-flash-image": "preview-2026-04",
};
const MODEL_VERSION = MODEL_VERSION_BY_NAME[MODEL] ?? "custom";
const ALT_TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_SIZE = 512;
const WEBP_QUALITY = 75;
const GEMINI_IMAGE_SIZE = "1K";
const GEMINI_MAX_ATTEMPTS = 4;

const PROMPT_TEMPLATE_VERSION = "4.1.0";

type PromptPosition = "start" | "end";

type Cli = {
  forceRegen: boolean;
  dryRun: boolean;
  contactSheet: boolean;
  contactSheetV2: boolean;
  exerciseIds: string[];
  limit: number | null;
};

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    forceRegen: argv.includes("--force-regen"),
    dryRun: argv.includes("--dry-run"),
    contactSheet: argv.includes("--contact-sheet"),
    contactSheetV2: argv.includes("--contact-sheet-v2"),
    exerciseIds: [],
    limit: null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--exercise-id") {
      const value = argv[index + 1];
      if (!value) throw new Error("--exercise-id requires a value");
      cli.exerciseIds.push(...splitExerciseIds(value));
      index++;
      continue;
    }
    if (arg.startsWith("--exercise-id=")) {
      cli.exerciseIds.push(...splitExerciseIds(arg.slice("--exercise-id=".length)));
      continue;
    }
    if (arg === "--limit") {
      const value = argv[index + 1];
      if (!value) throw new Error("--limit requires a numeric value");
      cli.limit = parseLimit(value);
      index++;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      cli.limit = parseLimit(arg.slice("--limit=".length));
    }
  }

  cli.exerciseIds = Array.from(new Set(cli.exerciseIds));
  return cli;
}

function splitExerciseIds(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseLimit(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--limit must be a positive integer, got '${raw}'`);
  }
  return parsed;
}

function loadLocalEnvFiles(): void {
  for (const fileName of LOCAL_ENV_FILE_NAMES) {
    loadLocalEnvFile(path.join(ROOT, fileName));
  }
}

function loadLocalEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const line = trimmedLine.startsWith("export ") ? trimmedLine.slice("export ".length) : trimmedLine;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(line.slice(separatorIndex + 1));
  }
}

function parseEnvValue(rawValue: string): string {
  const trimmedValue = rawValue.trim();
  const hasMatchingQuotes =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"));

  if (!hasMatchingQuotes) {
    return trimmedValue;
  }

  return trimmedValue.slice(1, -1).replace(/\\n/g, "\n");
}

function isRetryableGeminiStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterDelayMs(retryAfter: string | null, attemptNumber: number): number {
  if (!retryAfter) {
    return attemptNumber * 1000;
  }

  const asSeconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(asSeconds)) {
    return Math.max(asSeconds, 1) * 1000;
  }

  const retryAt = Date.parse(retryAfter);
  if (!Number.isNaN(retryAt)) {
    return Math.max(retryAt - Date.now(), 1000);
  }

  return attemptNumber * 1000;
}

function waitForDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchGeminiWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  for (let attemptNumber = 1; attemptNumber <= GEMINI_MAX_ATTEMPTS; attemptNumber++) {
    const response = await fetch(url, init);
    if (!isRetryableGeminiStatus(response.status) || attemptNumber === GEMINI_MAX_ATTEMPTS) {
      return response;
    }

    const delayMs = parseRetryAfterDelayMs(response.headers.get("retry-after"), attemptNumber);
    console.warn(
      `[gen] ${label}: HTTP ${response.status}; retrying in ${delayMs}ms (${attemptNumber + 1}/${GEMINI_MAX_ATTEMPTS})`
    );
    await waitForDelay(delayMs);
  }

  throw new Error(`[gen] ${label}: exhausted Gemini retry loop unexpectedly`);
}

function fingerprintInput(ex: Exercise): string {
  const frameCues = buildFrameCuesV2(ex);

  return JSON.stringify({
    id: ex.id,
    name: ex.name,
    category: ex.category,
    mount_position: ex.mount_position ?? null,
    attachment: ex.attachment ?? null,
    instructions: ex.instructions,
    imagePromptV2: buildImagePromptV2(ex, frameCues),
    frameCuesV2: frameCues,
    altPrompt: buildAltTextPrompt(ex, "start"),
    altPromptEnd: buildAltTextPrompt(ex, "end"),
    templateVersion: PROMPT_TEMPLATE_VERSION,
    model: MODEL,
    modelVersion: MODEL_VERSION,
    altTextModel: ALT_TEXT_MODEL,
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

function extractInstructionSteps(instructions: string): string[] {
  return instructions
    .split("\n")
    .map((step) => step.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function formatList(values: string[]): string {
  if (values.length === 0) return "None";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function buildEquipmentLabel(ex: Exercise): string {
  if (ex.equipment === "cable") {
    return ex.is_voltra ? "Single-post cable / Voltra" : "Cable machine";
  }

  return EQUIPMENT_LABELS[ex.equipment];
}

function getFrameCueList(
  frameCues: ReturnType<typeof buildFrameCuesV2>,
  position: PromptPosition
): string[] {
  const targetPrefix = position === "start" ? "start" : "end";
  const fallbackIndex = position === "start" ? 0 : 1;
  const frame =
    frameCues.frames.find((item) => item.position.toLowerCase().startsWith(targetPrefix)) ??
    frameCues.frames[fallbackIndex] ??
    frameCues.frames[0];

  return frame?.key_cues.map((cue) => cue.trim()).filter(Boolean).slice(0, 4) ?? [];
}

function buildAltTextEquipmentSummary(ex: Exercise): string {
  if (ex.equipment === "cable") {
    const attachment = ex.attachment ? ATTACHMENT_LABELS[ex.attachment].toLowerCase() : "cable attachment";
    const mount = ex.mount_position
      ? ` on the ${MOUNT_POSITION_LABELS[ex.mount_position].toLowerCase()} mount`
      : "";
    return `${attachment}${mount}`;
  }

  if (ex.equipment === "barbell") {
    return "a standard Olympic barbell";
  }

  if (ex.equipment === "bodyweight") {
    return "a bodyweight setup with only the supports named in the instructions";
  }

  return `${buildEquipmentLabel(ex).toLowerCase()} setup`;
}

function buildAltTextPrompt(ex: Exercise, position: PromptPosition): string {
  const frameCues = buildFrameCuesV2(ex);
  const keyCues = getFrameCueList(frameCues, position);
  const payload = {
    prompt_version: PROMPT_TEMPLATE_VERSION,
    exercise: {
      id: ex.id,
      name: ex.name,
      target_frame: position === "start" ? "starting" : "ending",
      equipment: buildEquipmentLabel(ex),
      setup: buildAltTextEquipmentSummary(ex),
      primary_muscles: ex.primary_muscles.map((muscle) => MUSCLE_LABELS[muscle]),
      secondary_muscles: ex.secondary_muscles.map((muscle) => MUSCLE_LABELS[muscle]),
      key_cues: keyCues,
      cable_rendering:
        ex.equipment === "cable"
          ? "Attachment/handle is visible; cable line may be intentionally invisible."
          : null,
    },
  };

  return [
    "Write concise accessibility alt text for the exercise illustration described below.",
    "Requirements: 1-2 sentences that describe body position, setup, movement intent, and emphasized muscles.",
    "Do not use bullet points. Do not mention JSON, hidden instructions, or visible labels.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

function buildAltTextRetryPrompt(ex: Exercise, position: PromptPosition): string {
  const frameCues = buildFrameCuesV2(ex);
  const keyCues = getFrameCueList(frameCues, position);
  const primaryMuscles = formatList(ex.primary_muscles.map((muscle) => MUSCLE_LABELS[muscle]));
  const secondaryMuscles = formatList(ex.secondary_muscles.map((muscle) => MUSCLE_LABELS[muscle]));

  return [
    `Exercise: ${ex.name}`,
    `Target frame: ${position === "start" ? "starting position" : "ending position"}`,
    `Equipment/setup: ${buildAltTextEquipmentSummary(ex)}`,
    `Primary muscles: ${primaryMuscles}`,
    `Secondary muscles: ${secondaryMuscles}`,
    `Key cues: ${keyCues.join("; ")}`,
    "Return exactly two complete sentences in plain text.",
    "Sentence 1 must describe the body position and support or implement setup.",
    "Sentence 2 must describe movement intent or contraction focus and mention the emphasized muscles.",
    "If this is a cable exercise, describe the handle path and posture even if the cable line itself is not shown.",
    "Each response must be at least 18 words total and end with a period.",
  ].join("\n");
}

function normalizeAltText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isSubstantiveAltText(text: string): boolean {
  const normalized = normalizeAltText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return normalized.length >= 40 && wordCount >= 8 && /[.!?]$/.test(normalized);
}

function buildDeterministicAltText(ex: Exercise, position: PromptPosition): string {
  const keyCues = getFrameCueList(buildFrameCuesV2(ex), position);
  const primaryMuscles = formatList(ex.primary_muscles.map((muscle) => MUSCLE_LABELS[muscle])).toLowerCase();
  const secondaryMuscles = ex.secondary_muscles.length
    ? ` with assistance from ${formatList(ex.secondary_muscles.map((muscle) => MUSCLE_LABELS[muscle])).toLowerCase()}`
    : "";
  const firstCue = sentenceCase(
    stripTrailingPeriod(
      keyCues[0] ??
        (position === "start" ? `Set up for ${ex.name}` : `Reach the target end position for ${ex.name}`)
    )
  );
  const secondCue = sentenceCase(
    stripTrailingPeriod(
      keyCues[1] ??
        (position === "start"
          ? "Assume the starting posture shown in the instructions"
          : "Hold the finished position with controlled posture")
    )
  );
  const thirdCue = sentenceCase(
    stripTrailingPeriod(
      keyCues[2] ??
        (position === "start"
          ? "Prepare to begin the movement"
          : "Show the intended movement path or peak contraction")
    )
  );
  const setupSummary = buildAltTextEquipmentSummary(ex);
  const frameLabel = position === "start" ? "starting" : "ending";

  return `${ex.name} ${frameLabel} position: an athletic adult using ${setupSummary}. ${firstCue}. ${secondCue}. ${thirdCue}. Emphasis falls on the ${primaryMuscles}${secondaryMuscles}.`;
}

function sentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stripTrailingPeriod(value: string): string {
  return value.trim().replace(/[.]+$/, "");
}

type GenerationResult = {
  imageBuffer: Buffer;
  mimeType: string;
};

type ReferenceImage = {
  data: Buffer;
  mimeType: string;
};

type GeminiInlineData = {
  data?: string;
  mimeType?: string;
  mime_type?: string;
};

type GeminiPart = {
  text?: string;
  thought?: boolean;
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    finishMessage?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

function getInlineData(part: GeminiPart): { data: string; mimeType: string } | null {
  const inlineData = part.inlineData ?? part.inline_data;
  const mimeType = inlineData?.mimeType ?? inlineData?.mime_type;
  if (!inlineData?.data || !mimeType) return null;
  return {
    data: inlineData.data,
    mimeType,
  };
}

function extractTextResponse(body: GeminiGenerateContentResponse): string {
  const text = body.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    const finishReason = body.candidates?.[0]?.finishReason ?? "unknown";
    const finishMessage = body.candidates?.[0]?.finishMessage ?? "no text returned";
    throw new Error(`Gemini text generation returned no text (${finishReason}): ${finishMessage}`);
  }

  return text;
}

// ─── V2: Curated frame cues (written by LLM at code-authoring time) ─────────

type FrameCues = {
  frames: Array<{
    position: string;
    key_cues: string[];
  }>;
};

/**
 * Curated frame cues for each exercise, authored by analyzing the exercise
 * instructions. Each entry describes the exact visual body positions an
 * illustrator needs for the starting and ending frames.
 *
 * To add a new exercise: read its instructions, identify the loaded/ready
 * position (start) and peak contraction (end), then write 4 concrete visual
 * cues per frame covering joint angles, limb placement, grip, spine angle,
 * foot stance, and equipment position.
 */
const FRAME_CUES_BY_ID: Record<string, FrameCues> = {
  "voltra-001": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine on floor, knees bent at 90 degrees, feet flat",
          "Cable handle held behind head with both hands",
          "Lower back pressed firmly to the floor",
          "Shoulders resting on the ground, cable taut from low mount",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso curled upward, shoulder blades lifted off the floor",
          "Abdominals fully contracted, cable pulled forward",
          "Lower back still pressed to floor, chin slightly tucked",
          "Arms holding handle behind head, elbows pointing forward",
        ],
      },
    ],
  },
  "voltra-002": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine, cable to one side at mid-mount height",
          "Arms extended straight up holding handle above chest",
          "Knees bent at 90 degrees, feet hovering off floor",
          "Core braced, resisting rotational pull from cable",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "One leg extended straight, opposite knee drawn to chest (bicycle kick)",
          "Arms still extended overhead holding handle, torso stable",
          "Core resisting cable rotation — no trunk twist visible",
          "Shoulders and head lifted slightly off the floor",
        ],
      },
    ],
  },
  "voltra-003": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Half-kneeling: inside knee on floor, outside foot forward in lunge",
          "Both hands gripping handle near the high-mount cable",
          "Arms extended upward toward the high anchor point",
          "Torso upright, rotated slightly toward the cable machine",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle pulled diagonally down to opposite hip",
          "Torso rotated away from machine, obliques engaged",
          "Arms extended toward the low outside position",
          "Hips and lower body remain square and stable",
        ],
      },
    ],
  },
  "voltra-004": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing the Voltra rack, feet shoulder-width",
          "Arms extended overhead toward the high-mount cable",
          "Handle gripped with both hands, cable taut",
          "Slight forward lean, core braced, knees soft",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle pulled down in a sweeping arc to hip level",
          "Elbows tucked at sides, shoulder blades retracted",
          "Torso upright, core engaged throughout the pull",
          "Lats and back visibly contracted, chest lifted",
        ],
      },
    ],
  },
  "voltra-005": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, feet shoulder-width apart",
          "Arm extended to the side toward the mid-mount cable",
          "Slight bend in the elbow, palm facing forward",
          "Torso square, facing perpendicular to the machine",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm swept across body to center-line or past midline",
          "Torso rotated toward the pressing arm, obliques engaged",
          "Cable crossing in front of chest, handle at midline",
          "Rear shoulder visibly open, chest and pecs contracted",
        ],
      },
    ],
  },
  "voltra-006": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, handle at chest height",
          "Staggered stance, cable arm hand at shoulder, elbow back",
          "Feet hip-width, rear foot heel up ready to lunge",
          "Torso upright, core braced, cable taut behind",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Front leg in deep forward lunge, rear knee near floor",
          "Arm fully extended forward, pressing handle away from chest",
          "Torso rotated away from cable arm, obliques engaged",
          "Cable line stretching diagonally from rack to extended hand",
        ],
      },
    ],
  },
  "voltra-007": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, staggered stance",
          "One hand at shoulder height holding handle, elbow bent at 90 degrees",
          "Cable running behind the shoulder from mid-mount",
          "Torso facing forward, slight spinal rotation toward cable side",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm fully pressed forward and extended at chest height",
          "Spine rotated through the press toward the pressing arm",
          "Rear hip open, cable stretched diagonally across body",
          "Core and chest visibly engaged, shoulder protracted forward",
        ],
      },
    ],
  },
  "voltra-008": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, handle held at chest with both hands",
          "Feet shoulder-width apart, toes slightly turned out",
          "Cable taut from low mount, pulling laterally",
          "Torso upright, core braced to resist rotation",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Full squat depth: thighs at or below parallel",
          "Handle still at chest, arms unchanged from start",
          "Torso upright despite lateral cable pull, no trunk twist",
          "Knees tracking over toes, heels flat on floor",
        ],
      },
    ],
  },
  "voltra-009": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, feet shoulder-width apart",
          "Arms fully extended in front of chest holding handle",
          "Cable taut from mid-mount, pulling toward the machine",
          "Torso facing the cable, hips square and stable",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso rotated 90 degrees away from the cable machine",
          "Arms still extended straight at chest height, handle swept to far side",
          "Hips remain square and facing forward, only torso rotates",
          "Obliques and core visibly engaged through the rotation",
        ],
      },
    ],
  },
  "voltra-010": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, arm at side, cable handle in hand",
          "Elbow fully extended, arm hanging straight down",
          "Cable taut from low mount, palm facing forward (supinated)",
          "Feet shoulder-width, posture upright, shoulders back",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle curled up to shoulder height, elbow pinned to side",
          "Forearm vertical, bicep fully contracted at the top",
          "Wrist neutral, palm facing shoulder",
          "Torso upright and stable, no swinging or leaning",
        ],
      },
    ],
  },
  "voltra-013": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Facing away from Voltra, slight forward lean from the hips",
          "Rope held behind the head with both hands, elbows bent and pointing up",
          "Upper arms close to ears, forearms angled back toward the high mount",
          "Cable taut from high mount, triceps fully stretched",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms fully extended overhead, elbows locked out",
          "Rope ends pulled apart at the top, hands above forehead",
          "Triceps fully contracted, upper arms still close to ears",
          "Torso leaning slightly forward, core braced for stability",
        ],
      },
    ],
  },
  "voltra-020": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Kneeling below the Voltra, bar attached to high mount",
          "Arms fully extended overhead, narrow neutral grip on bar",
          "Torso upright, core braced, lats stretched at full reach",
          "Cable taut from high mount, shoulders elevated near ears",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pulled down to upper chest, elbows driven back and down",
          "Shoulder blades retracted and depressed, chest lifted",
          "Lats visibly contracted, biceps engaged at the bottom",
          "Torso still upright, no excessive lean backward",
        ],
      },
    ],
  },
  "voltra-029": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, staggered stance for balance",
          "Arms extended wide to the sides at shoulder height, handle in each hand",
          "Slight bend in the elbows, chest open, cable pulling from behind",
          "Cable taut from high mount, pecs fully stretched",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms swept together in front of chest in a hugging arc",
          "Hands meeting at midline, elbows still slightly bent",
          "Chest fully contracted, pecs squeezed together at center",
          "Torso stable, slight forward lean, staggered stance unchanged",
        ],
      },
    ],
  },
  "voltra-035": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, handle at chest height in one hand",
          "Elbow bent at 90 degrees, forearm parallel to the floor",
          "Feet shoulder-width, staggered stance, cable taut from mid-mount",
          "Torso upright, core braced, chest ready to press",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm fully extended forward at chest height, elbow locked out",
          "Handle pushed straight ahead, cable stretched from rack to hand",
          "Chest and triceps visibly contracted at full extension",
          "Torso stable, no rotation or lean, staggered stance unchanged",
        ],
      },
    ],
  },
  "voltra-045": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, ankle strap on the far ankle",
          "Cable-side leg straight and resting next to the standing leg",
          "Standing leg slightly bent at the knee for balance",
          "Hands on hips or holding the rack for stability, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Cable-side leg kicked out laterally to about 45 degrees",
          "Leg straight and fully abducted against cable resistance",
          "Glutes visibly contracted on the working side",
          "Standing leg still slightly bent, torso upright and not leaning",
        ],
      },
    ],
  },
  "mw-bb-001": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Feet shoulder-width apart, knees slightly bent",
          "Hinged at hips with torso at 45-degree angle to the floor",
          "Arms fully extended downward, barbell hanging at arm's length below shoulders",
          "Overhand grip on barbell, shoulder-width apart",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Barbell pulled up to lower chest / upper abdomen",
          "Elbows driven back past the torso at roughly 90 degrees",
          "Shoulder blades fully retracted and squeezed together",
          "Back remains flat at 45-degree hip hinge, core braced",
        ],
      },
    ],
  },
  "voltra-011": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing upright facing the Voltra, handle in hand",
          "Arm fully extended at side, cable from floor mount",
          "Palm facing forward (underhand grip), cable taut",
          "Feet shoulder-width apart, posture upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle curled up to shoulder height, elbow pinned at side",
          "Forearm vertical, bicep fully contracted",
          "Wrist neutral, palm facing shoulder at the top",
          "Torso upright and stable, no swinging",
        ],
      },
    ],
  },
  "voltra-012": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, neutral grip on rope ends",
          "Arms fully extended at sides, cable from low mount",
          "Thumbs pointing forward (hammer grip), cable taut",
          "Feet shoulder-width apart, elbows close to body",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Rope curled up to shoulder height, elbows pinned at sides",
          "Thumbs still pointing up at the top of the movement",
          "Biceps and forearms contracted at peak position",
          "Torso upright, no swinging or momentum",
        ],
      },
    ],
  },
  "voltra-014": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine on floor, head toward the Voltra",
          "Arms extended overhead gripping handle, elbows straight",
          "Cable taut from low mount, upper arms near ears",
          "Knees bent, feet flat on the floor for stability",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Elbows bent, handle lowered behind the head",
          "Upper arms still near ears, forearms angled back",
          "Triceps fully stretched at the bottom position",
          "Lower back pressed to floor, core engaged",
        ],
      },
    ],
  },
  "voltra-015": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated on bench, leaning forward, elbow braced against inner thigh",
          "Arm fully extended downward, handle in hand from low mount",
          "Cable taut, palm facing upward (supinated)",
          "Non-working hand resting on opposite knee for support",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle curled up to shoulder, bicep fully contracted",
          "Elbow still braced against inner thigh, no movement at shoulder",
          "Forearm vertical, peak contraction squeeze at the top",
          "Torso still leaning forward, stable position maintained",
        ],
      },
    ],
  },
  "voltra-016": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, cable handle in far hand",
          "Arm fully extended at side, cable taut from low mount",
          "Palm facing forward, elbow at side",
          "Feet shoulder-width apart, posture upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle curled up toward shoulder, elbow pinned to side",
          "Bicep fully contracted at the top",
          "Torso upright, no leaning or swinging",
          "Cable line crossing in front of body from low mount to hand",
        ],
      },
    ],
  },
  "voltra-017": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, overhand grip on bar at chest height",
          "Elbows bent at roughly 90 degrees, upper arms pinned to sides",
          "Cable taut from high mount, bar at upper chest level",
          "Feet shoulder-width apart, slight forward lean",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pushed down to thigh level, arms fully extended",
          "Elbows locked out, triceps fully contracted",
          "Upper arms still pinned to sides throughout",
          "Torso upright, no leaning into the push-down",
        ],
      },
    ],
  },
  "voltra-018": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated on bench, forearm resting on thigh, wrist over knee",
          "Handle in hand, cable from low mount, palm facing up",
          "Wrist extended (dropped) below the knee line",
          "Forearm flat on thigh, only wrist moving",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Wrist curled upward, handle lifted above knee level",
          "Forearm flexors contracted at peak position",
          "Forearm still resting flat on thigh, stationary",
          "Only the wrist has moved, fingers gripping handle firmly",
        ],
      },
    ],
  },
  "voltra-019": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Kneeling below the Voltra, wide overhand grip on bar",
          "Arms fully extended overhead, cable taut from high mount",
          "Torso upright, shoulders elevated near ears, lats stretched",
          "Core braced, looking slightly upward at the bar",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pulled down to upper chest, elbows driven wide and down",
          "Shoulder blades retracted and depressed, chest lifted",
          "Lats fully contracted, wide elbow flare emphasizing lat width",
          "Torso still upright, no excessive backward lean",
        ],
      },
    ],
  },
  "voltra-021": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated on floor or bench facing Voltra, legs extended or knees bent",
          "Arms fully extended forward, handles in both hands",
          "Cable taut from low mount, torso upright, slight forward lean",
          "Shoulders protracted, lats stretched at full reach",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handles pulled to lower ribcage, elbows driven back",
          "Shoulder blades retracted and squeezed together",
          "Chest up, torso upright, slight backward lean",
          "Lats and mid-back visibly contracted",
        ],
      },
    ],
  },
  "voltra-022": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Kneeling or seated below Voltra, one arm extended overhead",
          "Handle in hand, cable taut from high mount",
          "Shoulder elevated, lat fully stretched on the working side",
          "Non-working hand resting on thigh for stability",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle pulled down to shoulder level, elbow driven down and back",
          "Lat fully contracted on the working side",
          "Shoulder blade depressed and retracted",
          "Torso stable, minimal rotation, core braced",
        ],
      },
    ],
  },
  "voltra-023": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "One knee and hand on bench, opposite foot on floor",
          "Working arm extended straight down holding handle",
          "Cable taut from low mount, back flat and parallel to floor",
          "Head neutral, looking at the floor",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle pulled up past the torso, elbow driven high",
          "Shoulder blade retracted, lat and mid-back contracted",
          "Back still flat, no torso rotation during the row",
          "Elbow at roughly 90 degrees at the top of the pull",
        ],
      },
    ],
  },
  "voltra-024": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, handle held at chest with both hands",
          "Hinged forward at the hips, torso at 45-60 degree angle",
          "Knees slightly bent, back flat, cable taut from low mount",
          "Lower back in a stretched position, core engaged",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso extended to full upright standing position",
          "Handle still at chest, hips fully extended",
          "Lower back muscles (erector spinae) fully contracted",
          "Shoulders back, chest proud, head neutral",
        ],
      },
    ],
  },
  "voltra-025": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing upright, handles in both hands at sides",
          "Arms fully extended downward, cable from low mount",
          "Shoulders in neutral (depressed) position",
          "Feet shoulder-width apart, posture tall",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Shoulders shrugged straight up toward ears",
          "Traps fully contracted at the top of the shrug",
          "Arms still straight, only shoulders have moved",
          "Hold briefly at the top, head neutral",
        ],
      },
    ],
  },
  "voltra-026": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, arms extended overhead gripping bar",
          "Slight forward lean from the hips, cable from high mount",
          "Arms nearly straight with slight elbow bend",
          "Lats stretched, shoulders elevated toward ears",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pulled down in a wide arc to thigh level, arms still straight",
          "Lats fully contracted, shoulder blades depressed",
          "Torso slightly more upright than start position",
          "Arms at sides, bar touching front of thighs",
        ],
      },
    ],
  },
  "voltra-027": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated facing Voltra, palms facing up (supinated grip) on handle",
          "Arms fully extended forward, cable taut from low mount",
          "Torso upright with slight forward lean, lats stretched",
          "Knees slightly bent, feet braced against support",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle pulled to lower chest, palms still facing up",
          "Elbows driven back, shoulder blades squeezed together",
          "Lower lats emphasized due to supinated grip angle",
          "Chest up, torso upright, slight backward lean",
        ],
      },
    ],
  },
  "voltra-028": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine on bench positioned beside the Voltra",
          "Arm extended out to the side, slight elbow bend, handle in hand",
          "Cable taut from low mount, chest fully stretched",
          "Feet flat on floor, back flat on bench",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm swept upward and across body to above chest midline",
          "Handle directly above the sternum at the top",
          "Chest fully contracted, pec squeezed at the peak",
          "Elbow bend maintained throughout the arc motion",
        ],
      },
    ],
  },
  "voltra-030": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing away from Voltra, handle in each hand at shoulder height",
          "Arms extended wide to the sides, slight elbow bend",
          "Cable taut from high mount, chest stretched",
          "Staggered stance for balance, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms swept downward and together in front of lower chest",
          "Hands meeting below chest level in a downward arc",
          "Lower chest (sternal pec fibers) fully contracted",
          "Elbows still slightly bent, torso stable",
        ],
      },
    ],
  },
  "voltra-031": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated on incline bench facing away from Voltra",
          "Handles at shoulder height, elbows bent, cable from low mount",
          "Back flat against incline pad, feet flat on floor",
          "Upper chest stretched, ready to press",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms pressed upward and forward at incline angle",
          "Elbows extended, handles above upper chest",
          "Upper chest and front delts contracted at full extension",
          "Back still pressed against incline pad, core braced",
        ],
      },
    ],
  },
  "voltra-032": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, cable arm low and to the side",
          "Handle in hand, arm extended down toward the low mount",
          "Slight elbow bend, upper chest stretched",
          "Feet shoulder-width, torso facing perpendicular to machine",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm swept upward and across body in an upward arc",
          "Handle above opposite shoulder, arm crossing midline",
          "Upper chest (clavicular pec fibers) fully contracted",
          "Torso stable, slight lean toward the working side",
        ],
      },
    ],
  },
  "voltra-033": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, staggered stance",
          "Handle at chest height in one hand, elbow bent at 90 degrees",
          "Cable taut from mid mount, forearm parallel to floor",
          "Torso upright, core braced, chest ready to press",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm fully extended forward at chest height",
          "Elbow locked out, handle pushed straight ahead",
          "Chest and triceps contracted at full extension",
          "Torso stable, no rotation, staggered stance unchanged",
        ],
      },
    ],
  },
  "voltra-034": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, bar gripped at chest width",
          "Bar at chest height, elbows bent, cable from mid mount",
          "Feet shoulder-width, staggered stance for balance",
          "Core braced, chest up, ready to press",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pressed forward until arms fully extend",
          "Chest and triceps contracted at full lockout",
          "Bar at chest height, cable stretched from rack to hands",
          "Torso stable, core braced, no forward lean",
        ],
      },
    ],
  },
  "voltra-036": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing away from Voltra, handle in each hand",
          "Arms extended wide and slightly above shoulder height",
          "Slight elbow bend, cable taut from high mount",
          "Staggered stance, torso upright, chest stretched",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms swept downward and together below chest level",
          "Hands meeting at hip/waist height in a downward fly arc",
          "Lower chest and sternal pec fibers fully contracted",
          "Elbows still slightly bent, torso stable throughout",
        ],
      },
    ],
  },
  "voltra-037": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine, ankle strap attached to one ankle, cable from low mount",
          "Legs extended, strapped leg near the floor",
          "Hands behind head or across chest, shoulders on the floor",
          "Core relaxed, ready to crunch and flex hip simultaneously",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso crunched upward, shoulder blades off the floor",
          "Strapped knee pulled toward the chest simultaneously",
          "Abs and hip flexors both contracted at the top",
          "Lower back pressed to floor, chin slightly tucked",
        ],
      },
    ],
  },
  "voltra-038": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing over the cable, feet hip-width apart",
          "Hinged at hips, back flat, arms fully extended gripping bar",
          "Bar at shin level, cable from floor mount",
          "Knees slightly bent, hips pushed back, hamstrings loaded",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Standing fully upright, hips fully extended",
          "Bar at hip level, arms hanging straight",
          "Glutes squeezed, shoulders back, chest proud",
          "Knees straight (not locked), core braced",
        ],
      },
    ],
  },
  "voltra-039": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, handle held at chest with both hands",
          "Feet shoulder-width, toes slightly turned out",
          "Cable taut from low mount, torso upright",
          "Core braced, ready to squat",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Full squat depth, thighs at or below parallel",
          "Handle still held at chest, elbows inside knees",
          "Torso upright, chest proud despite deep squat",
          "Heels flat on floor, knees tracking over toes",
        ],
      },
    ],
  },
  "voltra-040": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, ankle strap on one ankle",
          "Strapped leg straight, resting beside standing leg",
          "Standing leg slightly bent for balance",
          "Hands holding rack or on hips for stability, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Strapped leg extended backward, hip fully extended",
          "Glute fully contracted on the working side",
          "Leg straight behind the body at roughly 30-45 degrees",
          "Torso upright, no excessive forward lean, standing leg stable",
        ],
      },
    ],
  },
  "voltra-041": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "On all fours (quadruped), ankle strap on one ankle",
          "Strapped leg extended straight back, opposite arm reaching forward",
          "Bird dog position: back flat, core engaged",
          "Cable taut from low mount, hamstrings and glutes stretched",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Strapped heel curled toward the glute against cable resistance",
          "Knee bent at 90+ degrees, hamstring fully contracted",
          "Opposite arm still extended forward, back still flat",
          "Core braced, no rotation or hip drop during the curl",
        ],
      },
    ],
  },
  "voltra-042": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine, feet toward the Voltra, ankle strap on one ankle",
          "Strapped leg extended straight, resting near the floor",
          "Arms at sides for stability, lower back pressed to floor",
          "Cable taut from low mount, hip flexors stretched",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Strapped leg raised upward to vertical or near-vertical position",
          "Knee slightly bent, hip flexors and quads contracted",
          "Non-working leg still flat on the floor",
          "Lower back pressed to floor, core engaged throughout",
        ],
      },
    ],
  },
  "voltra-043": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, holding handle at chest with both hands",
          "Feet together, cable taut from low mount",
          "Torso upright, core braced, ready to lunge backward",
          "Weight evenly distributed on both feet",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "One foot stepped backward into a deep reverse lunge",
          "Front knee at 90 degrees, rear knee near the floor",
          "Handle still held at chest, torso upright",
          "Weight on front heel, cable providing forward resistance",
        ],
      },
    ],
  },
  "voltra-044": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated on bench, ankle strap on one ankle, cable to the outside",
          "Lower leg rotated outward (externally), knee bent at 90 degrees",
          "Cable taut from low mount pulling leg outward",
          "Hands gripping bench edges for stability",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Lower leg rotated inward across midline against cable resistance",
          "Hip internally rotated, foot pointing inward",
          "Hip rotator muscles contracted on the working side",
          "Upper body stable, no torso rotation, seated position maintained",
        ],
      },
    ],
  },
  "voltra-046": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, rope held with both hands",
          "Arms extended forward at face height, cable from mid mount",
          "Feet shoulder-width apart, slight backward lean",
          "Shoulders and upper back in neutral, rope taut",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Rope pulled to face level, elbows flared high and wide",
          "Forearms rotated upward (external rotation) at end of pull",
          "Shoulder blades retracted, rear delts and traps contracted",
          "Hands at ear level, fists pointing to ceiling",
        ],
      },
    ],
  },
  "voltra-047": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing away from Voltra, bar held behind thighs",
          "Arms extended straight down, cable from low mount between legs",
          "Feet shoulder-width apart, torso upright",
          "Shoulders in neutral position, bar resting against quads",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar raised forward and up to shoulder height, arms straight",
          "Slight bend in elbows maintained throughout the raise",
          "Front delts contracted at the top, bar at eye level",
          "Torso upright, no swinging or backward lean",
        ],
      },
    ],
  },
  "voltra-048": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing away from Voltra, handle in one hand",
          "Arm extended at side, cable running between legs from low mount",
          "Slight elbow bend, palm facing backward",
          "Feet shoulder-width apart, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle raised forward and up to shoulder height",
          "Arm straight with slight elbow bend, front delt contracted",
          "Palm facing downward at shoulder height",
          "Torso upright, no swinging or momentum",
        ],
      },
    ],
  },
  "voltra-049": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing on the cable, handle in each hand at sides",
          "Arms at sides, slight elbow bend, palms facing inward",
          "Cable running under feet from low mount",
          "Feet shoulder-width apart, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Both arms raised out to sides at shoulder height",
          "Slight elbow bend maintained, palms facing down",
          "Lateral delts contracted, arms forming a T-shape",
          "Torso upright, no swinging, shoulders level",
        ],
      },
    ],
  },
  "voltra-050": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, cable handle in far hand",
          "Arm at side, cable crossing in front of body from low mount",
          "Slight elbow bend, palm facing inward toward thigh",
          "Standing upright, non-working hand on hip or rack",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm raised laterally to shoulder height",
          "Slight elbow bend maintained, palm facing down",
          "Lateral delt fully contracted on the working side",
          "Torso upright, no leaning away from the cable",
        ],
      },
    ],
  },
  "voltra-051": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, elbow bent 90 degrees at side",
          "Forearm across the belly, pointing toward the cable machine",
          "Upper arm pinned to the body, cable from mid mount",
          "Feet shoulder-width apart, posture upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Forearm rotated outward away from body, 90-degree elbow maintained",
          "Hand pointing away from the cable machine",
          "Rotator cuff (infraspinatus) contracted",
          "Upper arm still pinned to side, only forearm has rotated",
        ],
      },
    ],
  },
  "voltra-052": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to Voltra, elbow bent 90 degrees at side",
          "Forearm pointing away from the cable machine",
          "Upper arm pinned to body, cable from mid mount",
          "Feet shoulder-width apart, posture upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Forearm rotated inward across the belly toward the cable",
          "90-degree elbow maintained, only forearm has rotated",
          "Subscapularis (internal rotator) contracted",
          "Upper arm still pinned to side, torso stable",
        ],
      },
    ],
  },
  "voltra-053": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, bar gripped shoulder-width at thigh level",
          "Arms fully extended downward, cable from low mount",
          "Feet shoulder-width apart, torso upright",
          "Bar resting against front of thighs",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pulled up along the body to chin height",
          "Elbows flared high and wide, leading the pull",
          "Bar close to the body throughout, at upper chest/chin",
          "Shoulders and traps contracted at the top",
        ],
      },
    ],
  },
  "voltra-054": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing Voltra, elbow raised to shoulder height",
          "Forearm hanging straight down (horizontal upper arm, vertical forearm)",
          "Cable from mid mount, handle in hand",
          "Upper arm at 90 degrees to body, forming an L-shape",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Forearm rotated upward from horizontal to vertical position",
          "Fist pointing to ceiling, upper arm still at shoulder height",
          "External rotators of shoulder contracted",
          "L-shape maintained, only the rotation has changed",
        ],
      },
    ],
  },
  "voltra-055": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to Voltra, handle at shoulder height",
          "Elbow bent, hand near the ear, cable from low mount",
          "Feet shoulder-width, staggered stance for stability",
          "Core braced, torso upright, ready to press overhead",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm fully extended overhead, elbow locked out",
          "Handle directly above the shoulder, cable stretched",
          "Shoulder and triceps contracted at full extension",
          "Torso upright, no excessive arching of lower back",
        ],
      },
    ],
  },
  "voltra-056": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Kneeling facing Voltra, rope gripped behind head with both hands",
          "Torso upright in tall kneeling position",
          "Cable taut from high mount, abs stretched",
          "Hips over knees, arms framing the head",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso crunched downward, elbows driven toward knees",
          "Spine fully flexed, abs maximally contracted",
          "Hips remain over knees — only torso curls, hips don't sit back",
          "Rope still behind head, hands haven't moved relative to head",
        ],
      },
    ],
  },
  "mw-cable-001": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing centered between two cable towers, handle in each hand",
          "Arms extended wide to the sides at shoulder height",
          "Slight elbow bend, cables from shoulder-height pulleys",
          "Chest stretched, staggered stance for balance",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms swept together in front of chest, hands meeting at midline",
          "Chest fully contracted, pecs squeezed together",
          "Slight elbow bend maintained throughout the arc",
          "Hold at peak contraction for one second, torso stable",
        ],
      },
    ],
  },
  "mw-cable-002": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing cable machine, arms extended overhead gripping bar/rope",
          "Cable from highest pulley position, arms nearly straight",
          "Slight forward lean from hips, feet shoulder-width",
          "Lats and chest stretched at the top position",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar/rope pulled down in arc to thigh level, arms still straight",
          "Lats and chest contracted at the bottom",
          "Torso slightly more upright, core engaged",
          "Arms at sides, hands near thighs",
        ],
      },
    ],
  },
  "mw-cable-003": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing between two low pulleys, handle in each hand",
          "Arms extended down and slightly out to sides",
          "Slight elbow bend, cables taut from low position",
          "Staggered stance, torso upright with slight forward lean",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms swept upward and inward to chest height",
          "Hands meeting in front of chest, upper chest contracted",
          "Slight elbow bend maintained, palms facing each other",
          "Torso stable, squeezing upper chest at the top",
        ],
      },
    ],
  },
  "mw-cable-004": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing cable machine, knees slightly bent",
          "Arms extended forward holding V-bar or handles",
          "Cable from mid-height pulley, torso upright",
          "Shoulders protracted, lats stretched at full reach",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handles pulled to lower ribcage, elbows driven back",
          "Shoulder blades retracted and squeezed together",
          "Chest up, torso upright, knees still slightly bent",
          "Lats and mid-back visibly contracted",
        ],
      },
    ],
  },
  "mw-cable-005": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing centered between two cable towers at shoulder height",
          "Arms crossed in front, grabbing opposite cable handles",
          "Arms extended forward, rear delts stretched",
          "Feet shoulder-width, slight forward lean",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms pulled apart and back, hands at shoulder level",
          "Rear delts and upper back fully contracted",
          "Cables crossed, arms in a wide-open position",
          "Shoulder blades squeezed together, chest open",
        ],
      },
    ],
  },
  "mw-cable-006": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Kneeling facing cable machine, about two feet back",
          "Arms extended overhead gripping rope attachment",
          "Cable from highest pulley, lats fully stretched",
          "Torso upright, core engaged, looking upward",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Elbows pulled down toward hips in a prayer motion",
          "Lats fully contracted, elbows at sides",
          "Torso slightly hinged forward, head between upper arms",
          "Core tight, controlled squeeze at the bottom",
        ],
      },
    ],
  },
  "mw-cable-007": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing cable at slight 30-degree angle, handle in one hand",
          "Arm extended down, cable from lowest pulley",
          "Shoulder in neutral/depressed position",
          "Feet shoulder-width, slight offset angle to the machine",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Shoulder shrugged straight up toward the ear on working side",
          "Trap fully contracted, arm still straight",
          "Hold contraction for one second at the top",
          "No head tilt, torso upright and stable",
        ],
      },
    ],
  },
  "mw-cable-008": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back to cable machine, handle at shoulder height",
          "Elbow bent, hand near the ear, cable from lowest pulley",
          "Feet staggered for stability, core braced",
          "Torso upright, shoulder ready to press",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arm fully extended overhead, elbow locked out",
          "Handle above the shoulder, shoulder and triceps contracted",
          "Torso upright, no excessive back arch",
          "Core braced throughout the press",
        ],
      },
    ],
  },
  "mw-cable-009": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing upright, cables crossed, holding opposite low-pulley handles",
          "Arms at sides, palms facing inward, cables taut",
          "Feet shoulder-width apart, torso upright",
          "Shoulders neutral, traps relaxed",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms raised upward and outward in a Y shape above head",
          "Thumbs pointing up, arms forming a Y with the torso",
          "Shoulder and trap muscles contracted at the top",
          "Just above shoulder height, controlled hold at peak",
        ],
      },
    ],
  },
  "mw-cable-010": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing centered between cable towers at chest height",
          "Cables crossed, holding opposite handles, arms extended forward",
          "Arms slightly bent, rear delts stretched",
          "Feet shoulder-width, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms pulled outward and back to shoulder line",
          "Rear delts fully contracted, shoulder blades squeezed",
          "Arms in line with shoulders, slight elbow bend",
          "Torso stable, chest open at the end",
        ],
      },
    ],
  },
  "mw-cable-011": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing centered between two shoulder-height cable towers",
          "Handle in each hand, arms extended wide to the sides",
          "Upper arms parallel to the floor, elbows at shoulder height",
          "Biceps stretched, cables taut from shoulder-height pulleys",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Hands curled toward ears by bending at the elbows",
          "Biceps fully contracted, fists near temples",
          "Upper arms remain parallel to the floor throughout",
          "Peak contraction squeeze, torso stable",
        ],
      },
    ],
  },
  "mw-cable-012": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated at preacher bench facing cable machine",
          "Upper arms resting on preacher pad, gripping bar with palms up",
          "Arms nearly fully extended, biceps stretched",
          "Cable from lowest pulley, bar at arm's length",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar curled up toward shoulders, biceps fully contracted",
          "Upper arms still flat on the preacher pad",
          "Forearms vertical at peak contraction",
          "Squeeze at the top, elbows haven't left the pad",
        ],
      },
    ],
  },
  "mw-cable-013": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing away from cable machine, handle in one hand",
          "Arm hanging behind the torso, cable from lowest pulley",
          "Elbow behind the body, bicep in stretched position",
          "Staggered stance, torso slightly leaning forward",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle curled forward and up, elbow still behind the body",
          "Bicep fully contracted at the top position",
          "Elbow hasn't moved forward — stays behind torso",
          "Long head of bicep maximally contracted",
        ],
      },
    ],
  },
  "mw-cable-014": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing cable machine, handle in one hand at lowest pulley",
          "Arm extended downward, palm facing down (pronated)",
          "Cable taut, elbow at side, feet shoulder-width",
          "Torso upright, wrist in neutral position",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Handle curled upward with wrist rotating — palm now facing up at the top",
          "Bicep fully contracted, supination completed through the curl",
          "Forearm has twisted from pronated to supinated during movement",
          "Elbow pinned to side, torso stable",
        ],
      },
    ],
  },
  "mw-cable-015": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing cable machine, reverse (supinated) grip on bar",
          "Palms facing up, elbows bent, bar at chest level",
          "Cable from highest pulley, upper arms pinned to sides",
          "Feet shoulder-width, slight forward lean",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Bar pushed down until arms fully extend, palms still up",
          "Triceps fully contracted at lockout",
          "Elbows pinned to sides, only forearms moved",
          "Torso upright, no leaning into the pushdown",
        ],
      },
    ],
  },
  "mw-cable-016": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hinged forward at hips, flat back, one foot forward",
          "Handle in one hand from lowest pulley, upper arm parallel to floor",
          "Elbow bent at 90 degrees, forearm hanging down",
          "Non-working hand on knee for support",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Forearm extended back until arm is straight",
          "Tricep fully contracted, elbow locked out",
          "Upper arm still parallel to floor, only forearm moved",
          "Back flat, torso stable throughout the extension",
        ],
      },
    ],
  },
  "mw-cable-017": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Facing away from cable machine, rope held behind head",
          "Elbows bent, pointing forward, rope from lowest pulley",
          "Slight forward lean, one foot forward for balance",
          "Triceps stretched, upper arms near ears",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms fully extended overhead, elbows locked out",
          "Rope ends spread apart at the top, hands above head",
          "Triceps fully contracted, upper arms still near ears",
          "Core braced, slight forward lean maintained",
        ],
      },
    ],
  },
  "mw-cable-018": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing away from cable machine, straddling the cable",
          "Rope held between legs, hinged forward at hips",
          "Hips pushed back, knees slightly bent, back flat",
          "Hamstrings and glutes stretched, rope behind the body",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Hips driven forward to full standing position",
          "Glutes squeezed hard at the top, hips fully extended",
          "Rope pulled forward between legs by the hip thrust",
          "Torso upright, shoulders back, core engaged",
        ],
      },
    ],
  },
  "mw-cable-019": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to cable machine, ankle strap on far ankle",
          "Far leg resting beside standing leg, cable from lowest pulley",
          "Standing leg slightly bent for balance",
          "Hand on machine frame for stability, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Far leg lifted laterally out to the side to about 45 degrees",
          "Leg straight, glute medius contracted",
          "Torso upright, no leaning toward the machine",
          "Standing leg stable, hand on frame for balance",
        ],
      },
    ],
  },
  "mw-cable-020": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to cable machine, ankle strap on near ankle",
          "Near leg resting beside standing leg or slightly abducted",
          "Cable from lowest pulley, adductors stretched",
          "Hand on machine frame for balance, torso upright",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Near leg swept across and in front of standing leg",
          "Adductor muscles contracted, leg crossing the midline",
          "Torso upright, no leaning or rotation",
          "Standing leg stable, controlled movement throughout",
        ],
      },
    ],
  },
  "mw-cable-021": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated on bench facing away from cable machine",
          "Ankle strap on one ankle, knee bent at 90 degrees",
          "Cable from lowest pulley behind the bench",
          "Hands gripping bench sides for stability",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Lower leg extended forward until knee is straight",
          "Quad fully contracted at full extension",
          "Foot flexed, hold at the top for a beat",
          "Upper body stable, seated position maintained",
        ],
      },
    ],
  },
  "mw-cable-022": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing cable machine, handle at chest, box/bench behind",
          "One foot on top of the box, cable from lowest pulley",
          "Handle held at chest with both hands, cable taut",
          "Trailing foot on the floor, ready to step up",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Standing fully upright on top of the box",
          "Driving leg fully extended, trailing leg lifted",
          "Handle still at chest, torso upright",
          "Full hip extension on the working leg",
        ],
      },
    ],
  },
  "mw-cable-023": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to cable machine, handle at sternum with both hands",
          "Cable from chest-height pulley, pulling laterally",
          "Feet shoulder-width, core braced to resist rotation",
          "Arms bent, handle close to the chest",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms pressed straight out in front of chest",
          "Handle extended at arm's length, cable pulling laterally",
          "Core resisting the rotational pull — no torso twist",
          "Hold for two seconds at full extension, anti-rotation engaged",
        ],
      },
    ],
  },
  "mw-cable-024": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying supine, feet toward cable machine, ankle straps on both ankles",
          "Knees bent at 90 degrees, cable from lowest pulley",
          "Hips on the floor, lower abs stretched",
          "Arms at sides or gripping a bench for stability",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Knees curled toward chest, hips lifted off the floor",
          "Lower abs fully contracted, pelvis tilted toward chest",
          "Shoulder blades still on the floor, only hips and legs moved",
          "Controlled position at the top, tension maintained on abs",
        ],
      },
    ],
  },
  "mw-cable-025": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing sideways to cable machine, handle in near hand at side",
          "Cable from lowest pulley, arm hanging straight down",
          "Feet shoulder-width apart, torso upright",
          "Obliques neutral, ready to bend laterally",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso bent away from the cable machine (lateral flexion)",
          "Oblique on the far side fully contracted",
          "Handle has risen slightly as torso bends away",
          "Hips and legs stable, only torso bends laterally",
        ],
      },
    ],
  },
  "mw-bw-001": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "High plank position, hands slightly wider than shoulders on the floor",
          "Body in a straight line from head to heels",
          "Arms fully extended, core tight, feet together",
          "Looking at the floor, neck neutral",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chest lowered just above the floor, elbows bent at 45 degrees",
          "Body still in a straight line, no sagging hips",
          "Upper arms roughly parallel to the floor at the bottom",
          "Core engaged, controlled descent",
        ],
      },
    ],
  },
  "mw-bw-002": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Plank position with hands placed wider than shoulder-width",
          "Fingers slightly turned outward, body straight from head to heels",
          "Arms fully extended, wide hand placement",
          "Core engaged, looking at the floor",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chest lowered toward the floor, elbows flaring at about 45 degrees",
          "Wider elbow flare than standard push-up, chest stretched",
          "Body still straight, chest nearly touching the ground",
          "Pecs working through wider range of motion",
        ],
      },
    ],
  },
  "mw-bw-003": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Plank position with hands together forming a diamond shape",
          "Thumbs and index fingers touching, directly under chest",
          "Body straight from head to heels, arms extended",
          "Elbows close to the body, core tight",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chest lowered toward hands, elbows tucked close to body",
          "Chest touching or nearly touching the diamond hand position",
          "Triceps and inner chest under maximum tension",
          "Body still in a straight line at the bottom",
        ],
      },
    ],
  },
  "mw-bw-004": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Feet elevated on a bench or step behind the body",
          "Hands on the floor shoulder-width apart, arms extended",
          "Body in a straight declining line from elevated feet to head",
          "Core tight, weight shifted toward the upper body",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chest lowered toward the floor, elbows at 45 degrees",
          "Head near the floor, upper chest emphasized",
          "Body still in a straight line from feet to head",
          "Increased load on shoulders and upper chest due to decline angle",
        ],
      },
    ],
  },
  "mw-bw-005": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hands on elevated surface (bench), wider than shoulders",
          "Feet on the floor behind, body at an inclined angle",
          "Arms fully extended, body straight from head to heels",
          "Reduced load compared to floor push-up",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chest lowered toward the bench edge, elbows bending",
          "Body still in a straight line at the inclined angle",
          "Chest nearly touching the elevated surface",
          "Lower chest emphasis due to incline angle",
        ],
      },
    ],
  },
  "mw-bw-006": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Very wide push-up position, hands much wider than shoulders",
          "Body in a straight line, arms extended, core engaged",
          "Weight evenly distributed between both hands",
          "Feet together or slightly apart for balance",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Weight shifted to one side, lowering toward that hand",
          "Working arm bent, opposite arm nearly straight and extended",
          "Chest near the working hand, body angled to one side",
          "Intense unilateral chest and tricep engagement",
        ],
      },
    ],
  },
  "mw-bw-007": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Supported on parallel bars, arms fully extended, body elevated",
          "Torso leaning forward about 30 degrees for chest emphasis",
          "Legs crossed or bent behind the body",
          "Chest open, shoulders stabilized, core engaged",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Body lowered by bending elbows, upper arms parallel to floor",
          "Elbows slightly flared to target chest over triceps",
          "Forward lean maintained, chest stretched at the bottom",
          "Shoulders below elbows at the lowest point",
        ],
      },
    ],
  },
  "mw-bw-008": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying underneath a waist-height bar, gripping with overhand grip",
          "Body straight from head to heels, heels on the ground",
          "Arms fully extended, hanging below the bar",
          "Chest below bar level, back and lats stretched",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chest pulled up to bar level, shoulder blades squeezed together",
          "Body still in a straight line, heels still on ground",
          "Upper back and lats contracted at the top",
          "Chin above or at bar level, controlled pull",
        ],
      },
    ],
  },
  "mw-bw-009": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying face down on the floor, arms extended overhead",
          "Legs straight and together, forehead near the floor",
          "Entire body relaxed and flat on the ground",
          "Arms alongside ears, palms facing down",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms, chest, and legs all lifted off the floor simultaneously",
          "Body forming a shallow U-shape (superman flight position)",
          "Lower back muscles fully contracted",
          "Hold at the top, looking forward, squeezing glutes and back",
        ],
      },
    ],
  },
  "mw-bw-010": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying face down, arms at sides, palms facing down",
          "Chest and arms slightly lifted off the floor",
          "Legs on the ground, body prone",
          "Head neutral, looking at the floor",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Arms swept overhead in a wide arc (snow angel motion)",
          "Arms off the ground throughout the entire sweep",
          "Chest still lifted, upper back muscles engaged",
          "Hands meeting overhead, traps and rhomboids contracted",
        ],
      },
    ],
  },
  "mw-bw-011": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hanging from pull-up bar, overhand grip slightly wider than shoulders",
          "Arms fully extended, dead hang position",
          "Body straight, legs together or slightly bent",
          "Shoulder blades relaxed, lats stretched at full extension",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chin above the bar, body pulled upward",
          "Elbows driven down and back, lats fully contracted",
          "Shoulder blades retracted and depressed",
          "Core tight, no kipping or swinging",
        ],
      },
    ],
  },
  "mw-bw-012": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hanging from bar, underhand (supinated) grip, hands shoulder-width",
          "Arms fully extended, dead hang position",
          "Body straight, palms facing toward the face",
          "Biceps and lats stretched at full hang",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Chin above the bar, elbows driven down toward ribs",
          "Biceps and lats contracted at the top",
          "Body pulled straight up, no swinging",
          "Controlled position at the peak, shoulder blades squeezed",
        ],
      },
    ],
  },
  "mw-bw-013": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Downward dog position — hips high, hands and feet on floor",
          "Hands shoulder-width apart, feet walked close to hands",
          "Body in an inverted V shape, head between upper arms",
          "Arms fully extended, weight loaded on shoulders",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Head lowered toward the floor between hands by bending elbows",
          "Top of head near or lightly touching the ground",
          "Elbows pointing back or slightly out, hips still high",
          "Shoulders under maximum load at the bottom position",
        ],
      },
    ],
  },
  "mw-bw-014": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Handstand against a wall, arms fully extended, body inverted",
          "Hands shoulder-width on the floor, fingers spread",
          "Body straight and vertical, heels resting on wall",
          "Core tight, full body weight on hands and shoulders",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Head lowered toward floor by bending elbows",
          "Top of head lightly touching the ground at the bottom",
          "Elbows at roughly 90 degrees, pointing outward",
          "Full body weight at the bottom, shoulders under maximum load",
        ],
      },
    ],
  },
  "mw-bw-015": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hands gripping bench edge beside hips, hips lifted off bench",
          "Feet extended forward, heels on the floor",
          "Arms fully extended, body supported between hands and heels",
          "Torso upright, close to the bench edge",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Body lowered by bending elbows to about 90 degrees",
          "Hips dropped below bench level, back close to bench",
          "Triceps loaded at the bottom position",
          "Feet still extended, heels on floor, elbows pointing back",
        ],
      },
    ],
  },
  "mw-bw-016": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hands on a bar or elevated surface at waist height",
          "Feet stepped back, body at an angled plank",
          "Arms fully extended, weight leaning into the surface",
          "Body straight from head to heels at the inclined angle",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Head lowered below the bar by bending elbows",
          "Elbows pointing forward (not out), triceps stretched",
          "Body still in a straight line at the angle",
          "Forearms angled, head dipping below hand level",
        ],
      },
    ],
  },
  "mw-bw-017": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Face down, propped on forearms and toes",
          "Elbows directly under shoulders, forearms flat on floor",
          "Body in a straight line from head to heels",
          "Core engaged, hips level — not sagging or piking",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Same position held — this is an isometric hold exercise",
          "Body still perfectly straight, core contracted",
          "No movement — maintaining tension throughout the hold",
          "Breathing steadily, glutes and abs engaged",
        ],
      },
    ],
  },
  "mw-bw-018": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on one side, propped on forearm, elbow under shoulder",
          "Hips on the floor, feet stacked or staggered",
          "Body not yet lifted, in preparation position",
          "Top arm resting on hip or at side",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Hips lifted, body forming a straight line from head to feet",
          "Only forearm and side of bottom foot touching the floor",
          "Obliques contracted, hips level — not sagging",
          "Isometric hold maintained, breathing steadily",
        ],
      },
    ],
  },
  "mw-bw-019": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, knees bent, feet flat on the floor",
          "Hands behind head or across chest",
          "Shoulders resting on the ground, abs relaxed",
          "Lower back pressed to the floor",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Shoulders curled off the floor, shoulder blades lifted",
          "Abs contracted, upper torso flexed toward knees",
          "Lower back still on the floor, chin slightly tucked",
          "Hands still behind head — no pulling on neck",
        ],
      },
    ],
  },
  "mw-bw-020": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying flat on back, legs straight, arms at sides",
          "Lower back pressed into the floor",
          "Legs resting on the ground or hovering just above",
          "Core engaged, ready to lift",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Both legs raised together toward the ceiling (vertical)",
          "Legs straight, toes pointed or flexed",
          "Lower back still pressed to the floor",
          "Lower abs fully contracted at the top",
        ],
      },
    ],
  },
  "mw-bw-021": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, hands under glutes, both feet a few inches off ground",
          "Legs straight, lower back pressed to floor",
          "One leg slightly higher than the other (alternating position)",
          "Core engaged, ready for rapid alternating kicks",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Legs alternating rapidly in a scissor/flutter motion",
          "Small range of motion — feet stay close to the floor",
          "Both legs never touching the ground during the set",
          "Lower abs under constant tension throughout the flutter",
        ],
      },
    ],
  },
  "mw-bw-022": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, arms extended toward ceiling, knees bent at 90 degrees",
          "Lower back pressed firmly into the floor",
          "Shins parallel to the floor, hands pointing straight up",
          "Core engaged in a neutral braced position",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Right arm extended overhead while left leg extends straight out",
          "Opposite limbs extended, hovering just above the floor",
          "Lower back remains pressed to floor — no arching",
          "Core anti-extension engaged, remaining arm and leg unchanged",
        ],
      },
    ],
  },
  "mw-bw-023": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, arms extended overhead, legs straight on floor",
          "Full body extended, relaxed position",
          "Lower back about to press into the floor",
          "Preparing to lift all extremities simultaneously",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Shoulders, arms, and legs all lifted a few inches off the floor",
          "Body forming a shallow banana/boat shape",
          "Lower back pressed to floor, abs contracted",
          "Isometric hold, arms and legs hovering, core fully engaged",
        ],
      },
    ],
  },
  "mw-bw-024": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "High plank position, wrists under shoulders, body straight",
          "Arms fully extended, core tight, feet together",
          "Ready to drive knees alternately toward chest",
          "Looking at the floor, neck neutral",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "One knee driven toward chest, opposite leg extended back",
          "Rapid alternating motion — switching legs quickly",
          "Hips level, core engaged throughout the climbing motion",
          "Arms straight, shoulders stable over wrists",
        ],
      },
    ],
  },
  "mw-bw-025": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying flat on back, arms extended overhead, legs straight",
          "Full body extended on the floor",
          "Core relaxed, about to fold upward",
          "Arms and legs flat on the ground",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso and legs both lifted, body forming a V shape",
          "Hands reaching toward toes at the peak",
          "Balancing on glutes, arms and legs elevated",
          "Abs fully contracted at the top of the V",
        ],
      },
    ],
  },
  "mw-bw-026": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, hands behind head, knees bent, shoulders lifted",
          "Feet off the floor, legs in a cycling preparation position",
          "Core engaged, ready for alternating elbow-to-knee motion",
          "Head supported by hands, no pulling on neck",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Right elbow rotating toward left knee as right leg extends",
          "Alternating pedaling motion — smooth and controlled",
          "Obliques contracting with each rotation",
          "Shoulders stay lifted throughout the cycling motion",
        ],
      },
    ],
  },
  "mw-bw-027": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing upright, feet shoulder-width apart, toes slightly out",
          "Arms extended forward for counterbalance",
          "Torso upright, core braced, weight on full feet",
          "Looking forward, posture tall",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Hips pushed back, thighs at or below parallel to floor",
          "Knees tracking over toes, heels flat on ground",
          "Torso as upright as possible, chest proud",
          "Arms still forward for balance, glutes and quads loaded",
        ],
      },
    ],
  },
  "mw-bw-028": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing on one leg about two feet in front of a bench",
          "Rear foot resting on bench behind, laces down",
          "Front foot flat on floor, torso upright",
          "Arms at sides or on hips, ready to descend",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Front thigh at parallel, front knee at 90 degrees",
          "Rear knee near the floor, hip flexor stretched",
          "Torso upright, core engaged, no forward lean",
          "Weight on front heel, quad and glute loaded",
        ],
      },
    ],
  },
  "mw-bw-029": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing tall, feet hip-width apart",
          "Arms at sides, torso upright, core engaged",
          "Weight balanced on both feet evenly",
          "Ready to step forward into a lunge",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Front foot stepped forward two to three feet",
          "Both knees at 90 degrees, rear knee near the floor",
          "Front knee over ankle (not past toes), torso upright",
          "Weight on front heel, quad and glute loaded",
        ],
      },
    ],
  },
  "mw-bw-030": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing tall, feet hip-width apart",
          "Arms at sides or on hips, posture upright",
          "Weight balanced, core engaged",
          "Ready to step backward",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "One foot stepped backward two to three feet",
          "Both knees at 90 degrees, rear knee near the floor",
          "Torso upright, front knee over ankle",
          "Weight on front heel, controlled descent",
        ],
      },
    ],
  },
  "mw-bw-031": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with feet shoulder-width apart",
          "In a squat position, thighs parallel to the floor",
          "Arms at sides or swinging back for momentum",
          "Core braced, weight on balls of feet, ready to explode",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Body airborne, fully extended in a vertical jump",
          "Arms swung overhead for momentum",
          "Legs extended, toes pointed downward",
          "Full hip and knee extension at peak height",
        ],
      },
    ],
  },
  "mw-bw-032": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with back against a wall, feet forward",
          "About to slide down into the seated position",
          "Arms at sides, back flat against wall",
          "Feet shoulder-width apart, about two feet from wall",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Thighs parallel to floor, knees at 90 degrees",
          "Back flat against wall, as if sitting in invisible chair",
          "Knees directly above ankles, shins vertical",
          "Isometric hold — quads burning, arms at sides or on thighs",
        ],
      },
    ],
  },
  "mw-bw-033": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, knees bent, feet flat on floor hip-width apart",
          "Arms at sides, palms down on the floor",
          "Hips resting on the floor, glutes relaxed",
          "Lower back in neutral position",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Hips driven up toward ceiling, forming straight line from knees to shoulders",
          "Glutes squeezed hard at the top of the bridge",
          "Weight on heels and upper back/shoulders",
          "No arching of lower back — straight line through the torso",
        ],
      },
    ],
  },
  "mw-bw-034": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Lying on back, one knee bent with foot flat on floor",
          "Other leg extended straight toward the ceiling",
          "Arms at sides, hips on the floor",
          "Core engaged, ready to bridge on one leg",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Hips lifted by driving through one planted heel",
          "Straight line from knee to shoulder on the working side",
          "Extended leg still pointing toward ceiling, hips level",
          "Glute on the working side fully contracted",
        ],
      },
    ],
  },
  "mw-bw-035": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing on edge of a step, heels hanging off the back",
          "Holding wall or railing for balance",
          "Heels dropped below the step level for full calf stretch",
          "Weight on the balls of the feet",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Risen up onto toes as high as possible",
          "Calves fully contracted at the peak",
          "Heels well above the step level",
          "Hold briefly at the top, squeezing calves",
        ],
      },
    ],
  },
  "mw-bw-036": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing facing a sturdy box or bench at knee height",
          "One foot placed fully on top of the box",
          "Arms at sides or on hips, torso upright",
          "Trailing foot on the floor, ready to step up",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Standing fully upright on top of the box",
          "Driving leg fully extended, trailing leg lifted",
          "Torso upright, full hip extension on the working leg",
          "Balanced on top of the box momentarily",
        ],
      },
    ],
  },
  "mw-bw-037": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing on one leg, other leg extended straight in front",
          "Arms extended forward for counterbalance",
          "Standing leg fully extended, single-leg stance",
          "Core engaged, preparing to descend on one leg",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "In a deep single-leg squat, standing thigh below parallel",
          "Extended leg still straight and hovering above floor",
          "Arms forward for balance, torso leaning slightly forward",
          "Extreme quad, glute, and ankle mobility demand",
        ],
      },
    ],
  },
  "mw-bw-038": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing upright with feet shoulder-width apart",
          "Arms at sides, ready for explosive movement",
          "Torso upright, core engaged",
          "Full standing position before the drop",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "In plank position after jumping feet back",
          "Chest near or touching the floor (push-up bottom position)",
          "About to explosively reverse — jump feet to hands and leap",
          "Full body engagement: chest, core, quads, shoulders",
        ],
      },
    ],
  },
  "mw-bw-039": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "On all fours with knees hovering one inch above the ground",
          "Back flat, core braced, looking at the floor",
          "Hands under shoulders, knees under hips but elevated",
          "Compact quadruped position, ready to crawl",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Crawling forward: opposite hand and foot advancing simultaneously",
          "Knees still hovering close to the ground throughout",
          "Core engaged preventing hip sway, back flat",
          "Small controlled steps, bear crawl locomotion",
        ],
      },
    ],
  },
  "mw-bw-040": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Kneeling upright on a pad, feet anchored behind",
          "Torso vertical, arms crossed over chest or ready to catch",
          "Knees on the pad, ankles locked under anchor",
          "Body straight from knees to head, hamstrings ready",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Torso lowered toward the floor, controlled by hamstrings",
          "Body nearly horizontal, falling forward slowly",
          "Hamstrings maximally loaded in the eccentric phase",
          "Hands ready to catch at the bottom, or pulling back up",
        ],
      },
    ],
  },
  "mw-bw-041": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Forearms on floor, elbows under shoulders, toes on ground",
          "Body in a straight line from head to heels",
          "Core engaged, hips level, glutes squeezed",
          "Isometric hold — same as mw-bw-017 with isometric training mode",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Position held for target duration — no movement",
          "Body still in perfect plank alignment",
          "Core under sustained contraction",
          "Breathing steadily through the hold",
        ],
      },
    ],
  },
  "mw-bw-042": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Hanging from pull-up bar, overhand grip, shoulder-width",
          "Arms fully extended in a dead hang",
          "Body straight, feet off the ground",
          "Shoulders slightly engaged, grip firm on bar",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Same position held — isometric dead hang",
          "Arms still fully extended, grip maintained",
          "Forearms and lats under sustained tension",
          "Breathing steadily, no swinging or kipping",
        ],
      },
    ],
  },
  "mw-bw-043": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Back flat against wall, feet forward about two feet",
          "Sliding down into seated position",
          "Arms at sides, preparing for isometric hold",
          "Feet shoulder-width apart, flat on floor",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Thighs parallel to floor, knees at 90 degrees",
          "Back flat against wall, isometric hold maintained",
          "Quads burning under sustained contraction",
          "Arms at sides or on thighs — not on knees for support",
        ],
      },
    ],
  },
  "mw-bw-044": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Seated between parallettes or dip bars, hands on supports",
          "Arms about to lift the body, legs extended forward",
          "Hips on or near the floor, ready to press up",
          "Hands gripping supports firmly, fingers forward",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Body lifted off floor, arms fully extended and locked",
          "Legs raised to horizontal, forming an L-shape with torso",
          "Legs straight and together, toes pointed",
          "Core fully engaged, quads contracted to hold legs up",
        ],
      },
    ],
  },
  "mw-bw-045": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing tall with a heavy weight in each hand at sides",
          "Shoulders back and down, chest up, core braced",
          "Arms fully extended, weights hanging at hip level",
          "Feet hip-width apart, ready to walk",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Walking forward with controlled, even steps",
          "Core braced, not leaning to either side",
          "Weights still at sides, grip firmly maintained",
          "Upright posture maintained through the carry",
        ],
      },
    ],
  },
  "mw-bb-002": {
    frames: [
      {
        position: "Starting",
        key_cues: [
          "Standing with barbell across upper back (high bar position)",
          "Feet shoulder-width apart, toes slightly turned out",
          "Core braced, chest up, looking forward",
          "Knees slightly bent, ready to descend",
        ],
      },
      {
        position: "Ending",
        key_cues: [
          "Thighs at or below parallel to the floor",
          "Hips pushed back, knees tracking over toes",
          "Chest still up, back flat, no rounding",
          "Weight on heels and mid-foot, glutes and quads loaded",
        ],
      },
    ],
  },
};

function buildFrameCuesV2(ex: Exercise): FrameCues {
  const curated = FRAME_CUES_BY_ID[ex.id];
  if (curated) return curated;

  // Fallback: derive reasonable cues from instructions for exercises
  // not yet curated. These won't be as precise as hand-written ones.
  const steps = extractInstructionSteps(ex.instructions);
  const primaryMuscles = formatList(ex.primary_muscles.map((m) => MUSCLE_LABELS[m]));

  return {
    frames: [
      {
        position: "Starting",
        key_cues: [
          steps[0] ?? `Set up for ${ex.name}`,
          steps[1] ?? "Assume the starting posture",
          steps[2] ?? "Ready position before the movement begins",
          `Primary muscles ready to engage: ${primaryMuscles}`,
        ].slice(0, 4),
      },
      {
        position: "Ending",
        key_cues: [
          steps[3] ?? steps[2] ?? "Peak contraction position",
          steps[4] ?? steps[3] ?? "Full range of motion achieved",
          `Active muscles engaged: ${primaryMuscles}`,
          "Controlled position at end of movement",
        ].slice(0, 4),
      },
    ],
  };
}

function buildCableVisibilityRulesV2(ex: Exercise): string[] {
  if (ex.equipment !== "cable") {
    return [];
  }

  const attachmentLabel = (ex.attachment ? ATTACHMENT_LABELS[ex.attachment] : "handle")
    .toLowerCase()
    .replace(/\.$/, "");
  const mountLabel = ex.mount_position ? MOUNT_POSITION_LABELS[ex.mount_position].toLowerCase() : null;

  return [
    `Cable rendering mode: handle-only. Show the ${attachmentLabel} in contact with the athlete, but keep the cable line invisible.`,
    "Do not draw any visible cable line, wire, cord, or string between the athlete and the machine.",
    "If frame cues mention cable path, tautness, crossing, or cable angle, treat that as motion direction only and imply it through handle position and body pose without drawing a cable line.",
    ...(mountLabel
      ? [`Keep the machine context and ${mountLabel} anchor placement readable, but without any visible cable line.`]
      : []),
  ];
}

function buildPromptPayloadV2(ex: Exercise, frameCues: FrameCues, gender: string = "male") {
  const cableVisibilityRules = buildCableVisibilityRulesV2(ex);

  return {
    illustration_theme: {
      style: "Colored 3D anime fitness figure illustration",
      technical_details: {
        aesthetic:
          "Stylized 3D anime figure style with cel-shaded materials, smooth dimensional modeling, clean contours, and expressive anime proportions",
        background:
          "Simple gym environment with minimal detail, soft depth, and clean colored lighting",
        color_palette:
          "Full color palette with natural skin tones, cool grays and blues for the gym setting, athletic clothing colors, and subtle colored highlights only on active muscle groups",
        visual_aids: ["Subtle highlight on active muscle groups in both the starting and ending positions"],
      },
      character_consistency: {
        gender,
        attire:
          "Athletic wear, including a performance t-shirt or tank top, gym shorts, and cross-training shoes",
        physique: "Athletic and well-defined, stylized 3D anime proportions",
        expression: "Focused and determined, stylized anime expression",
      },
      layout: {
        format: "Side-by-side comparison, no text or labels on the image",
      },
    },
    exercise_data: {
      name: ex.name,
      frames: frameCues.frames,
    },
    render_constraints: {
      must_follow: ["No text or labels on the final image.", ...cableVisibilityRules],
    },
  };
}

function buildImagePromptV2(ex: Exercise, frameCues: FrameCues): string {
  const useOpenAI = process.env.USE_OPENAI === "1";
  const cableVisibilityRules = buildCableVisibilityRulesV2(ex);

  if (useOpenAI) {
    return [
      `Create an educational 3D illustration of a wooden artist mannequin posable doll demonstrating the two phases of a fitness exercise: the ${ex.name}.`,
      "One half of the image should show the mannequin in the starting position.",
      "The other half should depict it in the ending position.",
      ...cableVisibilityRules,
      "Do not include any text or words.",
    ].join("\n");
  }

  const payload = buildPromptPayloadV2(ex, frameCues);
  return [
    "Generate a colored 3D anime fitness figure illustration showing two positions of the same exercise side by side.",
    "Left panel: starting position. Right panel: ending position.",
    "DO NOT render any text, labels, titles, letters, numbers, captions, or annotations anywhere on the image. The image must be purely visual.",
    "Both panels must show the SAME character with identical appearance, clothing, and build.",
    "CRITICAL: The character's body position MUST be clearly and dramatically different between the two panels. This is an exercise — the person moves. Show the full range of motion from start to end.",
    "Use a colored 3D anime figure style with cel-shaded surfaces, dimensional form, polished lighting, and clear readable anatomy.",
    "Do NOT render the image in black and white, grayscale, monochrome, or screentone-only shading. The final image must be fully colored.",
    "Do NOT add arrows, speed lines, motion lines, callouts, or any other graphic overlays besides subtle muscle highlighting.",
    "Highlight only the active muscles in the starting position and the ending position with subtle colored overlays; do not add any other visual aids.",
    ...(cableVisibilityRules.length > 0
      ? [
          "CRITICAL CABLE RULE: for cable exercises, show only the attachment/handle and keep all cable lines invisible.",
          ...cableVisibilityRules,
        ]
      : []),
    "Simple gym background with minimal detail, rendered in the same colored 3D anime style.",
    "Render exactly one athletic human body per panel — no duplicated limbs or extra figures.",
    "Do not imitate any specific copyrighted character design.",
    "The structured JSON brief below is the single source of truth for the exercise details.",
    "Return exactly one image.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

// ─── Side-by-side image splitting ────────────────────────────────────────────

async function splitSideBySide(imageBuffer: Buffer): Promise<{ left: Buffer; right: Buffer }> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const halfWidth = Math.floor(width / 2);

  const left = await sharp(imageBuffer)
    .extract({ left: 0, top: 0, width: halfWidth, height })
    .toBuffer();

  const right = await sharp(imageBuffer)
    .extract({ left: halfWidth, top: 0, width: width - halfWidth, height })
    .toBuffer();

  return { left, right };
}

async function processHalfImage(buffer: Buffer, webpPath: string): Promise<void> {
  await sharp(buffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "cover" })
    .webp({ quality: WEBP_QUALITY })
    .toFile(webpPath);
}

// ─────────────────────────────────────────────────────────────────────────────

async function callGeminiImage(
  prompt: string,
  apiKey: string,
  referenceImages: ReferenceImage[] = [],
  aspectRatio: string = "1:1"
): Promise<GenerationResult> {
  const promptParts = [
    { text: prompt },
    ...referenceImages.map((image) => ({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data.toString("base64"),
      },
    })),
  ];

  const res = await fetchGeminiWithRetry(
    `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: promptParts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio,
            imageSize: GEMINI_IMAGE_SIZE,
          },
          ...(MODEL === "gemini-3.1-flash-image-preview"
            ? {
                thinkingConfig: {
                  thinkingLevel: "MINIMAL",
                  includeThoughts: false,
                },
              }
            : {}),
        },
        store: false,
      }),
    },
    "Gemini image generation"
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini image gen failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const body = (await res.json()) as GeminiGenerateContentResponse;
  if (body.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${body.promptFeedback.blockReason}`);
  }

  const imagePart = body.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => getInlineData(part))
    .filter((part): part is { data: string; mimeType: string } => part !== null)
    .at(-1);

  if (!imagePart) {
    const finishReason = body.candidates?.[0]?.finishReason ?? "unknown";
    const finishMessage = body.candidates?.[0]?.finishMessage ?? "no image returned";
    throw new Error(`Gemini image gen returned no image (${finishReason}): ${finishMessage}`);
  }

  return {
    imageBuffer: Buffer.from(imagePart.data, "base64"),
    mimeType: imagePart.mimeType,
  };
}

async function describePose(position: PromptPosition, ex: Exercise, apiKey: string): Promise<string> {
  const promptAttempts = [buildAltTextPrompt(ex, position), buildAltTextRetryPrompt(ex, position)];

  for (const prompt of promptAttempts) {
    try {
      const res = await fetchGeminiWithRetry(
        `${GEMINI_API_BASE}/${ALT_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    "You write accessibility alt text for exercise illustrations. Return complete sentences only. Describe body position, cable path, and the muscles emphasized. No bullet points. No second person. End with a period.",
                },
              ],
            },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "text/plain",
              maxOutputTokens: 180,
            },
            store: false,
          }),
        },
        `Gemini alt-text generation for ${ex.id} (${position})`
      );
      if (!res.ok) {
        console.warn(
          `[gen] ${ex.id} ${position}: alt-text request failed with HTTP ${res.status} after retries — using deterministic fallback.`
        );
        return buildDeterministicAltText(ex, position);
      }

      const body = (await res.json()) as GeminiGenerateContentResponse;
      if (body.promptFeedback?.blockReason) {
        console.warn(
          `[gen] ${ex.id} ${position}: alt-text prompt was blocked (${body.promptFeedback.blockReason}) — using deterministic fallback.`
        );
        return buildDeterministicAltText(ex, position);
      }

      const content = normalizeAltText(extractTextResponse(body));
      if (isSubstantiveAltText(content)) {
        return content;
      }
    } catch (error) {
      console.warn(
        `[gen] ${ex.id} ${position}: alt-text request failed (${(error as Error).message}) — using deterministic fallback.`
      );
      return buildDeterministicAltText(ex, position);
    }
  }

  console.warn(`[gen] ${ex.id} ${position}: Gemini alt text was weak — using deterministic fallback.`);
  return buildDeterministicAltText(ex, position);
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

async function ensurePng(imagePath: string, mimeType: string): Promise<string> {
  if (mimeType.toLowerCase() === "image/png") {
    return imagePath;
  }

  const pngPath = imagePath.replace(/\.[^.]+$/, ".png");
  await sharp(imagePath).png().toFile(pngPath);
  return pngPath;
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
    "// To populate: run `npm run generate:exercise-images` with GEMINI_API_KEY or GOOGLE_API_KEY in env.",
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
  const imagePathPrefix = "..";
  const rows = sorted
    .map(([id, v]) => {
      const startSrc = `${imagePathPrefix}/${id}/start.webp`;
      const endSrc = `${imagePathPrefix}/${id}/end.webp`;
      const startAlt = escapeHtml(v.startAlt);
      const endAlt = escapeHtml(v.endAlt);

      return `<tr><td>${id}</td><td><img src="${startSrc}" alt="${startAlt}" title="${startAlt}" width="192" loading="lazy"><br><small>${startAlt}</small></td><td><img src="${endSrc}" alt="${endAlt}" title="${endAlt}" width="192" loading="lazy"><br><small>${endAlt}</small></td></tr>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exercise illustration contact sheet</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:0;padding:24px}h1{margin:0 0 16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:8px;vertical-align:top;text-align:left}img{display:block;height:auto;max-width:100%;background:#1a1a1a}small{color:#aaa;display:block;margin-top:6px;line-height:1.4}</style>
</head>
<body>
<h1>BLD-561 — Exercise illustration contact sheet</h1>
<table><thead><tr><th>id</th><th>start</th><th>end</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>`;
  const outPath = path.join(ASSET_DIR, "curation");
  fs.mkdirSync(outPath, { recursive: true });
  fs.writeFileSync(path.join(outPath, "contact-sheet.html"), html);
  console.log(`[gen] wrote contact sheet to ${outPath}/contact-sheet.html`);
}

function writeContactSheetV2(entries: Map<string, { startAlt: string; endAlt: string }>): void {
  const sorted = Array.from(entries.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const imagePathPrefix = "..";
  const rows = sorted
    .map(([id, v]) => {
      const startSrc = `${imagePathPrefix}/${id}/start.webp`;
      const endSrc = `${imagePathPrefix}/${id}/end.webp`;
      const startAlt = escapeHtml(v.startAlt);
      const endAlt = escapeHtml(v.endAlt);
      const cues = FRAME_CUES_BY_ID[id];
      const startCues = cues?.frames[0]?.key_cues.map((c) => `<li>${escapeHtml(c)}</li>`).join("") ?? "";
      const endCues = cues?.frames[1]?.key_cues.map((c) => `<li>${escapeHtml(c)}</li>`).join("") ?? "";

      return `<tr><td>${id}</td><td><img src="${startSrc}" alt="${startAlt}" title="${startAlt}" width="256" loading="lazy"><br><ul>${startCues}</ul></td><td><img src="${endSrc}" alt="${endAlt}" title="${endAlt}" width="256" loading="lazy"><br><ul>${endCues}</ul></td></tr>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exercise illustration contact sheet (V2)</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:0;padding:24px}h1{margin:0 0 16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:8px;vertical-align:top;text-align:left}img{display:block;height:auto;max-width:100%;background:#1a1a1a}ul{color:#aaa;margin:6px 0 0;padding-left:18px;line-height:1.5;font-size:12px}</style>
</head>
<body>
<h1>BLD-561 — Exercise illustration contact sheet (V2: colored 3D anime figure)</h1>
<table><thead><tr><th>id</th><th>start</th><th>end</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>`;
  const outPath = path.join(ASSET_DIR, "curation");
  fs.mkdirSync(outPath, { recursive: true });
  fs.writeFileSync(path.join(outPath, "contact-sheet-v2.html"), html);
  console.log(`[gen] wrote V2 contact sheet to ${outPath}/contact-sheet-v2.html`);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

async function loadPriorManifestEntries(): Promise<Map<string, { startAlt: string; endAlt: string }>> {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return new Map();
  }

  try {
    const entries = new Map<string, { startAlt: string; endAlt: string }>();
    const lines = fs.readFileSync(MANIFEST_PATH, "utf8").split(/\r?\n/);

    let currentId: string | null = null;
    let startAlt: string | null = null;
    let endAlt: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const entryStartMatch = line.match(/^"([^"]+)":\s*\{$/);
      if (entryStartMatch) {
        currentId = entryStartMatch[1];
        startAlt = null;
        endAlt = null;
        continue;
      }

      if (!currentId) continue;

      if (line.startsWith("startAlt:")) {
        startAlt = JSON.parse(line.slice("startAlt:".length).trim().replace(/,$/, "")) as string;
        continue;
      }

      if (line.startsWith("endAlt:")) {
        endAlt = JSON.parse(line.slice("endAlt:".length).trim().replace(/,$/, "")) as string;
        continue;
      }

      if (line === "},") {
        if (startAlt && endAlt) {
          entries.set(currentId, { startAlt, endAlt });
        }
        currentId = null;
        startAlt = null;
        endAlt = null;
      }
    }

    return entries;
  } catch {
    return new Map();
  }
}

function selectExercises(all: Exercise[], cli: Cli): { selected: Exercise[]; requestedIds: string[]; missingIds: string[] } {
  const requestedIds = cli.exerciseIds.length > 0 ? cli.exerciseIds : [...PILOT_EXERCISE_IDS];
  const byId = new Map(all.map((exercise) => [exercise.id, exercise] as const));
  const missingIds = requestedIds.filter((id) => !byId.has(id));
  const selected = requestedIds
    .map((id) => byId.get(id))
    .filter((exercise): exercise is Exercise => Boolean(exercise));

  return {
    selected: cli.limit ? selected.slice(0, cli.limit) : selected,
    requestedIds,
    missingIds,
  };
}

async function callOpenAIImage(prompt: string, apiKey: string): Promise<GenerationResult> {
  const maxPromptLength = 4000;
  const truncatedPrompt = prompt.length > maxPromptLength ? prompt.slice(0, maxPromptLength - 3) + "..." : prompt;

  const body = {
    model: "dall-e-3",
    prompt: truncatedPrompt,
    n: 1,
    size: "1792x1024",
    response_format: "b64_json",
  };

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error [${response.status}]: ${errText}`);
  }

  const json = await response.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json found in OpenAI response");

  return {
    imageBuffer: Buffer.from(b64, "base64"),
    mimeType: "image/png",
  };
}

// eslint-disable-next-line complexity
async function main(): Promise<void> {
  loadLocalEnvFiles();
  const cli = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const useOpenAI = process.env.USE_OPENAI === "1";

  if (!cli.dryRun) {
    if (useOpenAI && !openaiApiKey) {
      console.error(
        "[gen] OPENAI_API_KEY is required when USE_OPENAI=1 (the script also auto-loads .env.gemini.local, .env.local, and .env; pass --dry-run to preview prompts without hitting the API)."
      );
      process.exit(1);
    }

    if (!useOpenAI && !apiKey) {
      console.error(
        "[gen] GEMINI_API_KEY or GOOGLE_API_KEY is required for Gemini generation (the script also auto-loads .env.gemini.local, .env.local, and .env; pass --dry-run to preview prompts without hitting the API)."
      );
      process.exit(1);
    }
  }

  // Preflight sharp so we fail fast rather than deep in the loop.
  if (!cli.dryRun) {
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  }

  const all = seedExercises();
  const { selected, requestedIds, missingIds } = selectExercises(all, cli);

  if (missingIds.length > 0) {
    console.warn(`[gen] requested ids not present in seed: ${missingIds.join(", ")}`);
  }
  if (selected.length === 0) {
    console.error("[gen] no exercises selected — adjust --exercise-id or --limit and try again.");
    process.exit(1);
  }

  console.log(`[gen] selected exercises: ${selected.length}/${requestedIds.length} resolved`);
  console.log(`[gen] ids: ${selected.map((exercise) => `${exercise.id} (${exercise.name})`).join(", ")}`);

  const manifestEntries = await loadPriorManifestEntries();

  for (const ex of selected) {
    const exDir = path.join(ASSET_DIR, ex.id);
    fs.mkdirSync(exDir, { recursive: true });
    const fpInput = fingerprintInput(ex);
    const promptHash = sha256(fpInput);
    const existing = readFingerprint(exDir);
    const haveFiles = fs.existsSync(path.join(exDir, "start.webp")) && fs.existsSync(path.join(exDir, "end.webp"));

    if (haveFiles && existing?.promptHash === promptHash && !cli.forceRegen) {
      console.log(`[gen] ${ex.id}: up to date — skip`);
      const priorEntry = manifestEntries.get(ex.id);
      if (
        priorEntry?.startAlt &&
        priorEntry?.endAlt &&
        isSubstantiveAltText(priorEntry.startAlt) &&
        isSubstantiveAltText(priorEntry.endAlt)
      ) {
        continue;
      }

      if (cli.dryRun) continue;

      console.log(`[gen] ${ex.id}: images are current but alt text is missing or weak — regenerating alt text only`);
      const startAlt = await describePose("start", ex, apiKey!);
      const endAlt = await describePose("end", ex, apiKey!);
      manifestEntries.set(ex.id, { startAlt, endAlt });
      continue;
    }
    if (haveFiles && existing && existing.promptHash !== promptHash && !cli.forceRegen) {
      console.warn(`[gen] ${ex.id}: prompt fingerprint drift detected — pass --force-regen to regenerate.`);
      continue;
    }

    // V2: Curated frame cues + side-by-side generation
    const frameCues = buildFrameCuesV2(ex);
    if (cli.dryRun) {
      console.log(`[gen:dry] ${ex.id}: V2 payload:`);
      console.log(JSON.stringify(buildPromptPayloadV2(ex, frameCues), null, 2));
      continue;
    }

    // Step 2: Build V2 prompt and generate side-by-side image
    const prompt = buildImagePromptV2(ex, frameCues);

    let imageBuffer: Buffer;
    let mimeType: string;

    if (useOpenAI) {
      if (!openaiApiKey) throw new Error("OPENAI_API_KEY is missing");
      console.log(`[gen] ${ex.id}: calling OpenAI (dall-e-3) for side-by-side image...`);
      const res = await callOpenAIImage(prompt, openaiApiKey);
      imageBuffer = res.imageBuffer;
      mimeType = res.mimeType;
    } else {
      console.log(`[gen] ${ex.id}: calling ${MODEL} for side-by-side image...`);
      const res = await callGeminiImage(prompt, apiKey!, [], "16:9");
      imageBuffer = res.imageBuffer;
      mimeType = res.mimeType;
    }

    // Step 3: Save the combined image for review
    const combinedPath = path.join(exDir, `combined.${extensionForMimeType(mimeType)}`);
    fs.writeFileSync(combinedPath, imageBuffer);
    const combinedPng = await ensurePng(combinedPath, mimeType);

    // Step 4: Split into start/end halves
    console.log(`[gen] ${ex.id}: splitting side-by-side into start/end...`);
    const combinedBuffer = fs.readFileSync(combinedPng);
    const { left, right } = await splitSideBySide(combinedBuffer);

    // Step 5: Process each half → 512×512 webp
    await processHalfImage(left, path.join(exDir, "start.webp"));
    await processHalfImage(right, path.join(exDir, "end.webp"));

    // Clean up intermediate files
    fs.unlinkSync(combinedPng);
    if (combinedPath !== combinedPng && fs.existsSync(combinedPath)) {
      fs.unlinkSync(combinedPath);
    }

    let startAlt: string;
    let endAlt: string;
    if (apiKey) {
      startAlt = await describePose("start", ex, apiKey);
      endAlt = await describePose("end", ex, apiKey);
    } else {
      startAlt = `${ex.name} starting position`;
      endAlt = `${ex.name} ending position`;
    }
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
    if (cli.contactSheetV2) writeContactSheetV2(manifestEntries);
  }
}

main().catch((err) => {
  console.error("[gen] fatal:", (err as Error).message);
  process.exit(1);
});
