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

  if (!program) {
    return (
      <>
        <Stack.Screen options={{ title: "Program" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const currentIdx = days.findIndex((d) => d.id === program.current_day_id);
  const starter = !!program.is_starter;

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
                accessibilityLabel="Starter program, read-only. Duplicate to edit."
              >
                STARTER
              </Chip>
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
                {days.length} day{days.length !== 1 ? "s" : ""} · {cycle} cycle{cycle !== 1 ? "s" : ""} completed
              </Text>
              {program.is_active && currentIdx >= 0 && (
                <Text
                  variant="body"
                  style={{ color: colors.primary, fontWeight: "600" }}
                  accessibilityLabel={`Currently on day ${currentIdx + 1} of ${days.length}: ${dayName(days[currentIdx])}`}
                >
                  Current: Day {currentIdx + 1} — {dayName(days[currentIdx])}
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
                  accessibilityLabel={program.is_active ? "Deactivate program" : "Set program as active"}
                >
                  {program.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  variant="outline"
                  onPress={handleDuplicate}
                  style={styles.actionBtn}
                  accessibilityLabel="Duplicate to edit"
                  label="Duplicate to Edit"
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  variant={program.is_active ? "outline" : "default"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? "Deactivate program" : "Set program as active"}
                >
                  {program.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  variant="outline"
                  onPress={() => router.push(`/program/create?programId=${program.id}`)}
                  style={styles.actionBtn}
                  accessibilityLabel="Edit program"
                  label="Edit"
                />
                <TouchableOpacity onPress={confirmDelete} accessibilityLabel="Delete program" hitSlop={8} style={{ padding: 8 }}>
                  <MaterialCommunityIcons name="delete" size={24} color={colors.onSurface} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text variant="title" style={{ color: colors.onBackground }}>
                Workout Days ({days.length})
              </Text>
              {!starter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push(`/program/pick-template?programId=${program.id}`)}
                  accessibilityLabel="Add workout day"
                  label="Add Day"
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
            accessibilityLabel={`Day ${index + 1}: ${dayName(item)}${item.id === program.current_day_id ? ", current day" : ""}`}
          >
            <CardContent style={styles.cardContent}>
              <View style={styles.cardInfo}>
                <Text variant="subtitle" style={{ color: colors.onSurface }}>
                  Day {index + 1}: {dayName(item)}
                </Text>
                {item.template_id === null && (
                  <Text variant="caption" style={{ color: colors.error }}>
                    Deleted Template
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
                  <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} accessibilityLabel={`Move ${dayName(item)} up`} accessibilityHint="Reorders workout day" hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-up" size={18} color={index === 0 ? colors.onSurfaceDisabled : colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(index, 1)} disabled={index === days.length - 1} accessibilityLabel={`Move ${dayName(item)} down`} accessibilityHint="Reorders workout day" hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-down" size={18} color={index === days.length - 1 ? colors.onSurfaceDisabled : colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(item.id)} accessibilityLabel={`Remove ${dayName(item)}`} hitSlop={8} style={{ padding: 8 }}>
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
              accessibilityLabel="No workout days added yet"
            >
              No workout days yet. Add templates above.
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
