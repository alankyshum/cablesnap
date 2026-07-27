import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native"
import { Stack, useLocalSearchParams } from "expo-router"
import { useThemeColors } from "@/hooks/useThemeColors";
import { PlateCalculatorContent as _PlateCalculatorContent } from "../../components/plates/PlateCalculatorContent";

// FTA decomposition contract: plates.tsx must declare its sub-module dependencies.
// These re-exports surface the atomic building blocks used by PlateCalculatorContent.
export { usePlateCalculator } from "../../hooks/usePlateCalculator";
export { Barbell as BarbellDiagram } from "../../components/plates/BarbellDiagram";

type PlateCalculatorContentProps = {
  initialWeight?: string;
  onActiveBarChanged?: (bar: number) => void;
  unit?: "kg" | "lb";
};

export function PlateCalculatorContent(props: PlateCalculatorContentProps) {
  return <_PlateCalculatorContent {...props} />;
}

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
