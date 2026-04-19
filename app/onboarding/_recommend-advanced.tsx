import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { styles } from "./_recommend-styles";

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
    <FlashList
      data={BROWSE_TEMPLATES}
      keyExtractor={(tpl) => tpl.id}
      style={{ flex: 1, backgroundColor: colors.background }}
      ListHeaderComponent={
        <>
          {errorBanner}
          <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
            Browse Our Templates
          </Text>
          <Text variant="body" style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Pick a starter template or create your own workouts from scratch.
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
            accessibilityLabel="Browse all workout templates"
            label="Browse All Templates"
          />
          <Button
            variant="ghost"
            onPress={() => finish()}
            style={styles.skip}
            disabled={saving}
            accessibilityLabel="Skip and explore on your own"
            label="I'll explore on my own"
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
              {tpl.exercises.length} exercises · {tpl.difficulty}
            </Text>
          </CardContent>
        </Card>
      )}
    />
  );
}
