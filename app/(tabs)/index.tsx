import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function Workouts() {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text variant="headlineMedium" style={{ color: theme.colors.onBackground }}>
        Workouts
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
