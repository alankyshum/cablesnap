import { StyleSheet, View, FlatList } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { styles } from "./recommend-styles";
import { t } from "@lingui/core/macro";

const BROWSE_TEMPLATES = STARTER_TEMPLATES.slice(0, 3);

export function AdvancedRecommend({
  errorBanner,
  saving,
  finish,
}: {
  errorBanner: React.ReactNode;
  saving: boolean;
  finish: (action?: "template" | "program" | "browse") => void;
}) {
  const colors = useThemeColors();

  return (
    <FlatList
      data={BROWSE_TEMPLATES}
      keyExtractor={(tpl) => tpl.id}
      style={{ flex: 1, backgroundColor: colors.background }}
      ListHeaderComponent={
        <>
          {errorBanner}
          <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
             {t({ id: "components.onboarding.recommendAdvanced.title", message: "Browse Our Templates" })}
          </Text>
          <Text variant="body" style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
             {t({ id: "components.onboarding.recommendAdvanced.subtitle", message: "Pick a starter template or create your own workouts from scratch." })}
          </Text>
        </>
      }
      ListFooterComponent={
        <>
          <Button
            variant="default"
            onPress={() => finish("browse")}
            style={styles.btn}
            loading={saving}
            disabled={saving}
             accessibilityLabel={t({ id: "components.onboarding.recommendAdvanced.browseA11y", message: "Browse all workout templates" })}
             label={t({ id: "components.onboarding.recommendAdvanced.browse", message: "Browse All Templates" })}
          />
          <Button
            variant="ghost"
            onPress={() => finish()}
            style={styles.skip}
            disabled={saving}
             accessibilityLabel={t({ id: "components.onboarding.recommendAdvanced.skipA11y", message: "Skip and explore on your own" })}
             label={t({ id: "components.onboarding.recommendAdvanced.skip", message: "I'll explore on my own" })}
          />
        </>
      }
      renderItem={({ item: tpl }) => (
        <Card
          style={StyleSheet.flatten([styles.browseCard, { backgroundColor: colors.surface }])}
        >
          <CardContent>
            <View style={styles.recHeader}>
              <Text variant="title" style={{ color: colors.onSurface }}>
                {tpl.name}
              </Text>
              <View style={styles.meta}>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {tpl.duration}
                </Text>
              </View>
            </View>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
               {tpl.exercises.length} {t({ id: "components.onboarding.recommendAdvanced.exercises", message: "exercises" })} · {tpl.difficulty}
            </Text>
          </CardContent>
        </Card>
      )}
    />
  );
}
