import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { flowCardStyle } from "./ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import { BodyProfileForm } from "./BodyProfileForm";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useBodyProfile } from "@/hooks/useBodyProfile";
import { t } from "@/lib/i18n";

type BodyProfileCardProps = {
  weightUnit?: "kg" | "lb";
  heightUnit?: "cm" | "in";
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function BodyProfileCard({ weightUnit, heightUnit, bareContent = false }: BodyProfileCardProps = {}) {
  const colors = useThemeColors();
  const profile = useBodyProfile(weightUnit, heightUnit);
  const cardStyle = StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }]);

  if (profile.cardState === "loading") {
    const loadingContent = (
      <View style={styles.loadingContainer}>
        <Spinner size="sm" />
        <Text variant="body" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>{t({ id: "components.bodyProfile.loading", message: "Loading profile…" })}</Text>
      </View>
    );
    if (bareContent) return loadingContent;
    return (
      <Card variant="outline" style={cardStyle}>
        <CardContent>{loadingContent}</CardContent>
      </Card>
    );
  }

  if (profile.cardState === "error") {
    const errorContent = (
      <>
        <Text variant="body" style={{ color: colors.error, marginBottom: 8 }}>{t({ id: "components.bodyProfile.loadFailed", message: "Could not load profile" })}</Text>
        <Button variant="outline" onPress={profile.loadProfile} accessibilityLabel={t({ id: "components.bodyProfile.retryA11y", message: "Retry loading profile" })}>{t({ id: "common.retry", message: "Retry" })}</Button>
      </>
    );
    if (bareContent) return <View>{errorContent}</View>;
    return (
      <Card variant="outline" style={cardStyle}>
        <CardContent>{errorContent}</CardContent>
      </Card>
    );
  }

  const mainContent = (
    <>
       <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>{t({ id: "components.bodyProfile.title", message: "Body Profile" })}</Text>
      <BodyProfileForm colors={colors} {...profile} />
    </>
  );

  if (bareContent) return <View>{mainContent}</View>;

  return (
    <Card variant="outline" style={cardStyle}>
      <CardContent>{mainContent}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  loadingContainer: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
});
