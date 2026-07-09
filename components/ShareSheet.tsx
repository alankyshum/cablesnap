import React, { useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BottomSheetBackdrop, BottomSheetModal } from "@gorhom/bottom-sheet";
import { spacing, radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { stravaLog } from "../lib/strava-telemetry";

type Props = {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  onShareText: () => void;
  onShareImage: () => void;
  imageDisabled?: boolean;
  onDismiss: () => void;
  onShareStravaImage?: () => void;
  stravaDisabled?: boolean;
  stravaConnected?: boolean;
  onConnectStrava?: () => void;
  onShareAchievementImage?: () => void;
  hasAchievements?: boolean;
  onSyncToStrava?: () => void;
  syncStravaDisabled?: boolean;
  syncToStravaLabel?: string;
};

type OptionProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
};

function ShareOption({ icon, label, description, onPress, disabled }: OptionProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      style={[
        styles.option,
        { backgroundColor: colors.surfaceVariant, opacity: disabled ? 0.5 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ disabled }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={28}
        color={colors.primary}
      />
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: colors.onSurface }]}>
          {label}
        </Text>
        <Text style={[styles.optionDesc, { color: colors.onSurfaceVariant }]}>
          {description}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color={colors.onSurfaceVariant}
      />
    </Pressable>
  );
}

export default function ShareSheet({
  sheetRef,
  onShareText,
  onShareImage,
  imageDisabled,
  onDismiss,
  onShareStravaImage,
  stravaDisabled,
  stravaConnected,
  onConnectStrava,
  onShareAchievementImage,
  hasAchievements = false,
  onSyncToStrava,
  syncStravaDisabled,
  syncToStravaLabel,
}: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => [hasAchievements ? 480 : 350], [hasAchievements]);
  const showImageOption = Platform.OS !== "web";

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      <View style={styles.container}>
        <Text
          style={[styles.title, { color: colors.onSurface }]}
        >
          Share Workout
        </Text>
        <ShareOption
          icon="text-long"
          label="Share as Text"
          description="Copy workout summary as text"
          onPress={() => {
            sheetRef.current?.dismiss();
            onShareText();
          }}
        />
        {showImageOption && (
          <ShareOption
            icon="image-outline"
            label="Share as Image"
            description="Generate a workout card image"
            onPress={() => {
              sheetRef.current?.dismiss();
              onShareImage();
            }}
            disabled={imageDisabled}
          />
        )}
        {showImageOption && (
          <ShareOption
            icon="run-fast"
            label={stravaConnected ? "Share Strava Image" : "Connect Strava"}
            description={
              stravaConnected
                ? "Generate a Strava workout card image"
                : "Open settings to connect Strava"
            }
            onPress={() => {
              sheetRef.current?.dismiss();
              if (stravaConnected && onShareStravaImage) {
                onShareStravaImage();
              } else if (onConnectStrava) {
                stravaLog("info", "connect_strava_cta_tapped");
                onConnectStrava();
              }
            }}
            disabled={stravaDisabled}
          />
        )}
        {showImageOption && stravaConnected && onSyncToStrava && (
          <ShareOption
            icon="sync"
            label={syncToStravaLabel || "Sync to Strava"}
            description="Upload workout activity data directly to Strava"
            onPress={() => {
              sheetRef.current?.dismiss();
              onSyncToStrava();
            }}
            disabled={syncStravaDisabled}
          />
        )}
        {showImageOption && hasAchievements && (
          <ShareOption
            icon="trophy-variant"
            label="Share Achievement Recap"
            description="Generate an achievement recap card image"
            onPress={() => {
              sheetRef.current?.dismiss();
              onShareAchievementImage?.();
            }}
          />
        )}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
    borderRadius: radii.lg,
    gap: spacing.md,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: fontSizes.base,
    fontWeight: "600",
  },
  optionDesc: {
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
});
