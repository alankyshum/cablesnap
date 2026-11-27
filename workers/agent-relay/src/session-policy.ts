import { MAX_PROPOSALS_PER_SESSION, type AgentTemplateProposal } from "../../../shared/agent-access.ts";

export type StoredSession = {
  ownerHash: string;
  agentHash: string;
  expiresAt: number;
  snapshot: string;
};

export type StoredProposal = {
  id: string;
  submittedAt: string;
  proposal: AgentTemplateProposal;
};

export class SessionPolicyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface SessionPersistence {
  create(session: StoredSession): Promise<void>;
  read(): StoredSession | null;
  clear(): Promise<void>;
  proposalCount(): number;
  insertProposal(proposal: StoredProposal): void;
  proposals(): StoredProposal[];
}

export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let different = a.length ^ b.length;
  for (let index = 0; index < length; index++) {
    different |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return different === 0;
}

export function randomCapability(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export class RelaySessionPolicy {
  private readonly persistence: SessionPersistence;
  private readonly now: () => number;
  private readonly id: () => string;
  constructor(
    persistence: SessionPersistence,
    now: () => number = Date.now,
    id: () => string = () => crypto.randomUUID(),
  ) {
    this.persistence = persistence;
    this.now = now;
    this.id = id;
  }

  async create(ownerHash: string, agentHash: string, expiresAt: number, snapshot: string): Promise<void> {
    await this.persistence.create({ ownerHash, agentHash, expiresAt, snapshot });
  }

  active(tokenHash: string, role: "owner" | "agent"): StoredSession {
    const session = this.persistence.read();
    if (!session) throw new SessionPolicyError("session revoked or not found", 401);
    if (session.expiresAt <= this.now()) {
      void this.persistence.clear();
      throw new SessionPolicyError("session expired", 410);
    }
    const expected = role === "owner" ? session.ownerHash : session.agentHash;
    if (!constantTimeEqual(tokenHash, expected)) throw new SessionPolicyError("invalid token", 401);
    return session;
  }

  snapshot(agentHash: string): unknown {
    return JSON.parse(this.active(agentHash, "agent").snapshot) as unknown;
  }

  submit(agentHash: string, proposal: AgentTemplateProposal): StoredProposal {
    const session = this.active(agentHash, "agent");
    assertExerciseIds(proposal, session.snapshot);
    if (this.persistence.proposalCount() >= MAX_PROPOSALS_PER_SESSION) {
      throw new SessionPolicyError("proposal limit exceeded", 429);
    }
    const stored = { id: this.id(), submittedAt: new Date(this.now()).toISOString(), proposal };
    this.persistence.insertProposal(stored);
    return stored;
  }

  poll(ownerHash: string): { expiresAt: number; proposals: StoredProposal[] } {
    const session = this.active(ownerHash, "owner");
    return { expiresAt: session.expiresAt, proposals: this.persistence.proposals() };
  }

  async revoke(ownerHash: string): Promise<void> {
    this.active(ownerHash, "owner");
    await this.persistence.clear();
  }

  async expire(): Promise<void> {
    await this.persistence.clear();
  }
}

export function assertExerciseIds(proposal: AgentTemplateProposal, snapshotJson: string): void {
  const snapshot = JSON.parse(snapshotJson) as { exerciseLibrary?: unknown[] };
  if (!Array.isArray(snapshot.exerciseLibrary)) throw new SessionPolicyError("snapshot exercise library unavailable", 422);
  const available = new Set(snapshot.exerciseLibrary.flatMap((item) => {
    if (typeof item !== "object" || item === null || !("id" in item) || typeof item.id !== "string") return [];
    return [item.id];
  }));
  const missing = proposal.template.exercises.find(({ exerciseId }) => !available.has(exerciseId));
  if (missing) throw new SessionPolicyError("proposal references an exercise outside the shared library", 422);
}
