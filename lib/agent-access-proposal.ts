import { MAX_PROPOSAL_BYTES, validateAgentTemplateProposal, type AgentTemplateProposal } from "@/shared/agent-access";

export function parsePastedProposal(raw: string): AgentTemplateProposal {
  if (new TextEncoder().encode(raw).byteLength > MAX_PROPOSAL_BYTES) throw new Error("Proposal is too large.");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  let parsed: unknown;
  try { parsed = JSON.parse(fenced.trim()); } catch { throw new Error("Paste valid proposal JSON."); }
  const result = validateAgentTemplateProposal(parsed);
  if (!result.success) throw new Error(result.error);
  return result.data;
}
