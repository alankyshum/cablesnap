import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CheckCircle, HelpCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react-native";
import { Stack } from "expo-router";
import { matchAllExercises } from "@/lib/import/exercise-matcher";
import type { Exercise } from "@/lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { MatchState } from "./types";

function ExerciseMatchItem({ match, onConfirm }: { match: MatchState; onConfirm: (strongName: string) => void }) {
  const colors = useThemeColors();
  const iconComponent = match.confidence === "exact" ? CheckCircle : match.confidence === "possible" ? HelpCircle : XCircle;
  const label = match.confidence === "exact" ? "Exact match" : match.confidence === "possible" ? (match.userConfirmed ? "Confirmed" : "Possible match — tap to confirm") : "No match — will create";
  const iconColor = match.confidence === "exact" ? colors.primary : match.confidence === "possible" ? colors.tertiary : colors.error;
  const displayedExercise = match.userOverrideExercise ?? match.matchedExercise;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16 }}
      accessibilityLabel={`${match.strongName}: ${label}${displayedExercise ? `, mapped to ${displayedExercise.name}` : ""}`}>
      <Icon name={iconComponent} size={24} color={iconColor} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ color: colors.onSurface }}>{match.strongName}</Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{displayedExercise ? `→ ${displayedExercise.name} (${label})` : label}</Text>
      </View>
      {match.confidence === "possible" && !match.userConfirmed && (
        <Button variant="ghost" size="sm" onPress={() => onConfirm(match.strongName)} accessibilityLabel={`Confirm match for ${match.strongName}`} accessibilityRole="button">Confirm</Button>
      )}
    </View>
  );
}

type Props = {
  exerciseNames: string[];
  exercises: Exercise[];
  onNext: (matches: MatchState[]) => void;
  onBack: () => void;
};

export default function StepReviewMapping({ exerciseNames, exercises, onNext, onBack }: Props) {
  const colors = useThemeColors();
  const initialMatches = useMemo(() => {
    const raw = matchAllExercises(exerciseNames, exercises);
    return raw.map((m) => ({ ...m, userConfirmed: m.confidence === "exact", userOverrideExercise: null }));
  }, [exerciseNames, exercises]);

  const [matches, setMatches] = useState<MatchState[]>(initialMatches);
  const grouped = useMemo(() => ({
    exact: matches.filter((m) => m.confidence === "exact"),
    possible: matches.filter((m) => m.confidence === "possible"),
    none: matches.filter((m) => m.confidence === "none"),
  }), [matches]);

  const [exactCollapsed, setExactCollapsed] = useState(true);

  const handleConfirm = useCallback((strongName: string) => {
    setMatches((prev) => prev.map((m) => m.strongName === strongName ? { ...m, userConfirmed: true } : m));
  }, []);

  const sections = useMemo(() => {
    const items: { type: "header" | "item"; data: MatchState | string; key: string }[] = [];
    if (grouped.exact.length > 0) {
      items.push({ type: "header", data: `Exact Matches (${grouped.exact.length})`, key: "header-exact" });
      if (!exactCollapsed) for (const m of grouped.exact) items.push({ type: "item", data: m, key: `exact-${m.strongName}` });
    }
    if (grouped.possible.length > 0) {
      items.push({ type: "header", data: `Possible Matches (${grouped.possible.length})`, key: "header-possible" });
      for (const m of grouped.possible) items.push({ type: "item", data: m, key: `possible-${m.strongName}` });
    }
    if (grouped.none.length > 0) {
      items.push({ type: "header", data: `New Exercises (${grouped.none.length})`, key: "header-none" });
      for (const m of grouped.none) items.push({ type: "item", data: m, key: `none-${m.strongName}` });
    }
    return items;
  }, [grouped, exactCollapsed]);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: "Import from Strong" }} />
      <View style={styles.stepHeader}>
        <Text variant="heading" style={{ color: colors.onBackground }} accessibilityRole="header">Step 2: Review Exercise Mapping</Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>{matches.length} exercise{matches.length !== 1 ? "s" : ""} found</Text>
      </View>

      <FlatList data={sections} keyExtractor={(item) => item.key} renderItem={({ item }) => {
        if (item.type === "header") {
          const title = item.data as string;
          const isExact = title.startsWith("Exact");
          return (
            <Pressable onPress={isExact ? () => setExactCollapsed((prev) => !prev) : undefined}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16 }}
              accessibilityRole="header" accessibilityState={isExact ? { expanded: !exactCollapsed } : undefined}>
              <Text variant="body" style={{ flex: 1, fontWeight: "bold", color: colors.onSurface }}>{title}</Text>
              {isExact && <Icon name={exactCollapsed ? ChevronDown : ChevronUp} size={20} color={colors.onSurfaceVariant} />}
            </Pressable>
          );
        }
        return <ExerciseMatchItem match={item.data as MatchState} onConfirm={handleConfirm} />;
      }} contentContainerStyle={{ paddingBottom: 100 }} />

      <View style={styles.bottomBar}>
        <Button variant="outline" onPress={onBack} accessibilityLabel="Go back to file selection" accessibilityRole="button">Back</Button>
        <Button variant="default" onPress={() => onNext(matches)} accessibilityLabel="Continue to import confirmation" accessibilityRole="button">Continue</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stepHeader: { padding: 16, paddingBottom: 8 },
  bottomBar: { flexDirection: "row", justifyContent: "space-between", padding: 16, gap: 12 },
});
