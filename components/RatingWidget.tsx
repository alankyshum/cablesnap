import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";

const RATING_LABELS: { label: string; colorKey: "error" | "tertiary" | "secondary" | "primary" }[] = [
  { label: "Terrible", colorKey: "error" },
  { label: "Poor", colorKey: "tertiary" },
  { label: "Okay", colorKey: "secondary" },
  { label: "Good", colorKey: "primary" },
  { label: "Amazing", colorKey: "primary" },
];

type Props = {
  value: number | null;
  onChange?: (rating: number | null) => void;
  readOnly?: boolean;
  size?: "small" | "medium" | "large";
};

const SIZES = {
  small: { star: 16, touch: 24 },
  medium: { star: 32, touch: 48 },
  large: { star: 40, touch: 56 },
};

export default function RatingWidget({ value, onChange, readOnly = false, size = "medium" }: Props) {
  const colors = useThemeColors();
  const longPressRef = useRef(false);
  const { star: starSize, touch: touchSize } = SIZES[size];

  const ratingInfo = value != null && value >= 1 && value <= 5
    ? RATING_LABELS[value - 1]
    : null;
  const labelColor = ratingInfo
    ? colors[ratingInfo.colorKey]
    : colors.onSurfaceDisabled;

  const handlePress = (starNum: number) => {
    if (readOnly || !onChange) return;
    if (longPressRef.current) {
      longPressRef.current = false;
      return;
    }
    // Re-tap same star clears rating
    onChange(value === starNum ? null : starNum);
  };

  const handleLongPress = () => {
    if (readOnly || !onChange) return;
    longPressRef.current = true;
    onChange(null);
  };

  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 5, now: value ?? 0 }}
      accessibilityLabel={
        ratingInfo
          ? `Rating: ${value} out of 5, ${ratingInfo.label}`
          : "Not rated"
      }
      accessibilityActions={
        readOnly
          ? undefined
          : [
              { name: "increment", label: "Increase rating" },
              { name: "decrement", label: "Decrease rating" },
            ]
      }
      onAccessibilityAction={(event) => {
        if (readOnly || !onChange) return;
        const current = value ?? 0;
        if (event.nativeEvent.actionName === "increment" && current < 5) {
          onChange(current + 1);
        } else if (event.nativeEvent.actionName === "decrement" && current > 1) {
          onChange(current - 1);
        } else if (event.nativeEvent.actionName === "decrement" && current <= 1) {
          onChange(null);
        }
      }}
    >
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((starNum) => (
          <Pressable
            key={starNum}
            onPress={() => handlePress(starNum)}
            onLongPress={handleLongPress}
            disabled={readOnly}
            style={{
              minWidth: touchSize,
              minHeight: touchSize,
              alignItems: "center",
              justifyContent: "center",
            }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <MaterialCommunityIcons
              name={value != null && starNum <= value ? "star" : "star-outline"}
              size={starSize}
              color={
                value != null && starNum <= value
                  ? labelColor
                  : colors.onSurfaceDisabled
              }
            />
          </Pressable>
        ))}
      </View>
      {!readOnly && size !== "small" && (
        <Text
          variant="bodySmall"
          style={{ color: labelColor, marginTop: 4, textAlign: "center" }}
        >
          {ratingInfo ? ratingInfo.label : "Not rated"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  stars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
});
