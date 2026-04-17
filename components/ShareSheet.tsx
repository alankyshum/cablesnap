import React, { useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { spacing, radii } from "../constants/design-tokens";

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  onShareText: () => void;
  onShareImage: () => void;
  imageDisabled?: boolean;
  onDismiss: () => void;
};

type OptionProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
};

function ShareOption({ icon, label, description, onPress, disabled }: OptionProps) {
  const theme = useTheme();
  return (
    <Pressable
      style={[
        styles.option,
        { backgroundColor: theme.colors.surfaceVariant, opacity: disabled ? 0.5 : 1 },
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
        color={theme.colors.primary}
      />
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: theme.colors.onSurface }]}>
          {label}
        </Text>
        <Text style={[styles.optionDesc, { color: theme.colors.onSurfaceVariant }]}>
          {description}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color={theme.colors.onSurfaceVariant}
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
}: Props) {
  const theme = useTheme();
  const snapPoints = useMemo(() => ["30%"], []);
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
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={(index: number) => {
        if (index === -1) onDismiss();
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.onSurfaceVariant }}
    >
      <View style={styles.container}>
        <Text
          style={[styles.title, { color: theme.colors.onSurface }]}
        >
          Share Workout
        </Text>
        <ShareOption
          icon="text-long"
          label="Share as Text"
          description="Copy workout summary as text"
          onPress={() => {
            sheetRef.current?.close();
            onShareText();
          }}
        />
        {showImageOption && (
          <ShareOption
            icon="image-outline"
            label="Share as Image"
            description="Generate a workout card image"
            onPress={() => {
              sheetRef.current?.close();
              onShareImage();
            }}
            disabled={imageDisabled}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
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
    fontSize: 16,
    fontWeight: "600",
  },
  optionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
});
