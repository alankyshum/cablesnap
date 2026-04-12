import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

export default function Settings() {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text variant="headlineMedium" style={{ color: theme.colors.onBackground }}>
        Settings
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
