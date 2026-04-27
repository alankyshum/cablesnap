import { TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  showEditButton: boolean;
  completedSetCount: number;
  onCancel: () => void;
  onSave: () => void;
  onEnterEdit: () => void;
  onOpenTemplate: () => void;
  colors: ThemeColors;
};

/**
 * BLD-690 — Detail screen header buttons. Splits the read-only and edit-mode
 * affordances. Lives in its own file to keep `SessionDetail` under the
 * complexity gate (max 15) and to keep the JSX surface tidy.
 */
export function SessionDetailHeaderActions({
  editing,
  dirty,
  saving,
  showEditButton,
  completedSetCount,
  onCancel,
  onSave,
  onEnterEdit,
  onOpenTemplate,
  colors,
}: Props) {
  if (editing) {
    const saveDisabled = !dirty || saving;
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onCancel} accessibilityLabel="Cancel edits" hitSlop={8} style={{ padding: 8 }}>
          <Text style={{ color: colors.onSurface }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          disabled={saveDisabled}
          accessibilityLabel="Save edits"
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <Text style={{ color: saveDisabled ? colors.onSurfaceDisabled : colors.primary, fontWeight: "700" }}>
            Save
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!showEditButton) return null;
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <TouchableOpacity onPress={onEnterEdit} accessibilityLabel="Edit workout" hitSlop={8} style={{ padding: 8 }}>
        <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenTemplate}
        disabled={completedSetCount === 0}
        accessibilityLabel="Save as template"
        accessibilityHint={completedSetCount === 0 ? "No exercises to save" : "Save this workout as a reusable template"}
        hitSlop={8}
        style={{ padding: 8 }}
      >
        <MaterialCommunityIcons
          name="content-save-outline"
          size={22}
          color={completedSetCount === 0 ? colors.onSurfaceDisabled : colors.onSurface}
        />
      </TouchableOpacity>
    </View>
  );
}
