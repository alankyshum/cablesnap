import { Tabs, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { IconButton } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import FloatingTabBar from "../../components/FloatingTabBar";
import { useThemeColors } from "@/hooks/useThemeColors";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function TabLayout() {
  const colors = useThemeColors();
  const router = useRouter();

  const renderHeaderTitle = (icon: IconName, title: string) =>
    function HeaderTitle() {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.onSurface} />
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>{title}</Text>
        </View>
      );
    };

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        animation: "fade",
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.onSurface,
      }}
    >
      {/* Tab order: Exercises | Nutrition | Workouts (center) | Progress | Settings */}
      <Tabs.Screen
        name="exercises"
        options={{
          title: "Exercises",
          headerTitle: renderHeaderTitle("format-list-bulleted", "Exercises"),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: "Nutrition",
          headerTitle: renderHeaderTitle("food-apple", "Nutrition"),
          headerRight: () => (
            <IconButton
              icon="barcode-scan"
              size={24}
              onPress={() => router.push("/nutrition/add?scan=true")}
              accessibilityLabel="Scan food barcode"
              accessibilityRole="button"
              iconColor={colors.onSurface}
              style={{ minWidth: 48, minHeight: 48 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Workouts",
          headerTitle: renderHeaderTitle("arm-flex", "Workouts"),
          headerRight: () => (
            <IconButton
              icon="wrench"
              size={24}
              onPress={() => router.push("/tools")}
              accessibilityLabel="Workout tools"
              accessibilityRole="button"
              iconColor={colors.onSurface}
              style={{ minWidth: 48, minHeight: 48 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          headerTitle: renderHeaderTitle("chart-line", "Progress"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          headerTitle: renderHeaderTitle("cog", "Settings"),
        }}
      />
    </Tabs>
  );
}
