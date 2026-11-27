import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { ProposalCard } from "@/components/agent-access/ProposalCard";
import { useToast } from "@/components/ui/bna-toast";
import { spacing } from "@/constants/design-tokens";
import { useLayout } from "@/lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useAgentAccess } from "@/hooks/useAgentAccess";
import { parsePastedProposal } from "@/lib/agent-access-proposal";
import type { AgentTemplateProposal } from "@/shared/agent-access";

function ScopeToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.scopeRow}><Text variant="body">{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}

export default function AgentAccessScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const toast = useToast();
  const access = useAgentAccess();
  const [now, setNow] = useState(() => new Date().getTime());
  const [paste, setPaste] = useState("");
  const [pastedProposal, setPastedProposal] = useState<AgentTemplateProposal | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secondsLeft = access.session ? Math.max(0, Math.ceil((access.session.expiresAt - now) / 1000)) : 0;
  const copyPrompt = async () => {
    if (!access.session) return;
    await Clipboard.setStringAsync(access.session.prompt);
    toast.success("Agent prompt copied");
  };
  const previewPaste = () => {
    try { setPastedProposal(parsePastedProposal(paste)); toast.success("Proposal validated"); }
    catch (error) { setPastedProposal(null); toast.error(error instanceof Error ? error.message : "Invalid proposal"); }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Agent access" }} />
      <ScrollView testID="agent-access-screen" style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}> 
        <Text variant="title">Use your own AI agent</Text>
        <Text variant="body">Share a temporary snapshot with an agent you already trust. Agents can propose templates, but only you can import them.</Text>
        {!access.session ? (
          <Card variant="outline">
            <Text variant="title">Snapshot scope</Text>
            <ScopeToggle label="Workouts and sessions" value={access.scope.sessions} onChange={(sessions) => access.setScope({ ...access.scope, sessions })} />
            <ScopeToggle label="Templates" value={access.scope.templates} onChange={(templates) => access.setScope({ ...access.scope, templates })} />
            <ScopeToggle label="Exercise library" value={access.scope.exerciseLibrary} onChange={(exerciseLibrary) => access.setScope({ ...access.scope, exerciseLibrary })} />
            <ScopeToggle label="Personal records" value={access.scope.personalRecords} onChange={(personalRecords) => access.setScope({ ...access.scope, personalRecords })} />
            <Input label="Days of workout history" keyboardType="number-pad" value={access.days} onChangeText={access.setDays} testID="agent-access-days" />
            <Button label="Start 30-minute session" onPress={access.start} disabled={access.busy || !Object.values(access.scope).some(Boolean)} loading={access.busy} testID="agent-access-start" />
          </Card>
        ) : (
          <Card variant="outline" testID="agent-access-active-session">
            <Text variant="title">Session active</Text>
            <Text variant="body">Expires in {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s</Text>
            <Text variant="caption">Copy the prompt into ChatGPT, Claude, Codex, or another HTTP-capable agent. The prompt contains the private agent token.</Text>
            <View style={styles.actions}>
              <Button label="Copy prompt" onPress={copyPrompt} testID="agent-access-copy-prompt" />
              <Button label="Check proposals" variant="outline" onPress={access.poll} loading={access.busy} />
              <Button label="Revoke" variant="destructive" onPress={access.revoke} loading={access.busy} />
            </View>
          </Card>
        )}

        <View style={styles.section}>
          <Text variant="title">Incoming proposals</Text>
          {access.proposals.length === 0 ? <Text variant="caption">No proposals yet.</Text> : null}
          {access.proposals.map((item) => (
            <ProposalCard key={item.id} proposal={item.proposal} submittedAt={item.submittedAt} imported={access.importedIds.has(item.id)} busy={access.busy} exerciseNames={access.exerciseNames} onImport={() => void access.importProposal(item.proposal, item.id)} />
          ))}
        </View>

        <Card variant="outline">
          <Text variant="title">Paste proposal JSON</Text>
          <Text variant="caption">For browse-only agents, paste their JSON here. Nothing is imported until you review it.</Text>
          <Input label="Proposal JSON" type="textarea" rows={6} value={paste} onChangeText={setPaste} autoCapitalize="none" testID="agent-paste-json" />
          <Button label="Validate proposal" variant="outline" onPress={previewPaste} testID="agent-validate-paste" />
        </Card>
        {pastedProposal ? (
          <ProposalCard proposal={pastedProposal} imported={access.importedIds.has("paste")} busy={access.busy} exerciseNames={access.exerciseNames} onImport={() => void access.importProposal(pastedProposal, "paste")} />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.base, paddingVertical: spacing.base, paddingBottom: spacing.xxl * 2 },
  scopeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  actions: { gap: spacing.sm, marginTop: spacing.base },
  section: { gap: spacing.sm },
});
