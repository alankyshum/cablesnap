import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();

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
           title: t({ id: "tabs.exercises.title", message: "Exercises" }),
           headerTitle: renderHeaderTitle("format-list-bulleted", t({ id: "tabs.exercises.header", message: "Exercises" })),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/exercise/create")}
               accessibilityLabel={t({ id: "tabs.exercises.addA11y", message: "Add custom exercise" })}
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
           title: t({ id: "tabs.nutrition.title", message: "Nutrition" }),
           headerTitle: renderHeaderTitle("food-apple", t({ id: "tabs.nutrition.header", message: "Nutrition" })),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.setParams({ add: "true" })}
               accessibilityLabel={t({ id: "tabs.nutrition.addA11y", message: "Add food" })}
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
           title: t({ id: "tabs.workouts.title", message: "Workouts" }),
          headerTitle: function WorkoutsHeaderTitle() {
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <HandleIcon size={20} color={colors.onSurface} />
                 <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: colors.onSurface }}>{t({ id: "tabs.workouts.header", message: "Workouts" })}</Text>
              </View>
            );
          },
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => router.push("/exercises")}
                 accessibilityLabel={t({ id: "tabs.workouts.exercisesA11y", message: "Exercises" })}
                accessibilityRole="button"
                style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
              >
                <MaterialCommunityIcons name="format-list-bulleted" size={24} color={colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/tools")}
                 accessibilityLabel={t({ id: "tabs.workouts.toolsA11y", message: "Workout tools" })}
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
           title: t({ id: "tabs.progress.title", message: "Progress" }),
           headerTitle: renderHeaderTitle("chart-line", t({ id: "tabs.progress.header", message: "Progress" })),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
           title: t({ id: "tabs.settings.title", message: "Settings" }),
           headerTitle: renderHeaderTitle("cog", t({ id: "tabs.settings.header", message: "Settings" })),
        }}
      />
    </Tabs>
  );
}
