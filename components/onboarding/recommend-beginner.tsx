import { ScrollView, StyleSheet } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { styles } from "./recommend-styles";
import { RecommendActions } from "./recommend-actions";
import { MetaRow } from "./recommend-meta-row";
import { BEGINNER_REC, INTERMEDIATE_REC } from "./recommend-data";

export function BeginnerRecommend({
  level,
  errorBanner,
  saving,
  finish,
}: {
  level: "beginner" | "intermediate";
  errorBanner: React.ReactNode;
  saving: boolean;
  finish: (action?: "template" | "program" | "browse") => void;
}) {
  const colors = useThemeColors();
  const rec = level === "intermediate" ? INTERMEDIATE_REC : BEGINNER_REC;
  const chipBg = level === "intermediate" ? colors.secondaryContainer : colors.primaryContainer;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll}>
      {errorBanner}
      <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>We Recommend</Text>
      <Card style={StyleSheet.flatten([styles.recCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="title" style={{ color: colors.onSurface }}>{rec.name}</Text>
          <Chip compact style={{ backgroundColor: chipBg }}>{rec.chip}</Chip>
          <Text variant="body" style={[styles.recDesc, { color: colors.onSurfaceVariant }]}>{rec.desc}</Text>
          <MetaRow items={rec.metaItems} />
        </CardContent>
      </Card>
      <RecommendActions
        primaryLabel={`Start with ${rec.name}`}
        onPrimary={() => finish(rec.action)}
        onSkip={() => finish()}
        saving={saving}
      />
    </ScrollView>
  );
}
