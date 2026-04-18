import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { getAllExercises } from "../../lib/db/exercises";
import type { ParseResult } from "../../lib/import/strong-csv";
import type { Exercise } from "../../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import StepSelectFile from "@/components/import/StepSelectFile";
import StepReviewMapping from "@/components/import/StepReviewMapping";
import StepConfirmImport from "@/components/import/StepConfirmImport";
import ImportComplete from "@/components/import/ImportComplete";
import type { MatchState, ImportResult } from "@/components/import/types";

export default function ImportStrongScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [sourceUnit, setSourceUnit] = useState<"kg" | "lb">("kg");
  const [targetUnit, setTargetUnit] = useState<"kg" | "lb">("kg");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [matches, setMatches] = useState<MatchState[] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleStep1Complete = useCallback(async (p: ParseResult, sUnit: "kg" | "lb", tUnit: "kg" | "lb") => {
    setParsed(p); setSourceUnit(sUnit); setTargetUnit(tUnit);
    const allExercises = await getAllExercises();
    setExercises(allExercises); setStep(2);
  }, []);

  const handleStep2Complete = useCallback((m: MatchState[]) => { setMatches(m); setStep(3); }, []);
  const handleImportComplete = useCallback((result: ImportResult) => { setImportResult(result); setStep(4); }, []);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Import from Strong" }} />
      {step === 1 && <StepSelectFile onNext={handleStep1Complete} />}
      {step === 2 && parsed && <StepReviewMapping exerciseNames={parsed.exerciseNames} exercises={exercises} onNext={handleStep2Complete} onBack={() => setStep(1)} />}
      {step === 3 && parsed && matches && <StepConfirmImport parsed={parsed} matches={matches} sourceUnit={sourceUnit} targetUnit={targetUnit} onBack={() => setStep(2)} onComplete={handleImportComplete} />}
      {step === 4 && importResult && <ImportComplete result={importResult} onDone={() => router.back()} />}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
