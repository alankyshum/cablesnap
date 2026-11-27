// BLD-5100: covers AC1, AC9, AC10, AC13 and AC14 from PLAN-BLD-5100.md.
import { parsePastedProposal } from "../../lib/agent-access-proposal";
import {
  AGENT_ACCESS_JSON_SCHEMA,
  AGENT_ACCESS_SCHEMA_VERSION,
  AGENT_ACCESS_SKILL,
  MAX_PROPOSAL_BYTES,
  validateAgentTemplateProposal,
} from "../../shared/agent-access";

const valid = {
  schemaVersion: AGENT_ACCESS_SCHEMA_VERSION,
  kind: "template-proposal",
  template: {
    name: "Agent Upper A",
    notes: "Review before importing",
    exercises: [{ exerciseId: "bench-press", targetSets: 3, targetReps: "8-10", restSeconds: 120 }],
  },
};

describe("BLD-5100 Agent access contract", () => {
  it("BLD-5100 AC1 publishes the shared schema version and skill", () => {
    expect(validateAgentTemplateProposal(valid).success).toBe(true);
    expect(AGENT_ACCESS_SKILL).toContain("/v1/schema.json");
    expect(AGENT_ACCESS_SKILL).toContain("Browse-only agents: output exactly one fenced");
    expect(AGENT_ACCESS_SKILL).toContain("HTTP-capable agents: POST exactly one");
  });

  it("BLD-5100 AC9 rejects schema-invalid and oversized proposals", () => {
    expect(validateAgentTemplateProposal({ ...valid, schemaVersion: "999" }).success).toBe(false);
    expect(validateAgentTemplateProposal({ ...valid, unexpected: true }).success).toBe(false);
    expect(validateAgentTemplateProposal({ ...valid, template: { ...valid.template, name: undefined } }).success).toBe(false);
    expect(validateAgentTemplateProposal({ ...valid, template: { ...valid.template, exercises: [] } }).success).toBe(false);
    expect(validateAgentTemplateProposal({ ...valid, template: { ...valid.template, exercises: [{ ...valid.template.exercises[0], targetSets: 0 }] } }).success).toBe(false);
    expect(() => parsePastedProposal("x".repeat(MAX_PROPOSAL_BYTES + 1))).toThrow("too large");
  });

  it("BLD-5100 AC10 excludes nutrition from the shared snapshot scope", () => {
    expect(validateAgentTemplateProposal(valid).success).toBe(true);
    expect(Object.keys(AGENT_ACCESS_JSON_SCHEMA.properties.template.properties).sort()).toEqual(["exercises", "name", "notes"]);
    expect(JSON.stringify(AGENT_ACCESS_JSON_SCHEMA)).not.toMatch(/nutrition/i);
  });

  it("BLD-5100 AC13 accepts fenced paste JSON through the shared validator", () => {
    expect(parsePastedProposal(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toEqual(valid);
  });

  it("BLD-5100 AC14 keeps validator and published JSON schema version aligned", () => {
    expect(AGENT_ACCESS_JSON_SCHEMA.properties.schemaVersion.const).toBe(AGENT_ACCESS_SCHEMA_VERSION);
    expect(AGENT_ACCESS_JSON_SCHEMA.properties.kind.const).toBe(valid.kind);
    expect(AGENT_ACCESS_JSON_SCHEMA.$id).toBe("https://cablesnap-agent-relay.alankyshum.workers.dev/v1/schema.json");
  });
});
