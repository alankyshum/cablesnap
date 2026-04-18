import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { DataTable, IconButton, Text, TextInput } from "react-native-paper";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { getBodySettings } from "../../lib/db";
import { epley, brzycki, lombardi, average, percentageTable } from "../../lib/rm";
import { useThemeColors } from "@/hooks/useThemeColors";

export function RMCalculatorContent() {
  const colors = useThemeColors();
  const router = useRouter();
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const body = await getBodySettings();
          setUnit(body.weight_unit);
        } catch {
          // Fall back to default unit if settings unavailable
        }
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
    <View>
      <View style={styles.inputRow}>
        <View style={styles.weightWrap}>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
            placeholder="Weight"
            right={<TextInput.Affix text={unit} />}
            accessibilityLabel={`Weight in ${label}`}
          />
        </View>
        <Text variant="titleLarge" style={{ color: colors.onSurfaceVariant }}>×</Text>
        <View style={styles.repsWrap}>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={reps}
            onChangeText={setReps}
            placeholder="Reps"
            accessibilityLabel="Number of repetitions"
          />
        </View>
      </View>

      {!valid && weight !== "" && (
        <Text variant="bodySmall" style={{ color: colors.error, marginTop: 8, textAlign: "center" }}>
          {parsed <= 0 || isNaN(parsed) ? "Enter a weight" : "Enter reps"}
        </Text>
      )}

      {warn && (
        <Text variant="bodySmall" style={{ color: colors.error, marginTop: 8, textAlign: "center" }}>
          ⚠ Estimates become less accurate above 12 reps
        </Text>
      )}

      {results && (
        <View style={styles.results}>
          <Text variant="titleMedium" style={{ color: colors.onBackground, marginBottom: 12 }}>
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
            <DataTable.Row style={{ backgroundColor: colors.primaryContainer }}>
              <DataTable.Cell textStyle={{ fontWeight: "700" }}
                accessibilityLabel={`Average of all formulas, ${results.average} ${label}`}
              >Average</DataTable.Cell>
              <DataTable.Cell numeric textStyle={{ fontWeight: "700" }}>{results.average} {unit}</DataTable.Cell>
            </DataTable.Row>
          </DataTable>

          <Text variant="titleMedium" style={{ color: colors.onBackground, marginTop: 24, marginBottom: 12 }}>
            % 1RM Table
          </Text>
          <DataTable>
            <DataTable.Header>
              <DataTable.Title>% 1RM</DataTable.Title>
              <DataTable.Title numeric>Weight</DataTable.Title>
              <DataTable.Title numeric>Rep Range</DataTable.Title>
              <DataTable.Title numeric style={{ flex: 0.4 }}> </DataTable.Title>
            </DataTable.Header>
            <FlatList
              data={table}
              keyExtractor={(item) => String(item.pct)}
              scrollEnabled={false}
              renderItem={({ item: row }) => (
                <DataTable.Row
                  accessibilityLabel={`${row.pct} percent of one rep max, ${row.weight} ${label}, ${row.reps} reps`}
                >
                  <DataTable.Cell>{row.pct}%</DataTable.Cell>
                  <DataTable.Cell numeric>{row.weight} {unit}</DataTable.Cell>
                  <DataTable.Cell numeric>{row.reps}</DataTable.Cell>
                  <DataTable.Cell numeric style={{ flex: 0.4 }}>
                    <IconButton
                      icon="weight"
                      size={18}
                      onPress={() => router.push(`/tools/plates?weight=${row.weight}`)}
                      accessibilityLabel={`Calculate plates for ${row.weight}${unit}`}
                      accessibilityRole="button"
                      style={{ minWidth: 48, minHeight: 48 }}
                      iconColor={colors.onSurfaceVariant}
                    />
                  </DataTable.Cell>
                </DataTable.Row>
              )}
            />
          </DataTable>

          <Text variant="bodySmall" style={[styles.disclaimer, { color: colors.onSurfaceVariant }]}>
            Estimates based on submaximal performance. Actual 1RM may vary. Estimates become less accurate above 12 reps.
          </Text>
        </View>
      )}
    </View>
  );
}

export default function RMCalculator() {
  const colors = useThemeColors();

  return (
    <>
      <Stack.Screen options={{ title: "1RM Calculator" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          <RMCalculatorContent />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  weightWrap: {
    flex: 1,
  },
  repsWrap: {
    width: 100,
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
