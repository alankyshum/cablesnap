/* eslint-disable max-lines-per-function */
import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { CATEGORY_LABELS, type Exercise } from "../../lib/types";
import { difficultyText, DIFFICULTY_COLORS } from "../../constants/theme";
import { MuscleMap } from "../../components/MuscleMap";
import { fontSizes } from "@/constants/design-tokens";

export interface ExerciseDetailPaneProps {
  detail: Exercise | null;
  colors: ThemeColors;
  profileGender: "male" | "female" | undefined;
}

export function ExerciseDetailPane({ detail, colors, profileGender }: ExerciseDetailPaneProps) {
  const steps = detail?.instructions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <View style={[styles.detailPane, { borderLeftColor: colors.outlineVariant }]}>
      {detail ? (
        <FlatList
          data={[]}
          renderItem={null}
          contentContainerStyle={styles.detailContent}
          ListHeaderComponent={
            <>
              <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 12 }}>
                {detail.name}
              </Text>
              {detail.is_custom && (
                <Chip
                  compact
                  style={{ backgroundColor: colors.tertiaryContainer, alignSelf: "flex-start", marginBottom: 8 }}
                  textStyle={{ fontSize: fontSizes.xs }}
                >
                  Custom
                </Chip>
              )}
              <View style={styles.row}>
                <View style={[styles.detailBadge, { backgroundColor: colors.primaryContainer }]}>
                  <Text style={[styles.detailBadgeText, { color: colors.onPrimaryContainer }]}>
                    {CATEGORY_LABELS[detail.category]}
                  </Text>
                </View>
                <View style={[styles.detailBadge, { backgroundColor: DIFFICULTY_COLORS[detail.difficulty] }]}>
                  <Text style={[styles.detailBadgeText, { color: difficultyText(detail.difficulty), fontWeight: "600" }]}>
                    {detail.difficulty}
                  </Text>
                </View>
              </View>
              {detail.mount_position && (
                <>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16, fontSize: fontSizes.xs }}>
                    Mount Position
                  </Text>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurface, marginTop: 4 }}
                    accessibilityLabel={`Mount position: ${detail.mount_position} on rack`}
                  >
                    {detail.mount_position}
                  </Text>
                </>
              )}
              {detail.attachment && (
                <>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16, fontSize: fontSizes.xs }}>
                    Attachment
                  </Text>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurface, marginTop: 4 }}
                    accessibilityLabel={`Attachment: ${detail.attachment}`}
                  >
                    {detail.attachment}
                  </Text>
                </>
              )}
              {detail.training_modes && detail.training_modes.length > 0 && (
                <View accessibilityLabel={`Compatible training modes: ${detail.training_modes.join(", ")}`}>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16, fontSize: fontSizes.xs }}>
                    Training Modes
                  </Text>
                  <View style={[styles.row, { marginTop: 6, flexWrap: "wrap", gap: 6 }]}>
                    {detail.training_modes.map((m) => (
                      <View key={m} style={[styles.detailBadge, { backgroundColor: colors.secondaryContainer }]}>
                        <Text style={[styles.detailBadgeText, { color: colors.onSecondaryContainer }]}>
                          {m.replace(/_/g, " ")}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <MuscleMap
                primary={detail.primary_muscles}
                secondary={detail.secondary_muscles}
                width={360}
                gender={profileGender}
              />
              <View style={styles.muscleColumns}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16 }}>
                    Primary Muscles
                  </Text>
                  <View style={[styles.row, { marginTop: 6, flexWrap: "wrap", gap: 6 }]}>
                    {detail.primary_muscles.map((m) => (
                      <View key={m} style={[styles.detailBadge, { backgroundColor: colors.secondaryContainer }]}>
                        <Text style={[styles.detailBadgeText, { color: colors.onSecondaryContainer }]}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {detail.secondary_muscles.length > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16 }}>
                      Secondary Muscles
                    </Text>
                    <View style={[styles.row, { marginTop: 6, flexWrap: "wrap", gap: 6 }]}>
                      {detail.secondary_muscles.map((m) => (
                        <View key={m} style={[styles.detailBadge, { backgroundColor: colors.tertiaryContainer }]}>
                          <Text style={[styles.detailBadgeText, { color: colors.onTertiaryContainer }]}>{m}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
              {steps && steps.length > 0 && (
                <>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 16 }}>
                    Instructions
                  </Text>
                  {steps.map((step, i) => (
                    <Text key={i} variant="body" style={{ color: colors.onSurface, marginTop: 6, lineHeight: 22 }}>
                      {step}
                    </Text>
                  ))}
                </>
              )}
            </>
          }
        />
      ) : (
        <View style={styles.detailEmpty}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            Select an exercise to view details
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  detailPane: {
    flex: 3,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  detailContent: {
    padding: 24,
    paddingBottom: 32,
  },
  detailEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  muscleColumns: {
    flexDirection: "row",
    gap: 16,
  },
  detailBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  detailBadgeText: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
  },
});
