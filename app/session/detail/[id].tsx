import { StyleSheet, TouchableOpacity, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useLayout } from "@/lib/layout";
import { useSessionDetail } from "@/hooks/useSessionDetail";
import { SummaryCard } from "@/components/session/detail/SummaryCard";
import { RatingNotesCard } from "@/components/session/detail/RatingNotesCard";
import { ExerciseGroupRow } from "@/components/session/detail/ExerciseGroupRow";
import { TemplateModal } from "@/components/session/detail/TemplateModal";

export default function SessionDetail() {
  const layout = useLayout();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    session, groups, prs, rating, notesText, setNotesText,
    notesExpanded, setNotesExpanded, templateModalVisible, templateName,
    setTemplateName, completedSetCount, saving, linkIds, palette,
    volume, completedSets, handleRatingChange, handleNotesSave,
    handleSaveAsTemplate, handleRepeatWorkout, openTemplateModal,
    closeTemplateModal, colors,
  } = useSessionDetail(id);

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Workout" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: session.completed_at
            ? () => (
                <TouchableOpacity
                  onPress={openTemplateModal}
                  disabled={completedSetCount === 0}
                  accessibilityLabel="Save as template"
                  accessibilityHint={completedSetCount === 0 ? "No exercises to save" : "Save this workout as a reusable template"}
                  hitSlop={8}
                  style={{ padding: 8 }}
                >
                  <MaterialCommunityIcons name="content-save-outline" size={24} color={completedSetCount === 0 ? colors.onSurfaceDisabled : colors.onSurface} />
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <FlashList
        data={groups}
        keyExtractor={(group) => group.exercise_id}
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        ListHeaderComponent={
          <>
            <SummaryCard session={session} completedSets={completedSets()} volume={volume()} colors={colors} />

            {session.completed_at && (
              <RatingNotesCard
                rating={rating}
                onRatingChange={handleRatingChange}
                notesText={notesText}
                onNotesChange={setNotesText}
                notesExpanded={notesExpanded}
                onToggleNotes={() => setNotesExpanded(!notesExpanded)}
                onNotesSave={handleNotesSave}
                colors={colors}
              />
            )}

            {prs.length > 0 && (
              <Card
                style={StyleSheet.flatten([styles.prCard, { backgroundColor: colors.tertiaryContainer }])}
                accessibilityLabel={`${prs.length} new personal record${prs.length > 1 ? "s" : ""} achieved in this workout`}
              >
                <CardContent>
                  <View style={styles.prHeader}>
                    <MaterialCommunityIcons name="trophy" size={20} color={colors.onTertiaryContainer} />
                    <Text variant="title" style={{ color: colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}>
                      {prs.length} New PR{prs.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                  {prs.map((pr) => (
                    <View key={pr.exercise_id} style={styles.prRow}>
                      <Text variant="body" style={{ color: colors.onTertiaryContainer, flex: 1 }} accessibilityLabel={`New personal record: ${pr.name}, ${pr.previous_max} to ${pr.weight}`}>
                        {pr.name}
                      </Text>
                      <Text variant="body" style={{ color: colors.onTertiaryContainer }}>
                        {pr.previous_max} → {pr.weight}
                      </Text>
                    </View>
                  ))}
                </CardContent>
              </Card>
            )}

            {session.completed_at && (
              <Button variant="outline" onPress={handleRepeatWorkout} disabled={completedSetCount === 0} style={styles.repeatButton} accessibilityLabel="Repeat workout" accessibilityHint="Start a new session with the same exercises and weights" accessibilityRole="button" label="Repeat Workout" />
            )}
          </>
        }
        renderItem={({ item: group }) => (
          <ExerciseGroupRow group={group} groups={groups} linkIds={linkIds} palette={palette} colors={colors} />
        )}
        ListFooterComponent={
          <TemplateModal
            visible={templateModalVisible}
            templateName={templateName}
            onNameChange={setTemplateName}
            onSave={handleSaveAsTemplate}
            onClose={closeTemplateModal}
            saving={saving}
            colors={colors}
          />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  prCard: { marginBottom: 20 },
  repeatButton: { marginBottom: 20 },
  prHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  prRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
});
