import { ScrollView, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { ImportResult } from "./types";

type Props = {
  result: ImportResult;
  onDone: () => void;
};

export default function ImportComplete({ result, onDone }: Props) {
  const colors = useThemeColors();
  return (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <Text variant="heading" style={{ color: colors.primary, marginBottom: 16, textAlign: "center" }} accessibilityRole="header">Import Complete! ✓</Text>
      <Card style={{ ...styles.card, backgroundColor: colors.surface }}><CardContent>
        <Text style={{ color: colors.onSurface, marginBottom: 4 }}>Sessions imported: {result.sessionsImported}</Text>
        <Text style={{ color: colors.onSurface, marginBottom: 4 }}>Exercises created: {result.exercisesCreated}</Text>
        <Text style={{ color: colors.onSurface, marginBottom: 4 }}>Sets imported: {result.setsImported}</Text>
        {(result.skippedTimed > 0 || result.skippedDistance > 0) && (
          <Text style={{ color: colors.onSurfaceVariant }}>Skipped: {result.skippedTimed} timed, {result.skippedDistance} distance</Text>
        )}
      </CardContent></Card>
      <Button variant="default" onPress={onDone} style={{ marginTop: 16 }} accessibilityLabel="Return to settings" accessibilityRole="button">Done</Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stepContainer: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 12, borderRadius: 12 },
});
