import { FlashList } from "@shopify/flash-list";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { DAYS } from "@/lib/format";
import type { WorkoutTemplate } from "@/lib/types";
import type { ScheduleEntry } from "@/lib/db/settings";

type Props = {
  schedule: ScheduleEntry[];
  templates: WorkoutTemplate[];
  picker: number | null;
  starter: boolean;
  colors: import("@/hooks/useThemeColors").ThemeColors;
  onAssignDay: (day: number, tpl: WorkoutTemplate | null) => void;
  onPickerOpen: (day: number) => void;
  onPickerClose: () => void;
  onClearSchedule: () => void;
  schedEntry: (day: number) => ScheduleEntry | undefined;
};

export function WeeklySchedule({
  schedule,
  templates,
  picker,
  starter,
  colors,
  onAssignDay,
  onPickerOpen,
  onPickerClose,
  onClearSchedule,
  schedEntry,
}: Props) {
  return (
    <>
      <View style={styles.scheduleSection}>
        <View style={styles.sectionHeader}>
          <Text variant="title" style={{ color: colors.onBackground }}>
            Weekly Schedule
          </Text>
          {schedule.length > 0 && !starter && (
            <Button
              variant="ghost"
              size="sm"
              onPress={onClearSchedule}
              accessibilityLabel="Clear weekly schedule"
              label="Clear"
            />
          )}
        </View>

        {templates.length === 0 ? (
          <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
            Create a template first to set a schedule.
          </Text>
        ) : (
          <>
            {DAYS.map((label, i) => {
              const e = schedEntry(i);
              return (
                <Pressable
                  key={i}
                  onPress={starter ? undefined : () => onPickerOpen(i)}
                  disabled={starter}
                  style={[
                    styles.daySlot,
                    { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${e ? e.template_name : "Rest day"}`}
                >
                  <View style={styles.dayRow}>
                    <Text variant="subtitle" style={[styles.dayLabel, { color: colors.onSurface }]}>
                      {label}
                    </Text>
                    <View style={styles.dayInfo}>
                      {e ? (
                        <Text variant="body" style={{ color: colors.onSurface }} numberOfLines={1}>
                          {e.template_name}
                        </Text>
                      ) : (
                        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
                          Rest
                        </Text>
                      )}
                    </View>
                    {!starter && (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={colors.onSurfaceVariant}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </View>

      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={onPickerClose}
        accessibilityViewIsModal
      >
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <Card style={StyleSheet.flatten([styles.picker, { backgroundColor: colors.surface }])}>
            <CardContent>
              <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
                {picker !== null ? DAYS[picker] : ""} — Pick Template
              </Text>

              <FlashList
                data={
                  picker !== null && schedEntry(picker)
                    ? [{ id: "__remove__", name: "Remove (Rest Day)" } as WorkoutTemplate, ...templates]
                    : templates
                }
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 300 }}
                renderItem={({ item }) => {
                  if (item.id === "__remove__") {
                    return (
                      <Pressable
                        onPress={() => onAssignDay(picker!, null)}
                        style={[styles.pickItem, { borderBottomColor: colors.outlineVariant }]}
                        accessibilityRole="button"
                        accessibilityLabel="Remove template, set as rest day"
                      >
                        <Text variant="body" style={{ color: colors.error }}>
                          Remove (Rest Day)
                        </Text>
                      </Pressable>
                    );
                  }
                  return (
                    <Pressable
                      onPress={() => picker !== null && onAssignDay(picker, item)}
                      style={[styles.pickItem, { borderBottomColor: colors.outlineVariant }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Select template: ${item.name}`}
                    >
                      <Text
                        variant="body"
                        style={{
                          color: picker !== null && schedEntry(picker)?.template_id === item.id
                            ? colors.primary
                            : colors.onSurface,
                        }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
              />

              <Button
                variant="ghost"
                onPress={onPickerClose}
                style={{ marginTop: 8 }}
                accessibilityLabel="Cancel template selection"
                label="Cancel"
              />
            </CardContent>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scheduleSection: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  daySlot: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayLabel: {
    width: 36,
    fontWeight: "600",
  },
  dayInfo: {
    flex: 1,
    marginLeft: 8,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  picker: {
    width: "100%",
    maxHeight: "80%",
  },
  pickItem: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    justifyContent: "center",
  },
});
