import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/bna-toast";
import {
  createAgentSession,
  pollAgentSession,
  revokeAgentSession,
  type AgentProposal,
  type AgentSession,
} from "@/lib/agent-access-client";
import { buildAgentSnapshot } from "@/lib/agent-access-snapshot";
import { clearStoredAgentSession, loadStoredAgentSession, saveStoredAgentSession } from "@/lib/agent-access-session-store";
import { getAgentExerciseNames, importAgentTemplate } from "@/lib/db/agent-access";
import type { AgentAccessScope, AgentTemplateProposal } from "@/shared/agent-access";

export const DEFAULT_AGENT_SCOPE: AgentAccessScope = {
  sessions: true,
  templates: true,
  exerciseLibrary: true,
  personalRecords: true,
};

export function useAgentAccess() {
  const toast = useToast();
  const [days, setDays] = useState("90");
  const [scope, setScope] = useState<AgentAccessScope>(DEFAULT_AGENT_SCOPE);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(() => new Set());

  const forgetSession = useCallback(async () => {
    setSession(null);
    setProposals([]);
    await clearStoredAgentSession();
  }, []);

  useEffect(() => {
    void getAgentExerciseNames().then(setExerciseNames).catch(() => setExerciseNames({}));
    void loadStoredAgentSession().then(setSession).catch(() => clearStoredAgentSession());
  }, []);

  const poll = useCallback(async () => {
    if (!session) return;
    try {
      const current = await pollAgentSession(session);
      setProposals(current.proposals);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check proposals";
      if (message.includes("expired") || message.includes("revoked") || message.includes("invalid session")) {
        await forgetSession();
      }
      toast.error(message);
    }
  }, [forgetSession, session, toast]);

  useEffect(() => {
    if (!session) return;
    const initial = setTimeout(() => { void poll(); }, 0);
    const timer = setInterval(() => { void poll(); }, 5000);
    const expiry = setTimeout(() => { void forgetSession(); }, Math.max(0, session.expiresAt - Date.now()));
    return () => { clearTimeout(initial); clearInterval(timer); clearTimeout(expiry); };
  }, [forgetSession, poll, session]);

  const start = async () => {
    setBusy(true);
    try {
      const parsedDays = Number(days);
      if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) throw new Error("Choose 1–3650 days.");
      const snapshot = await buildAgentSnapshot({ days: parsedDays, scope });
      const created = await createAgentSession(snapshot);
      await saveStoredAgentSession(created);
      setSession(created);
      setProposals([]);
      setImportedIds(new Set());
      toast.success("Temporary Agent access started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start Agent access");
    } finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await revokeAgentSession(session);
      await forgetSession();
      toast.success("Agent access revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke Agent access");
    } finally { setBusy(false); }
  };

  const importProposal = async (proposal: AgentTemplateProposal, id: string) => {
    setBusy(true);
    try {
      const templateId = await importAgentTemplate(proposal);
      setImportedIds((current) => new Set(current).add(id));
      toast.success(`Imported ${proposal.template.name}`);
      return templateId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import proposal");
      return null;
    } finally { setBusy(false); }
  };

  return { days, setDays, scope, setScope, session, proposals, exerciseNames, busy, importedIds, start, poll, revoke, importProposal };
}
