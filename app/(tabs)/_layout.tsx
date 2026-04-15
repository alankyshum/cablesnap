import { Tabs, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { IconButton, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLayout } from "../../lib/layout";
const NARROW_THRESHOLD = 380;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function TabLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { compact, width } = useLayout();
  const narrow = width < NARROW_THRESHOLD;

  const renderLabel = (title: string) =>
    function TabLabel({ color }: { focused: boolean; color: string }) {
      return (
        <Text
          numberOfLines={1}
          style={{
            color,
            fontSize: compact ? 10 : 12,
            lineHeight: compact ? 16 : 18,
            textAlign: "center",
            includeFontPadding: false,
          }}
        >
          {title}
        </Text>
      );
    };

  const renderHeaderTitle = (icon: IconName, title: string) =>
    function HeaderTitle() {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MaterialCommunityIcons name={icon} size={22} color={theme.colors.onSurface} />
          <Text style={{ fontSize: 18, fontWeight: "600", color: theme.colors.onSurface }}>{title}</Text>
        </View>
      );
    };

  return (
    <Tabs
      screenOptions={{
        animation: "fade",
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Workouts",
          headerTitle: renderHeaderTitle("arm-flex", "Workouts"),
          tabBarLabel: renderLabel(narrow ? "Train" : "Workouts"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="arm-flex" size={size} color={color} />
          ),
          headerRight: () => (
            <IconButton
              icon="wrench"
              size={24}
              onPress={() => router.push("/tools")}
              accessibilityLabel="Workout tools"
              accessibilityRole="button"
              iconColor={theme.colors.onSurface}
              style={{ minWidth: 48, minHeight: 48 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: "Exercises",
          headerTitle: renderHeaderTitle("format-list-bulleted", "Exercises"),
          tabBarLabel: renderLabel(narrow ? "Library" : "Exercises"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: "Nutrition",
          headerTitle: renderHeaderTitle("food-apple", "Nutrition"),
          tabBarLabel: renderLabel("Nutrition"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="food-apple" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          headerTitle: renderHeaderTitle("chart-line", "Progress"),
          tabBarLabel: renderLabel("Progress"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="chart-line"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          headerTitle: renderHeaderTitle("cog", "Settings"),
          tabBarLabel: renderLabel("Settings"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
