import { View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { styles } from "./_recommend-styles";

type MetaItem = { icon: "clock-outline" | "dumbbell" | "calendar-sync"; label: string };

export function MetaRow({ items }: { items: MetaItem[] }) {
  const colors = useThemeColors();
  return (
    <View style={styles.meta}>
      {items.map((m, idx) => (
        <View key={m.icon} style={{ flexDirection: "row", alignItems: "center", marginLeft: idx > 0 ? 12 : 0 }}>
          <MaterialCommunityIcons name={m.icon} size={16} color={colors.onSurfaceVariant} />
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}
