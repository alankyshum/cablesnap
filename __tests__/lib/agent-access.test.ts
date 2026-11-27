// BLD-5100: covers AC1, AC9, AC10, AC13 and AC14 from PLAN-BLD-5100.md.
import fs from "node:fs";
import path from "node:path";
import { parsePastedProposal } from "../../lib/agent-access-proposal";
import { AGENT_RELAY_ORIGIN, resolveAgentRelayOrigin } from "../../lib/agent-access-client";
import { randomCapability, safeCapabilityEqual } from "../../workers/agent-relay/src/security";
import {
  AGENT_ACCESS_JSON_SCHEMA,
  AGENT_ACCESS_SCHEMA_VERSION,
  AGENT_ACCESS_SKILL,
  MAX_PROPOSAL_BYTES,
  validateAgentSnapshot,
  validateAgentTemplateProposal,
} from "../../shared/agent-access";

const snapshot = {
  schemaVersion: AGENT_ACCESS_SCHEMA_VERSION,
  generatedAt: "2026-11-27T00:00:00.000Z",
  range: { from: "2026-08-29T00:00:00.000Z", to: "2026-11-27T00:00:00.000Z", days: 90 },
  scope: { sessions: true, templates: true, exerciseLibrary: true, personalRecords: true },
  sessions: [], templates: [], exerciseLibrary: [], personalRecords: [],
};

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
    expect(AGENT_ACCESS_SKILL).toContain("act as browse-only and output exactly one fenced");
    expect(AGENT_ACCESS_SKILL).toContain("error code: 1010");
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
    expect(validateAgentSnapshot(snapshot).success).toBe(true);
    expect(validateAgentSnapshot({ ...snapshot, nutrition: [] }).success).toBe(false);
    expect(validateAgentSnapshot({ ...snapshot, scope: { ...snapshot.scope, nutrition: true } }).success).toBe(false);
    expect(JSON.stringify(snapshot)).not.toMatch(/nutrition/i);
    expect(Object.keys(AGENT_ACCESS_JSON_SCHEMA.properties.template.properties).sort()).toEqual(["exercises", "name", "notes"]);
  });

  it("BLD-5100 AC13 accepts fenced paste JSON through the shared validator", () => {
    expect(parsePastedProposal(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toEqual(valid);
  });

  it("BLD-5100 AC14 keeps validator and published JSON schema version aligned", () => {
    expect(AGENT_ACCESS_JSON_SCHEMA.properties.schemaVersion.const).toBe(AGENT_ACCESS_SCHEMA_VERSION);
    expect(AGENT_ACCESS_JSON_SCHEMA.properties.kind.const).toBe(valid.kind);
    expect(AGENT_ACCESS_JSON_SCHEMA.$id).toBe("https://cablesnap-agent-relay.alankyshum.workers.dev/v1/schema.json");
    expect(AGENT_ACCESS_SKILL).toContain(`/v1/schema.json (schemaVersion "${AGENT_ACCESS_SCHEMA_VERSION}")`);
  });

  it("BLD-5100 network boundary rejects arbitrary and AI-provider relay origins", () => {
    expect(resolveAgentRelayOrigin()).toBe(AGENT_RELAY_ORIGIN);
    expect(resolveAgentRelayOrigin(AGENT_RELAY_ORIGIN, false)).toBe(AGENT_RELAY_ORIGIN);
    expect(resolveAgentRelayOrigin("http://localhost:8090", true)).toBe("http://localhost:8090");
    expect(() => resolveAgentRelayOrigin("https://openrouter.ai", false)).toThrow("not allowed");
    expect(() => resolveAgentRelayOrigin("https://arbitrary.example", false)).toThrow("not allowed");
    expect(() => resolveAgentRelayOrigin("http://127.0.0.1:8090", false)).toThrow("not allowed");
  });

  it("BLD-5100 AC22 Worker capabilities are 256-bit and constant-time compared", () => {
    expect(Buffer.from(randomCapability(), "base64url").byteLength).toBe(32);
    expect(safeCapabilityEqual("same-hash", "same-hash")).toBe(true);
    expect(safeCapabilityEqual("same-hash", "other-hash")).toBe(false);
  });

  it("BLD-5100 AC12 relay contains no payload/token logging and alarm deletes relay rows", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "workers/agent-relay/src/index.ts"), "utf8");
    expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
    expect(source).toMatch(/DELETE FROM proposals/);
    expect(source).toMatch(/DELETE FROM session/);
    const wrangler = fs.readFileSync(path.join(process.cwd(), "workers/agent-relay/wrangler.toml"), "utf8");
    expect(wrangler).toMatch(/\[observability\][\s\S]*enabled = false/);
    expect(wrangler).toMatch(/invocation_logs = false/);
    expect(wrangler).toMatch(/head_sampling_rate = 0/);
  });
});
