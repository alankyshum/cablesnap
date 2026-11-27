import { View, StyleSheet } from "react-native";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { spacing } from "@/constants/design-tokens";
import type { AgentTemplateProposal } from "@/shared/agent-access";

type Props = {
  proposal: AgentTemplateProposal;
  submittedAt?: string;
  imported: boolean;
  busy: boolean;
  onImport: () => void;
};

export function ProposalCard({ proposal, submittedAt, imported, busy, onImport }: Props) {
  return (
    <Card variant="outline" testID="agent-proposal-card">
      <Text variant="title" testID="agent-proposal-name">{proposal.template.name}</Text>
      {proposal.template.notes ? <Text variant="caption">{proposal.template.notes}</Text> : null}
      {submittedAt ? <Text variant="caption">Received {new Date(submittedAt).toLocaleTimeString()}</Text> : null}
      <View style={styles.list}>
        {proposal.template.exercises.map((exercise, index) => (
          <Text key={`${exercise.exerciseId}-${index}`} variant="caption">
            {index + 1}. {exercise.exerciseId} · {exercise.targetSets} sets · {exercise.targetReps} reps · {exercise.restSeconds}s rest
          </Text>
        ))}
      </View>
      <Button
        label={imported ? "Imported" : "Review and import to templates"}
        onPress={onImport}
        disabled={busy || imported}
        loading={busy}
        testID="agent-import-proposal"
      />
    </Card>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.xs, marginVertical: spacing.base } });
