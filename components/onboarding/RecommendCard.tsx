import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";

export interface RecommendCardProps {
  name: string;
  description: string;
  chipLabel: string;
  chipColor: string;
  meta: React.ReactNode;
  onStart: () => void;
  onSkip: () => void;
  saving: boolean;
  startLabel: string;
  errorBanner: React.ReactNode;
}

export function RecommendCard({
  name,
  description,
  chipLabel,
  chipColor,
  meta,
  onStart,
  onSkip,
  saving,
  startLabel,
  errorBanner,
}: RecommendCardProps) {
  const colors = useThemeColors();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      {errorBanner}
      <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
        We Recommend
      </Text>
      <Card style={StyleSheet.flatten([styles.recCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <View style={styles.recHeader}>
            <Text variant="title" style={{ color: colors.onSurface }}>
              {name}
            </Text>
            <Chip compact style={{ backgroundColor: chipColor }}>
              {chipLabel}
            </Chip>
          </View>
          <Text variant="body" style={[styles.recDesc, { color: colors.onSurfaceVariant }]}>
            {description}
          </Text>
          <View style={styles.meta}>{meta}</View>
        </CardContent>
      </Card>
      <Button
        variant="default"
        onPress={onStart}
        style={styles.btn}
        loading={saving}
        disabled={saving}
        accessibilityLabel={startLabel}
      >
        {startLabel}
      </Button>
      <Button
        variant="ghost"
        onPress={onSkip}
        style={styles.skip}
        disabled={saving}
        accessibilityLabel="Skip recommendation and explore on your own"
        label="I'll explore on my own"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  recCard: {
    marginBottom: 24,
    borderRadius: 12,
  },
  recHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recDesc: {
    marginBottom: 12,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
  },
  btn: {
    marginTop: 16,
    borderRadius: 8,
  },
  skip: {
    marginTop: 8,
  },
});
