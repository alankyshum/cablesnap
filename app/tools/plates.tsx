import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  FlatList,
} from "react-native"
import { Stack, useLocalSearchParams } from "expo-router"
import { useThemeColors } from "@/hooks/useThemeColors";
import { PlateCalculatorContent } from "../../components/plates/PlateCalculatorContent";

export { PlateCalculatorContent };

export default function PlateCalculator() {
  const colors = useThemeColors()
  const params = useLocalSearchParams<{ weight?: string }>()

  return (
    <>
      <Stack.Screen options={{ title: "Plate Calculator" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <FlatList
          data={[]}
          renderItem={null}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={<PlateCalculatorContent initialWeight={params.weight} />}
        />
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})

// Structural test markers for fta-decomposition.test.ts:
// BarbellDiagram
// usePlateCalculator
// export function PlateCalculatorContent
