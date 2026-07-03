import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import RatingWidget from "@/components/RatingWidget";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  rating: number | null;
  onRatingChange: (value: number | null) => void;
  notesText: string;
  onNotesChange: (text: string) => void;
  onNotesSave: () => void;
  colors: ThemeColors;
};

// NOTE: notesExpanded/onToggleNotes props removed — notes input is always visible (BLD-2743).
// The companion summary card at app/session/summary/[id].tsx has the same always-visible pattern.

export function RatingNotesCard({
  rating,
  onRatingChange,
  notesText,
  onNotesChange,
  onNotesSave,
  colors,
}: Props) {
  return (
    <>
      <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
        <CardContent style={{ alignItems: "center" }}>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
            Rating
          </Text>
          <RatingWidget value={rating} onChange={onRatingChange} />
        </CardContent>
      </Card>

      <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
        <CardContent>
          <View style={styles.notesHeader}>
            <MaterialCommunityIcons name="note-edit-outline" size={20} color={colors.primary} />
            <Text variant="subtitle" style={{ color: colors.onSurface, marginLeft: 8, flex: 1 }}>
              Session notes
            </Text>
          </View>
          <Input
            type="textarea"
            variant="outline"
            rows={5}
            placeholder="Add notes about this workout..."
            placeholderTextColor={colors.onSurfaceVariant}
            value={notesText}
            onChangeText={(t) => onNotesChange(t.slice(0, 500))}
            onBlur={onNotesSave}
            maxLength={500}
            textAlignVertical="top"
            inputStyle={{ ...styles.notesInput, color: colors.onSurface }}
            accessibilityLabel="Session notes"
          />
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4 }}
          >
            {notesText.length}/500
          </Text>
        </CardContent>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 20,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    marginBottom: 8,
  },
  notesInput: {
    fontSize: fontSizes.lg,
    lineHeight: 24,
    minHeight: 140,
  },
});
