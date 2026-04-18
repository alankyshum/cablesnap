import { Pressable, StyleSheet, type ViewStyle, type TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/theme/colors";
import { BORDER_RADIUS, FONT_SIZE } from "@/theme/globals";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ChipProps = {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  compact?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function Chip({
  children,
  selected = false,
  onPress,
  icon,
  compact = false,
  style,
  textStyle,
}: ChipProps) {
  const rawScheme = useColorScheme() ?? "light";
  const scheme = rawScheme === "dark" ? "dark" as const : "light" as const;
  const colors = Colors[scheme];
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withTiming(0.95, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 100 });
      }}
      onPress={onPress}
      style={[
        styles.chip,
        compact && styles.compact,
        selected
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: "transparent", borderColor: colors.border },
        animatedStyle,
        style,
      ]}
    >
      {icon && <>{icon}</>}
      <Animated.Text
        style={[
          styles.text,
          selected
            ? { color: colors.primaryForeground, fontWeight: "600" }
            : { color: colors.foreground },
          textStyle,
        ]}
        numberOfLines={1}
      >
        {children}
      </Animated.Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS,
    borderWidth: 1,
    gap: 6,
  },
  compact: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: FONT_SIZE - 3,
    flexShrink: 0,
  },
});
