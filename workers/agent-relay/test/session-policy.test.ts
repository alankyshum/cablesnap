// BLD-5100: worker hardening AC5-AC8, AC11, capability isolation and cleanup.
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PROPOSALS_PER_SESSION, type AgentTemplateProposal } from "../../../shared/agent-access.ts";
import {
  RelaySessionPolicy,
  SessionPolicyError,
  constantTimeEqual,
  randomCapability,
  type SessionPersistence,
  type StoredProposal,
  type StoredSession,
} from "../src/session-policy.ts";

class MemoryPersistence implements SessionPersistence {
  session: StoredSession | null = null;
  items: StoredProposal[] = [];
  clears = 0;
  async create(session: StoredSession) { this.session = session; this.items = []; }
  read() { return this.session; }
  async clear() { this.session = null; this.items = []; this.clears++; }
  proposalCount() { return this.items.length; }
  insertProposal(proposal: StoredProposal) { this.items.push(proposal); }
  proposals() { return [...this.items]; }
}

const proposal: AgentTemplateProposal = {
  schemaVersion: "1",
  kind: "template-proposal",
  template: { name: "Test", exercises: [{ exerciseId: "ex-1", targetSets: 3, targetReps: "8", restSeconds: 60 }] },
};
const fixtureSnapshot = JSON.stringify({ schemaVersion: "1", exerciseLibrary: [{ id: "ex-1", name: "Press" }] });

async function setup(now = 1000) {
  const persistence = new MemoryPersistence();
  let current = now;
  const policy = new RelaySessionPolicy(persistence, () => current, () => `proposal-${persistence.items.length}`);
  await policy.create("owner-hash", "agent-hash", now + 1000, fixtureSnapshot);
  return { policy, persistence, advance: (value: number) => { current += value; } };
}

function expectPolicyError(action: () => unknown, status: number) {
  assert.throws(action, (error: unknown) => error instanceof SessionPolicyError && error.status === status);
}

test("BLD-5100 AC5 agent capability cannot poll or revoke", async () => {
  const { policy } = await setup();
  expectPolicyError(() => policy.poll("agent-hash"), 401);
  await assert.rejects(() => policy.revoke("agent-hash"), (error: unknown) => error instanceof SessionPolicyError && error.status === 401);
});

test("BLD-5100 AC5 owner capability cannot read or submit as agent", async () => {
  const { policy } = await setup();
  expectPolicyError(() => policy.snapshot("owner-hash"), 401);
  expectPolicyError(() => policy.submit("owner-hash", proposal), 401);
});

test("BLD-5100 AC8 missing, wrong and cross-session tokens are rejected", async () => {
  const { policy } = await setup();
  expectPolicyError(() => policy.snapshot(""), 401);
  expectPolicyError(() => policy.snapshot("wrong-hash"), 401);
  expectPolicyError(() => policy.poll("another-session-owner"), 401);
});

test("BLD-5100 AC6 expired snapshot and proposal clear all relay data", async () => {
  const { policy, persistence, advance } = await setup();
  advance(1001);
  expectPolicyError(() => policy.snapshot("agent-hash"), 410);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(persistence.session, null);
  assert.deepEqual(persistence.items, []);
});

test("BLD-5100 AC7 revoke immediately clears snapshot and proposals", async () => {
  const { policy, persistence } = await setup();
  policy.submit("agent-hash", proposal);
  await policy.revoke("owner-hash");
  assert.equal(persistence.clears, 1);
  expectPolicyError(() => policy.snapshot("agent-hash"), 401);
  expectPolicyError(() => policy.submit("agent-hash", proposal), 401);
});

test("BLD-5100 AC11 maximum proposal count returns 429", async () => {
  const { policy } = await setup();
  for (let index = 0; index < MAX_PROPOSALS_PER_SESSION; index++) policy.submit("agent-hash", proposal);
  expectPolicyError(() => policy.submit("agent-hash", proposal), 429);
});

test("BLD-5100 AC9 worker rejects exercise IDs outside the shared library", async () => {
  const { policy } = await setup();
  const unknown = structuredClone(proposal);
  unknown.template.exercises[0].exerciseId = "not-in-library";
  expectPolicyError(() => policy.submit("agent-hash", unknown), 422);
});

test("BLD-5100 AC5 capabilities use 256-bit random values and constant-time comparison", () => {
  assert.equal(Buffer.from(randomCapability(), "base64url").byteLength, 32);
  assert.equal(Buffer.from(randomCapability(), "base64url").byteLength, 32);
  assert.equal(constantTimeEqual("same", "same"), true);
  assert.equal(constantTimeEqual("same", "diff"), false);
  assert.equal(constantTimeEqual("short", "longer"), false);
});
