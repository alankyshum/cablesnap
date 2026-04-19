import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import { Text } from "@/components/ui/text";
import Animated from "react-native-reanimated";
import { usePulse, useEntrance } from "../../lib/animations/hooks";
import { spacing, radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

interface StatBadgeProps {
  label: string;
  icon?: string;
  pulse?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function StatBadge({
  label,
  icon,
  pulse = false,
  delay = 0,
  style,
}: StatBadgeProps) {
  const colors = useThemeColors();
  const { animatedStyle: pulseStyle, start } = usePulse();
  const entranceStyle = useEntrance(delay);

  React.useEffect(() => {
    if (pulse) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start is stable
  }, [pulse]);

  return (
    <Animated.View style={[entranceStyle, pulseStyle]}>
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.tertiaryContainer,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radii.pill,
            gap: spacing.xs,
          },
          style,
        ]}
      >
        {icon && (
          <Text
            variant="caption"
            style={{ color: colors.onTertiaryContainer, fontSize: fontSizes.xs }}
          >
            {icon}
          </Text>
        )}
        <Text
          variant="caption"
          style={{
            color: colors.onTertiaryContainer,
            fontWeight: "700",
            fontSize: fontSizes.sm,
          }}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}
