import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio";
import { FileUp } from "lucide-react-native";
import { File } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import { parseStrongCSV, convertWeight, getSampleRows } from "@/lib/import/strong-csv";
import type { ParseResult } from "@/lib/import/strong-csv";
import { getBodySettings } from "@/lib/db/body";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  onNext: (parsed: ParseResult, sourceUnit: "kg" | "lb", targetUnit: "kg" | "lb") => void;
};

export default function StepSelectFile({ onNext }: Props) {
  const colors = useThemeColors();
  const [sourceUnit, setSourceUnit] = useState<"kg" | "lb">("kg");
  const [targetUnit, setTargetUnit] = useState<"kg" | "lb">("kg");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      setLoading(true); setError(null); setParsed(null);
      const uri = result.assets[0].uri;
      const file = new File(uri);
      const raw = await file.text();
      const parseResult = parseStrongCSV(raw);
      if (parseResult.rows.length === 0 && parseResult.errors.length > 0) {
        setError(parseResult.errors[0].reason); setLoading(false); return;
      }
      setParsed(parseResult);
      try { const settings = await getBodySettings(); setTargetUnit(settings.weight_unit); } catch { /* default kg */ }
    } catch { setError("Failed to read file"); }
    finally { setLoading(false); }
  };

  const sampleRows = parsed ? getSampleRows(parsed.rows, 3) : [];

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} accessibilityRole="none">
      <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }} accessibilityRole="header">Step 1: Select File & Unit</Text>
      <Button variant="default" icon={FileUp} onPress={handlePickFile} loading={loading} disabled={loading} accessibilityLabel="Select Strong CSV file" accessibilityRole="button" style={{ marginBottom: 16 }}>Select CSV File</Button>

      {error && (<Card style={{ ...styles.card, backgroundColor: colors.errorContainer }}><CardContent><Text style={{ color: colors.onErrorContainer }} accessibilityRole="alert">{error}</Text></CardContent></Card>)}

      {parsed && parsed.rows.length > 0 && (
        <>
          <Card style={{ ...styles.card, backgroundColor: colors.surface }}><CardContent>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>File Summary</Text>
            <Text style={{ color: colors.onSurfaceVariant }}>{parsed.sessions.length} session{parsed.sessions.length !== 1 ? "s" : ""}, {parsed.exerciseNames.length} exercise{parsed.exerciseNames.length !== 1 ? "s" : ""}, {parsed.rows.length} set{parsed.rows.length !== 1 ? "s" : ""}</Text>
            {parsed.errors.length > 0 && <Text style={{ color: colors.error, marginTop: 4 }}>{parsed.errors.length} row{parsed.errors.length !== 1 ? "s" : ""} skipped (parse errors)</Text>}
          </CardContent></Card>

          <Card style={{ ...styles.card, backgroundColor: colors.surface }}><CardContent>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>What unit did you use in Strong?</Text>
            <RadioGroup value={sourceUnit} onValueChange={(val) => setSourceUnit(val as "kg" | "lb")} options={[{ label: "Kilograms (kg)", value: "kg" }, { label: "Pounds (lbs)", value: "lb" }]} />
          </CardContent></Card>

          {sampleRows.length > 0 && (
            <Card style={{ ...styles.card, backgroundColor: colors.surface }}><CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>Preview (with conversion)</Text>
              <FlatList data={sampleRows} scrollEnabled={false} keyExtractor={(_, i) => `sample-${i}`} renderItem={({ item: row, index: i }) => {
                const converted = convertWeight(row.weight, sourceUnit, targetUnit);
                return (<View style={styles.previewRow}><Text style={{ color: colors.onSurface }} accessibilityLabel={`Sample row ${i + 1}: ${row.exerciseName}, ${converted ?? "bodyweight"} ${targetUnit}, ${row.reps ?? 0} reps`}>{row.exerciseName} — {converted !== null ? `${converted} ${targetUnit}` : "Bodyweight"} × {row.reps ?? 0} reps</Text></View>);
              }} />
            </CardContent></Card>
          )}

          <Button variant="default" onPress={() => onNext(parsed, sourceUnit, targetUnit)} style={{ marginTop: 8 }} accessibilityLabel="Continue to exercise mapping" accessibilityRole="button">Continue</Button>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stepContainer: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 12, borderRadius: 12 },
  previewRow: { paddingVertical: 4 },
});
