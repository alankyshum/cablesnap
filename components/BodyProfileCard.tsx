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

export default function BodyProfileCard() {
  const colors = useThemeColors();
  const profile = useBodyProfile();
  const cardStyle = StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }]);

  if (profile.cardState === "loading") {
    return (
      <Card style={cardStyle}>
        <CardContent>
          <View style={styles.loadingContainer}>
            <Spinner size="sm" />
            <Text variant="body" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>Loading profile…</Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  if (profile.cardState === "error") {
    return (
      <Card style={cardStyle}>
        <CardContent>
          <Text variant="body" style={{ color: colors.error, marginBottom: 8 }}>Could not load profile</Text>
          <Button variant="outline" onPress={profile.loadProfile} accessibilityLabel="Retry loading profile">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={cardStyle}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>Body Profile</Text>
        <BodyProfileForm colors={colors} {...profile} />
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  loadingContainer: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
});
