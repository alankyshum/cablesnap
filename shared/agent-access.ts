// BLD-5100: one versioned contract consumed by the app and Worker.
export const AGENT_ACCESS_SCHEMA_VERSION = "1" as const;
export const MAX_PROPOSAL_BYTES = 64 * 1024;
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const MAX_PROPOSALS_PER_SESSION = 20;

export type AgentAccessScope = {
  sessions: boolean;
  templates: boolean;
  exerciseLibrary: boolean;
  personalRecords: boolean;
};

export type AgentTemplateExercise = {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
};

export type AgentTemplateProposal = {
  schemaVersion: typeof AGENT_ACCESS_SCHEMA_VERSION;
  kind: "template-proposal";
  template: {
    name: string;
    notes?: string;
    exercises: AgentTemplateExercise[];
  };
};

export type AgentSnapshot = {
  schemaVersion: typeof AGENT_ACCESS_SCHEMA_VERSION;
  generatedAt: string;
  range: { from: string; to: string; days: number };
  scope: AgentAccessScope;
  sessions: unknown[];
  templates: unknown[];
  exerciseLibrary: unknown[];
  personalRecords: unknown[];
};

export type ProposalValidation =
  | { success: true; data: AgentTemplateProposal }
  | { success: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const boundedString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const hasOnlyKeys = (value: Record<string, unknown>, allowed: string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

function validateExercise(value: unknown, index: number): AgentTemplateExercise | string {
  if (!isRecord(value) || !hasOnlyKeys(value, ["exerciseId", "targetSets", "targetReps", "restSeconds"]) ||
      !boundedString(value.exerciseId, 128) ||
      !Number.isInteger(value.targetSets) || (value.targetSets as number) < 1 || (value.targetSets as number) > 20 ||
      !boundedString(value.targetReps, 40) || !Number.isInteger(value.restSeconds) ||
      (value.restSeconds as number) < 0 || (value.restSeconds as number) > 1800) {
    return `template.exercises[${index}] is invalid`;
  }
  return {
    exerciseId: value.exerciseId,
    targetSets: value.targetSets as number,
    targetReps: value.targetReps,
    restSeconds: value.restSeconds as number,
  };
}

function validateTemplate(value: Record<string, unknown>): AgentTemplateProposal["template"] | string {
  if (!hasOnlyKeys(value, ["name", "notes", "exercises"]) || !boundedString(value.name, 100)) return "template.name must contain 1–100 characters";
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 500)) return "template.notes must be at most 500 characters";
  if (!Array.isArray(value.exercises) || value.exercises.length < 1 || value.exercises.length > 30) return "template.exercises must contain 1–30 items";
  const exercises: AgentTemplateExercise[] = [];
  for (const [index, item] of value.exercises.entries()) {
    const exercise = validateExercise(item, index);
    if (typeof exercise === "string") return exercise;
    exercises.push(exercise);
  }
  return { name: value.name, ...(typeof value.notes === "string" ? { notes: value.notes } : {}), exercises };
}

export function validateAgentTemplateProposal(value: unknown): ProposalValidation {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACCESS_SCHEMA_VERSION) return { success: false, error: "Unsupported or missing schemaVersion" };
  if (!hasOnlyKeys(value, ["schemaVersion", "kind", "template"]) || value.kind !== "template-proposal" || !isRecord(value.template)) {
    return { success: false, error: "Expected a template-proposal with only supported fields" };
  }
  const template = validateTemplate(value.template);
  if (typeof template === "string") return { success: false, error: template };
  return { success: true, data: { schemaVersion: AGENT_ACCESS_SCHEMA_VERSION, kind: "template-proposal", template } };
}

export const AGENT_ACCESS_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://cablesnap-agent-relay.alankyshum.workers.dev/v1/schema.json",
  title: "CableSnap agent template proposal",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "template"],
  properties: {
    schemaVersion: { const: AGENT_ACCESS_SCHEMA_VERSION },
    kind: { const: "template-proposal" },
    template: {
      type: "object",
      additionalProperties: false,
      required: ["name", "exercises"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 100 },
        notes: { type: "string", maxLength: 500 },
        exercises: {
          type: "array", minItems: 1, maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["exerciseId", "targetSets", "targetReps", "restSeconds"],
            properties: {
              exerciseId: { type: "string", minLength: 1, maxLength: 128 },
              targetSets: { type: "integer", minimum: 1, maximum: 20 },
              targetReps: { type: "string", minLength: 1, maxLength: 40 },
              restSeconds: { type: "integer", minimum: 0, maximum: 1800 },
            },
          },
        },
      },
    },
  },
} as const;

export const AGENT_ACCESS_SKILL = `# CableSnap Agent access (schema ${AGENT_ACCESS_SCHEMA_VERSION})\n\nThe shared snapshot is private and temporary. Analyze it without changing user data, and use only IDs from exerciseLibrary. Validate proposal JSON at /v1/schema.json (schemaVersion "${AGENT_ACCESS_SCHEMA_VERSION}").\n\n- HTTP-capable agents: POST exactly one validated template-proposal to the proposal URL with Authorization: Bearer <agent token>. Do not also output JSON.\n- Browse-only agents: output exactly one fenced \`\`\`json block containing the validated proposal, with no second proposal or raw data.\n- Never expose tokens, request owner endpoints, or retain the snapshot beyond this session.\n- Equipment photos stay with the agent: ask the user to provide them directly in chat.\n`;
