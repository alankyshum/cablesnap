import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import {
  createProgram,
  getProgramById,
  getProgramDays,
  updateProgram,
  removeProgramDay,
  reorderProgramDays,
} from "../../lib/programs";
import type { Program, ProgramDay } from "../../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import { bumpQueryVersion } from "../../lib/query";

export default function CreateProgram() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{
    programId?: string;
  }>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!program) return;
    const d = await getProgramDays(program.id);
    setDays(d);
  }, [program]);

  useFocusEffect(
    useCallback(() => {
      if (program) {
        getProgramDays(program.id).then(setDays);
      } else if (params.programId) {
        getProgramById(params.programId).then((p) => {
          if (p) {
            setProgram(p);
            setName(p.name);
            setDescription(p.description);
            getProgramDays(p.id).then(setDays);
          }
        });
      }
    }, [program, params.programId])
  );

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t({ id: "app.program.create.validation", message: "Validation" }), t({ id: "app.program.create.name-required", message: "Program name is required." }));
      return;
    }
    setSaving(true);
    try {
      if (!program) {
        const p = await createProgram(trimmed, description.trim());
        setProgram(p);
        bumpQueryVersion("home");
        Alert.alert(t({ id: "app.program.create.created", message: "Program Created" }), t({ id: "app.program.create.add-days", message: "Now add workout days to your program." }));
      } else {
        if (days.length === 0) {
          Alert.alert(t({ id: "app.program.create.validation-days", message: "Validation" }), t({ id: "app.program.create.minimum-day", message: "Add at least 1 workout day." }));
          setSaving(false);
          return;
        }
        await updateProgram(program.id, trimmed, description.trim());
        bumpQueryVersion("home");
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = useCallback(
    async (dayId: string) => {
      await removeProgramDay(dayId);
      await load();
    },
    [load]
  );

  const move = useCallback(
    async (index: number, dir: -1 | 1) => {
      if (!program) return;
      const target = index + dir;
      if (target < 0 || target >= days.length) return;
      const ids = days.map((d) => d.id);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await reorderProgramDays(program.id, ids);
      await load();
    },
    [program, days, load]
  );

  const dayName = (day: ProgramDay) =>
    day.label || day.template_name || t({ id: "app.program.create.deleted-template", message: "Deleted Template" });

  const renderItem = useCallback(
    ({ item, index }: { item: ProgramDay; index: number }) => (
      <View
        style={[
          styles.dayRow,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.dayInfo}>
          <Text variant="subtitle" style={{ color: colors.onSurface }}>
             {i18n._({ id: "app.program.create.day-name", message: "Day {day}: {name}", values: { day: index + 1, name: dayName(item) } })}
          </Text>
          {item.template_id === null && (
            <Text variant="caption" style={{ color: colors.error }}>
              {t({ id: "app.program.create.template-deleted", message: "Template has been deleted" })}
            </Text>
          )}
        </View>
        <View style={styles.dayActions}>
          <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} accessibilityLabel={t({ id: "app.program.create.move-up", message: `Move ${dayName(item)} up` })} accessibilityHint={t({ id: "app.program.create.reorder-hint", message: "Reorders workout day" })} hitSlop={8} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="arrow-up" size={18} color={index === 0 ? colors.onSurfaceDisabled : colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(index, 1)} disabled={index === days.length - 1} accessibilityLabel={t({ id: "app.program.create.move-down", message: `Move ${dayName(item)} down` })} accessibilityHint={t({ id: "app.program.create.reorder-hint-down", message: "Reorders workout day" })} hitSlop={8} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="arrow-down" size={18} color={index === days.length - 1 ? colors.onSurfaceDisabled : colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(item.id)} accessibilityLabel={t({ id: "app.program.create.remove-day-a11y", message: `Remove ${dayName(item)}` })} hitSlop={8} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="close" size={18} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>
    ),
    [colors, days.length, move, remove]
  );

  return (
    <>
      <Stack.Screen
        options={{ title: program ? t({ id: "app.program.create.edit-title", message: "Edit Program" }) : t({ id: "app.program.create.new-title", message: "New Program" }) }}
      />
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}
      >
        <Input
          label={t({ id: "app.program.create.name", message: "Program Name" })}
          value={name}
          onChangeText={setName}
          containerStyle={styles.input}
          placeholder={t({ id: "app.program.create.name-placeholder", message: "e.g. Push/Pull/Legs" })}
          accessibilityLabel={t({ id: "app.program.create.name-a11y", message: "Program name" })}
        />
        <Input
          label={t({ id: "app.program.create.description", message: "Description (optional)" })}
          value={description}
          onChangeText={setDescription}
          containerStyle={styles.input}
          placeholder={t({ id: "app.program.create.description-placeholder", message: "e.g. 6-day PPL split" })}
          accessibilityLabel={t({ id: "app.program.create.description-a11y", message: "Program description" })}
          multiline
        />
        {program && (
          <>
            <View style={styles.section}>
              <Text
                variant="title"
                style={{ color: colors.onBackground }}
              >
                {t({ id: "app.program.create.workout-days", message: `Workout Days (${days.length})` })}
              </Text>
            </View>
            <FlatList
              data={days}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurfaceVariant }}
                    accessibilityRole="text"
                    accessibilityLabel={t({ id: "app.program.create.no-days-a11y", message: "No workout days added yet" })}
                  >
                    {t({ id: "app.program.create.no-days", message: "No days yet. Add workout templates below." })}
                  </Text>
                </View>
              }
              style={styles.list}
            />
            <Button
              variant="outline"
              onPress={() =>
                router.push(`/program/pick-template?programId=${program.id}`)
              }
              style={styles.addBtn}
              accessibilityLabel={t({ id: "app.program.create.add-day-a11y", message: "Add workout day from template" })}
              label={t({ id: "app.program.create.add-day", message: "Add Day" })}
            />
          </>
        )}
        <Button
          variant="default"
          onPress={save}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
          accessibilityLabel={program ? t({ id: "app.program.create.done-a11y", message: "Done editing program" }) : t({ id: "app.program.create.create-a11y", message: "Create program" })}
        >
          {program ? t({ id: "app.program.create.done", message: "Done" }) : t({ id: "app.program.create.create", message: "Create Program" })}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 16,
  },
  input: {
    marginBottom: 12,
  },
  section: {
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayInfo: {
    flex: 1,
  },
  dayActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  addBtn: {
    marginTop: 8,
  },
  saveBtn: {
    marginTop: 16,
  },
  btnContent: {
    paddingVertical: 8,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
