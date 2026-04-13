import { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  DataTable,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Stack } from "expo-router";
import { useFocusEffect } from "expo-router";
import { getBodySettings } from "../../lib/db";
import { epley, brzycki, lombardi, average, percentageTable } from "../../lib/rm";

export default function RMCalculator() {
  const theme = useTheme();
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const body = await getBodySettings();
        setUnit(body.weight_unit);
      })();
    }, []),
  );

  const parsed = parseFloat(weight);
  const parsedReps = parseInt(reps, 10);
  const valid = !isNaN(parsed) && parsed > 0 && !isNaN(parsedReps) && parsedReps > 0;
  const warn = valid && parsedReps > 12;

  const results = useMemo(() => {
    if (!valid) return null;
    const e = Math.round(epley(parsed, parsedReps) * 10) / 10;
    const b = Math.round(brzycki(parsed, parsedReps) * 10) / 10;
    const l = Math.round(lombardi(parsed, parsedReps) * 10) / 10;
    const avg = Math.round(average(parsed, parsedReps) * 10) / 10;
    return { epley: e, brzycki: b, lombardi: l, average: avg };
  }, [valid, parsed, parsedReps]);

  const table = useMemo(() => {
    if (!results) return [];
    return percentageTable(results.average);
  }, [results]);

  const label = unit === "kg" ? "kilograms" : "pounds";

  return (
    <>
      <Stack.Screen options={{ title: "1RM Calculator" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 8 }}>
            Weight
          </Text>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
            placeholder="0"
            right={<TextInput.Affix text={unit} />}
            style={styles.input}
            accessibilityLabel={`Weight in ${label}`}
          />

          <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginTop: 16, marginBottom: 8 }}>
            Reps
          </Text>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={reps}
            onChangeText={setReps}
            placeholder="0"
            style={styles.input}
            accessibilityLabel="Number of repetitions"
          />

          {valid && !results && (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
              Enter weight and reps to calculate
            </Text>
          )}

          {!valid && weight !== "" && (
            <Text variant="bodyMedium" style={{ color: theme.colors.error, marginTop: 12, textAlign: "center" }}>
              {parsed <= 0 || isNaN(parsed) ? "Enter a weight" : "Enter reps"}
            </Text>
          )}

          {warn && (
            <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8, textAlign: "center" }}>
              ⚠ Estimates become less accurate above 12 reps
            </Text>
          )}

          {results && (
            <View style={styles.results}>
              <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
                Estimated 1RM
              </Text>
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title>Formula</DataTable.Title>
                  <DataTable.Title numeric>Est 1RM</DataTable.Title>
                </DataTable.Header>
                <DataTable.Row accessibilityLabel={`Epley formula, ${results.epley} ${label}`}>
                  <DataTable.Cell>Epley</DataTable.Cell>
                  <DataTable.Cell numeric>{results.epley} {unit}</DataTable.Cell>
                </DataTable.Row>
                <DataTable.Row accessibilityLabel={`Brzycki formula, ${results.brzycki} ${label}`}>
                  <DataTable.Cell>Brzycki</DataTable.Cell>
                  <DataTable.Cell numeric>{results.brzycki} {unit}</DataTable.Cell>
                </DataTable.Row>
                <DataTable.Row accessibilityLabel={`Lombardi formula, ${results.lombardi} ${label}`}>
                  <DataTable.Cell>Lombardi</DataTable.Cell>
                  <DataTable.Cell numeric>{results.lombardi} {unit}</DataTable.Cell>
                </DataTable.Row>
                <DataTable.Row style={{ backgroundColor: theme.colors.primaryContainer }}>
                  <DataTable.Cell textStyle={{ fontWeight: "700" }}
                    accessibilityLabel={`Average of all formulas, ${results.average} ${label}`}
                  >Average</DataTable.Cell>
                  <DataTable.Cell numeric textStyle={{ fontWeight: "700" }}>{results.average} {unit}</DataTable.Cell>
                </DataTable.Row>
              </DataTable>

              <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                % 1RM Table
              </Text>
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title>% 1RM</DataTable.Title>
                  <DataTable.Title numeric>Weight</DataTable.Title>
                  <DataTable.Title numeric>Rep Range</DataTable.Title>
                </DataTable.Header>
                {table.map((row) => (
                  <DataTable.Row
                    key={row.pct}
                    accessibilityLabel={`${row.pct} percent of one rep max, ${row.weight} ${label}, ${row.reps} reps`}
                  >
                    <DataTable.Cell>{row.pct}%</DataTable.Cell>
                    <DataTable.Cell numeric>{row.weight} {unit}</DataTable.Cell>
                    <DataTable.Cell numeric>{row.reps}</DataTable.Cell>
                  </DataTable.Row>
                ))}
              </DataTable>

              <Text variant="bodySmall" style={[styles.disclaimer, { color: theme.colors.onSurfaceVariant }]}>
                Estimates based on submaximal performance. Actual 1RM may vary. Estimates become less accurate above 12 reps.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  input: {
    fontSize: 18,
  },
  results: {
    marginTop: 24,
  },
  disclaimer: {
    marginTop: 16,
    textAlign: "center",
    fontStyle: "italic",
  },
});
