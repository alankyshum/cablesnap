/* eslint-disable max-lines-per-function, complexity */
import { useCallback } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useProgramDetail, dayName } from "@/hooks/useProgramDetail";
import { WeeklySchedule } from "@/components/program/WeeklySchedule";
import { ProgramHistory } from "@/components/program/ProgramHistory";
import {
  CuratedChip,
  CuratedCaption,
  AttributionFooter,
  useCuratedCaption,
} from "@/components/program/CuratedExtras";
import { CURATED_ATTRIBUTION } from "../../lib/curated-programs";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

export default function ProgramDetail() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    program, days, cycle, history,
    schedule, templates, picker, setPicker, loading,
    load, toggle, confirmDelete, remove, move,
    handleDuplicate, assignDay, confirmClearSchedule, schedEntry,
  } = useProgramDetail({ id, router });

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const { visible: captionVisible, dismiss: dismissCaption } = useCuratedCaption();

  if (!program) {
    return (
      <>
          <Stack.Screen options={{ title: t({ id: "app.program.id.program", message: "Program" }) }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "app.program.id.loading", message: "Loading..." })}</Text>
        </View>
      </>
    );
  }

  const currentIdx = days.findIndex((d) => d.id === program.current_day_id);
  const starter = !!program.is_starter;
  const curated = !!program.is_curated;
  // BLD-1000: curated programs are user-editable in place — they get the
  // same action set as a custom program (Set Active / Edit). They are NOT
  // user-deletable in v1: `softDeleteProgram` rejects curated rows so the
  // delete icon is suppressed below. Attribution footer is rendered when
  // `curated` is true. The first-launch caption lives in ProgramsList.
  const attribution = curated ? CURATED_ATTRIBUTION[program.id] : undefined;

  return (
    <>
      <Stack.Screen options={{ title: program.name }} />
      <FlatList
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        data={days}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {starter && (
              <Chip
                compact
                style={styles.starterChip}
                accessibilityLabel={t({ id: "app.program.id.starter-a11y", message: "Starter program, read-only. Duplicate to edit." })}
              >
                {t({ id: "app.program.id.starter", message: "STARTER" })}
              </Chip>
            )}
            {curated && <CuratedChip />}
            {curated && (
              <CuratedCaption
                visible={captionVisible}
                onDismiss={dismissCaption}
                surface={colors.surface}
                outline={colors.outline}
                onSurfaceVariant={colors.onSurfaceVariant}
              />
            )}

            {program.description ? (
              <Text
                variant="body"
                style={[styles.desc, { color: colors.onSurfaceVariant }]}
              >
                {program.description}
              </Text>
            ) : null}

            <View style={styles.meta}>
              <Text variant="body" style={{ color: colors.onBackground }}>
                 {i18n._({ id: "app.program.id.meta", message: "{days, plural, one {# day} other {# days}} · {cycles, plural, one {# cycle} other {# cycles}} completed", values: { days: days.length, cycles: cycle } })}
              </Text>
              {program.is_active && currentIdx >= 0 && (
                <Text
                  variant="body"
                  style={{ color: colors.primary, fontWeight: "600" }}
                  accessibilityLabel={i18n._({ id: "app.program.id.current-day-a11y", message: "Currently on day {current} of {total}: {name}", values: { current: currentIdx + 1, total: days.length, name: dayName(days[currentIdx]) } })}
                >
                  {i18n._({ id: "app.program.id.current-day", message: "Current: Day {day} — {name}", values: { day: currentIdx + 1, name: dayName(days[currentIdx]) } })}
                </Text>
              )}
            </View>

            {starter ? (
              <View style={styles.actions}>
                <Button
                  variant={program.is_active ? "outline" : "default"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? t({ id: "app.program.id.deactivate-a11y", message: "Deactivate program" }) : t({ id: "app.program.id.activate-a11y", message: "Set program as active" })}
                >
                  {program.is_active ? t({ id: "app.program.id.deactivate", message: "Deactivate" }) : t({ id: "app.program.id.set-active", message: "Set Active" })}
                </Button>
                <Button
                  variant="outline"
                  onPress={handleDuplicate}
                  style={styles.actionBtn}
                 accessibilityLabel={t({ id: "app.program.id.duplicate-a11y", message: "Duplicate to edit" })}
                 label={t({ id: "app.program.id.duplicate", message: "Duplicate to Edit" })}
                />
              </View>
            ) : curated ? (
              // BLD-1000: curated programs are editable in place but not
              // user-deletable in v1. Same actions as custom minus delete.
              <View style={styles.actions}>
                <Button
                  variant={program.is_active ? "outline" : "default"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? t({ id: "app.program.id.deactivate-a11y-2", message: "Deactivate program" }) : t({ id: "app.program.id.activate-a11y-2", message: "Set program as active" })}
                >
                  {program.is_active ? t({ id: "app.program.id.deactivate-2", message: "Deactivate" }) : t({ id: "app.program.id.set-active-2", message: "Set Active" })}
                </Button>
                <Button
                  variant="outline"
                  onPress={() => router.push(`/program/create?programId=${program.id}`)}
                  style={styles.actionBtn}
                   accessibilityLabel={t({ id: "app.program.id.edit-a11y", message: "Edit program" })}
                   label={t({ id: "app.program.id.edit", message: "Edit" })}
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  variant={program.is_active ? "outline" : "default"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? t({ id: "app.program.id.deactivate-a11y-3", message: "Deactivate program" }) : t({ id: "app.program.id.activate-a11y-3", message: "Set program as active" })}
                >
                  {program.is_active ? t({ id: "app.program.id.deactivate-3", message: "Deactivate" }) : t({ id: "app.program.id.set-active-3", message: "Set Active" })}
                </Button>
                <Button
                  variant="outline"
                  onPress={() => router.push(`/program/create?programId=${program.id}`)}
                  style={styles.actionBtn}
                   accessibilityLabel={t({ id: "app.program.id.edit-a11y-2", message: "Edit program" })}
                   label={t({ id: "app.program.id.edit-2", message: "Edit" })}
                />
                 <TouchableOpacity onPress={confirmDelete} accessibilityLabel={t({ id: "app.program.id.delete-a11y", message: "Delete program" })} hitSlop={8} style={{ padding: 8 }}>
                  <MaterialCommunityIcons name="delete" size={24} color={colors.onSurface} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text variant="title" style={{ color: colors.onBackground }}>
                 {t({ id: "app.program.id.workout-days", message: `Workout Days (${days.length})` })}
              </Text>
              {!starter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push(`/program/pick-template?programId=${program.id}`)}
                 accessibilityLabel={t({ id: "app.program.id.add-day-a11y", message: "Add workout day" })}
                 label={t({ id: "app.program.id.add-day", message: "Add Day" })}
                />
              )}
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <Card
            style={StyleSheet.flatten([
              styles.card,
              { backgroundColor: colors.surface },
              item.id === program.current_day_id && {
                borderColor: colors.primary,
                borderWidth: 2,
              },
            ])}
            accessibilityLabel={i18n._({ id: "app.program.id.day-a11y", message: "Day {day}: {name}{current, select, true {, current day} false {}}", values: { day: index + 1, name: dayName(item), current: item.id === program.current_day_id } })}
          >
            <CardContent style={styles.cardContent}>
              <View style={styles.cardInfo}>
                <Text variant="subtitle" style={{ color: colors.onSurface }}>
                   {i18n._({ id: "app.program.id.day-name", message: "Day {day}: {name}", values: { day: index + 1, name: dayName(item) } })}
                </Text>
                {item.template_id === null && (
                  <Text variant="caption" style={{ color: colors.error }}>
                    {t({ id: "app.program.id.deleted-template", message: "Deleted Template" })}
                  </Text>
                )}
                {item.label && item.template_name && item.label !== item.template_name && (
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                    {item.template_name}
                  </Text>
                )}
              </View>
              {!starter && (
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} accessibilityLabel={t({ id: "app.program.id.move-up", message: `Move ${dayName(item)} up` })} accessibilityHint={t({ id: "app.program.id.reorder-hint", message: "Reorders workout day" })} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-up" size={18} color={index === 0 ? colors.onSurfaceDisabled : colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(index, 1)} disabled={index === days.length - 1} accessibilityLabel={t({ id: "app.program.id.move-down", message: `Move ${dayName(item)} down` })} accessibilityHint={t({ id: "app.program.id.reorder-hint-down", message: "Reorders workout day" })} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-down" size={18} color={index === days.length - 1 ? colors.onSurfaceDisabled : colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(item.id)} accessibilityLabel={t({ id: "app.program.id.remove-day-a11y", message: `Remove ${dayName(item)}` })} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                </View>
              )}
            </CardContent>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant }}
              accessibilityRole="text"
               accessibilityLabel={t({ id: "app.program.id.no-days-a11y", message: "No workout days added yet" })}
            >
               {t({ id: "app.program.id.no-days", message: "No workout days yet. Add templates above." })}
            </Text>
          </View>
        }
        ListFooterComponent={
          <>
            <WeeklySchedule
              schedule={schedule}
              templates={templates}
              picker={picker}
              starter={starter}
              colors={colors}
              onAssignDay={assignDay}
              onPickerOpen={setPicker}
              onPickerClose={() => setPicker(null)}
              onClearSchedule={confirmClearSchedule}
              schedEntry={schedEntry}
            />
            <ProgramHistory history={history} colors={colors} router={router} />
            <AttributionFooter
              attribution={attribution}
              primary={colors.primary}
              onSurfaceVariant={colors.onSurfaceVariant}
            />
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  desc: {
    marginBottom: 12,
  },
  starterChip: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  meta: {
    marginBottom: 16,
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  card: {
    marginBottom: 8,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
