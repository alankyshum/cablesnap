import { t } from "@lingui/core/macro";
import { useCallback } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "@/lib/layout";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { TemplateExerciseRow } from "@/components/template/TemplateExerciseRow";
import ExercisePickerSheet from "@/components/ExercisePickerSheet";
import EditExerciseModal from "@/components/EditExerciseModal";
import type { TemplateExercise } from "@/lib/types";

export default function EditTemplate() {
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    template, exercises, name, nameError, selecting, selected,
    pickerOpen, editing, linkIds, palette, colors,
    setPickerOpen, setEditing,
    startSelection, cancelSelection, confirmLink,
    move, remove, toggleSelect,
    handleUnlink, handleUnlinkSingle,
    handlePickExercise, handleEditSave, handleDuplicate,
    handleNameChange, handleNameBlur,
  } = useTemplateEditor({ id, router });

  const starter = !!template?.is_starter;

  const renderItem = useCallback(
    ({ item, index }: { item: TemplateExercise; index: number }) => (
      <TemplateExerciseRow
        item={item}
        index={index}
        exercises={exercises}
        linkIds={linkIds}
        palette={palette}
        selecting={selecting}
        selected={selected}
        colors={colors}
        starter={starter}
        templateId={id}
        onToggleSelect={toggleSelect}
        onEdit={setEditing}
        onStartSelection={startSelection}
        onMove={move}
        onRemove={remove}
        onUnlink={handleUnlink}
        onUnlinkSingle={handleUnlinkSingle}
        onReplace={(teId) => router.push(`/template/${id}?replaceTeId=${teId}`)}
      />
    ),
    [colors, exercises, linkIds, palette, selecting, selected, starter, id, move, remove, toggleSelect, handleUnlink, handleUnlinkSingle, setEditing, startSelection, router],
  );

  if (!template) {
    return (
      <>
        <Stack.Screen options={{ title: t({ id: "app.template.id.template", message: "Template" }) }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.template.id.loading", message: "Loading..." })}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: (name.trim() || template.name) }} />
      <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}>
        {!starter && (
          <Input
            label={t({ id: "app.template.id.name", message: "Name" })}
            placeholder={t({ id: "app.template.id.name-placeholder", message: "e.g. Upper Body, Push Day" })}
            value={name}
            onChangeText={handleNameChange}
            onBlur={handleNameBlur}
            error={nameError ?? undefined}
            maxLength={100}
            containerStyle={styles.nameInput}
            accessibilityLabel={t({ id: "app.template.id.name-a11y", message: "Template Name" })}
          />
        )}
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text variant="title" style={{ color: colors.onBackground, flexShrink: 1 }}>
              {t({ id: "app.template.id.exercises", message: `Exercises (${exercises.length})` })}
            </Text>
            {starter && (
              <Chip accessibilityLabel={t({ id: "app.template.id.starter-a11y", message: "Starter template, read-only. Duplicate to edit." })}>{t({ id: "app.template.id.starter", message: "STARTER" })}</Chip>
            )}
          </View>
        </View>

        {selecting && !starter && (
          <View style={[styles.selectionBar, { backgroundColor: colors.primaryContainer }]}>
            <Text variant="body" style={{ color: colors.onPrimaryContainer, flex: 1 }} accessibilityLiveRegion="polite">
              {t({ id: "app.template.id.selected", message: `${selected.size} selected` })}
            </Text>
            <Button variant="default" onPress={confirmLink} disabled={selected.size < 2} style={{ marginRight: 8 }} accessibilityLabel={t({ id: "app.template.id.link-a11y", message: "Link selected exercises" })} label={t({ id: "app.template.id.link", message: "Link" })} />
            <Button variant="ghost" onPress={cancelSelection} accessibilityLabel={t({ id: "app.template.id.cancel-a11y", message: "Cancel selection" })} label={t({ id: "app.template.id.cancel", message: "Cancel" })} />
          </View>
        )}

        <FlatList
          data={exercises}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          extraData={[selecting, selected, linkIds]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="body" style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.template.id.empty", message: "No exercises. Add some below." })}</Text>
            </View>
          }
          style={styles.list}
        />

        {starter ? (
          <Button variant="default" onPress={handleDuplicate} style={styles.doneBtn} accessibilityLabel={t({ id: "app.template.id.duplicate-a11y", message: "Duplicate to edit" })} label={t({ id: "app.template.id.duplicate", message: "Duplicate to Edit" })} />
        ) : (
          <>
            {!selecting && exercises.length >= 2 && (
              <Button variant="outline" onPress={() => startSelection()} style={styles.addBtn} accessibilityLabel={t({ id: "app.template.id.superset-a11y", message: "Create superset" })} accessibilityRole="button" label={t({ id: "app.template.id.superset", message: "Create Superset" })} />
            )}
            <Button variant="outline" onPress={() => setPickerOpen(true)} style={styles.addBtn} accessibilityLabel={t({ id: "app.template.id.add-exercise-a11y", message: "Add exercise to template" })} label={t({ id: "app.template.id.add-exercise", message: "Add Exercise" })} />
            <Button variant="default" onPress={() => router.back()} style={styles.doneBtn} accessibilityLabel={t({ id: "app.template.id.done-a11y", message: "Done editing template" })} label={t({ id: "app.template.id.done", message: "Done" })} />
          </>
        )}
      </View>
      <ExercisePickerSheet visible={pickerOpen} onDismiss={() => setPickerOpen(false)} onPick={handlePickExercise} />
      <EditExerciseModal visible={!!editing} exercise={editing} onSave={handleEditSave} onDismiss={() => setEditing(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingVertical: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { marginBottom: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  list: { flex: 1 },
  nameInput: { marginBottom: 12 },
  addBtn: { marginTop: 8 },
  doneBtn: { marginTop: 16 },
  empty: { alignItems: "center", paddingVertical: 24 },
  selectionBar: { flexDirection: "row", alignItems: "center", padding: 8, borderRadius: 8, marginBottom: 8 },
});
