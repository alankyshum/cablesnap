import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import RatingWidget from "@/components/RatingWidget";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  rating: number | null;
  onRatingChange: (value: number | null) => void;
  notesText: string;
  onNotesChange: (text: string) => void;
  notesExpanded: boolean;
  onToggleNotes: () => void;
  onNotesSave: () => void;
  colors: ThemeColors;
};

export function RatingNotesCard({
  rating,
  onRatingChange,
  notesText,
  onNotesChange,
  notesExpanded,
  onToggleNotes,
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
          <Pressable
            onPress={onToggleNotes}
            style={styles.notesHeader}
            accessibilityRole="button"
            accessibilityLabel="Session notes"
            accessibilityState={{ expanded: notesExpanded }}
          >
            <MaterialCommunityIcons name="note-edit-outline" size={20} color={colors.primary} />
            <Text variant="subtitle" style={{ color: colors.onSurface, marginLeft: 8, flex: 1 }}>
              Session notes
            </Text>
            <MaterialCommunityIcons
              name={notesExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.onSurfaceVariant}
            />
          </Pressable>
          {notesExpanded && (
            <View style={{ marginTop: 8 }}>
              <TextInput
                value={notesText}
                onChangeText={(t) => onNotesChange(t.slice(0, 500))}
                onBlur={onNotesSave}
                placeholder="Add notes about this workout..."
                placeholderTextColor={colors.onSurfaceDisabled}
                multiline
                maxLength={500}
                style={[
                  styles.notesInput,
                  {
                    color: colors.onSurface,
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.outline,
                  },
                ]}
                accessibilityLabel="Session notes"
              />
              <Text
                variant="caption"
                style={{ color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4 }}
              >
                {notesText.length}/500
              </Text>
            </View>
          )}
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
    minHeight: 48,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: fontSizes.sm,
  },
});
