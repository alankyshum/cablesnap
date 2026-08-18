import { Tabs, useRouter } from "expo-router";
import { Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { TouchableOpacity } from "react-native";
import FloatingTabBar from "../../components/FloatingTabBar";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { HandleIcon } from "@/components/floating-tab-bar/HandleIcon";
import BreadcrumbTitle from "@/components/ui/BreadcrumbTitle";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function TabLayout() {
  const colors = useThemeColors();
  const router = useRouter();

  const renderHeaderTitle = (icon: IconName, title: string) =>
    function HeaderTitle() {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.onSurface} />
          <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: colors.onSurface }}>{title}</Text>
        </View>
      );
    };

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        animation: "none",
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
          headerTitle: () => <BreadcrumbTitle segments={[{ label: "workouts", href: "/" }, { label: "exercise" }]} />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/exercise/create")}
              accessibilityLabel="Add custom exercise"
              accessibilityRole="button"
              style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialCommunityIcons name="plus" size={28} color={colors.onSurface} />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: "Nutrition",
          headerTitle: renderHeaderTitle("food-apple", "Nutrition"),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.setParams({ add: "true" })}
              accessibilityLabel="Add food"
              accessibilityRole="button"
              style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialCommunityIcons name="plus" size={28} color={colors.onSurface} />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Workouts",
          headerTitle: function WorkoutsHeaderTitle() {
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <HandleIcon size={20} color={colors.onSurface} />
                <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: colors.onSurface }}>Workouts</Text>
              </View>
            );
          },
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => router.push("/exercises")}
                accessibilityLabel="Exercises"
                accessibilityRole="button"
                style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
              >
                <MaterialCommunityIcons name="format-list-bulleted" size={24} color={colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/tools")}
                accessibilityLabel="Workout tools"
                accessibilityRole="button"
                style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
              >
                <MaterialCommunityIcons name="wrench" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="ai-coach"
        options={{
          title: "AI Coach",
          headerTitle: renderHeaderTitle("robot", "AI Coach"),
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
