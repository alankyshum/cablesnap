// BLD-5100: one versioned contract consumed by the app and Worker.
export const AGENT_ACCESS_SCHEMA_VERSION = "1" as const;
export const MAX_PROPOSAL_BYTES = 64 * 1024;
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

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
export type SnapshotValidation =
  | { success: true; data: AgentSnapshot }
  | { success: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const boundedString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function validateSnapshotScope(value: unknown): value is AgentAccessScope {
  if (!isRecord(value)) return false;
  const fields = ["sessions", "templates", "exerciseLibrary", "personalRecords"] as const;
  return Object.keys(value).length === fields.length && fields.every((field) => typeof value[field] === "boolean");
}

export function validateAgentSnapshot(value: unknown): SnapshotValidation {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACCESS_SCHEMA_VERSION) {
    return { success: false, error: "Unsupported or missing schemaVersion" };
  }
  const expectedKeys = ["schemaVersion", "generatedAt", "range", "scope", "sessions", "templates", "exerciseLibrary", "personalRecords"];
  if (Object.keys(value).some((key) => !expectedKeys.includes(key)) || !validDate(value.generatedAt) || !isRecord(value.range)) {
    return { success: false, error: "Snapshot shape is invalid" };
  }
  const { range } = value;
  if (!validDate(range.from) || !validDate(range.to) || !Number.isInteger(range.days) ||
      (range.days as number) < 1 || (range.days as number) > 3650 || !validateSnapshotScope(value.scope)) {
    return { success: false, error: "Snapshot range or scope is invalid" };
  }
  if (![value.sessions, value.templates, value.exerciseLibrary, value.personalRecords].every(Array.isArray)) {
    return { success: false, error: "Snapshot collections must be arrays" };
  }
  return { success: true, data: value as AgentSnapshot };
}

function validateExercise(value: unknown, index: number): AgentTemplateExercise | string {
  if (!isRecord(value) || !boundedString(value.exerciseId, 128) ||
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

export function validateAgentTemplateProposal(value: unknown): ProposalValidation {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACCESS_SCHEMA_VERSION) {
    return { success: false, error: "Unsupported or missing schemaVersion" };
  }
  if (value.kind !== "template-proposal" || !isRecord(value.template)) {
    return { success: false, error: "Expected a template-proposal" };
  }
  const { template } = value;
  if (!boundedString(template.name, 100)) {
    return { success: false, error: "template.name must contain 1–100 characters" };
  }
  if (template.notes !== undefined && (typeof template.notes !== "string" || template.notes.length > 500)) {
    return { success: false, error: "template.notes must be at most 500 characters" };
  }
  if (!Array.isArray(template.exercises) || template.exercises.length < 1 || template.exercises.length > 30) {
    return { success: false, error: "template.exercises must contain 1–30 items" };
  }
  const exercises: AgentTemplateExercise[] = [];
  for (const [index, item] of template.exercises.entries()) {
    const exercise = validateExercise(item, index);
    if (typeof exercise === "string") return { success: false, error: exercise };
    exercises.push(exercise);
  }
  return {
    success: true,
    data: {
      schemaVersion: AGENT_ACCESS_SCHEMA_VERSION,
      kind: "template-proposal",
      template: {
        name: template.name,
        ...(typeof template.notes === "string" ? { notes: template.notes } : {}),
        exercises,
      },
    },
  };
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

export const AGENT_ACCESS_SKILL = `# CableSnap Agent access\n\nYou may read the user's explicitly shared, temporary workout snapshot, answer questions about it, and propose workout templates. A proposal never changes the user's data: the app user must review and import it.\n\n- Fetch the snapshot URL from the prompt. It is private and expires.\n- Use only exercise IDs present in the snapshot's exerciseLibrary.\n- To submit a proposal, POST JSON to the proposal URL with "Authorization: Bearer <agent token>".\n- Proposal JSON must validate against /v1/schema.json (schemaVersion "${AGENT_ACCESS_SCHEMA_VERSION}").\n- If your chat app cannot POST, return one fenced JSON block for the user to paste into CableSnap. Do not invent exercise IDs.\n- Photos stay with the agent: ask the user to provide equipment photos directly to your chat if useful.\n- Do not expose tokens, and do not ask to store the snapshot beyond the session.\n`;
