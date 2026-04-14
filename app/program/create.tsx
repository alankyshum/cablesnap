import { useCallback, useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  Button,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import {
  createProgram,
  getProgramById,
  getProgramDays,
  updateProgram,
  removeProgramDay,
  reorderProgramDays,
} from "../../lib/programs";
import type { Program, ProgramDay } from "../../lib/types";

export default function CreateProgram() {
  const theme = useTheme();
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
      Alert.alert("Validation", "Program name is required.");
      return;
    }
    setSaving(true);
    try {
      if (!program) {
        const p = await createProgram(trimmed, description.trim());
        setProgram(p);
        Alert.alert("Program Created", "Now add workout days to your program.");
      } else {
        if (days.length === 0) {
          Alert.alert("Validation", "Add at least 1 workout day.");
          setSaving(false);
          return;
        }
        await updateProgram(program.id, trimmed, description.trim());
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
    day.label || day.template_name || "Deleted Template";

  const renderItem = useCallback(
    ({ item, index }: { item: ProgramDay; index: number }) => (
      <View
        style={[
          styles.dayRow,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.dayInfo}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
            Day {index + 1}: {dayName(item)}
          </Text>
          {item.template_id === null && (
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              Template has been deleted
            </Text>
          )}
        </View>
        <View style={styles.dayActions}>
          <IconButton
            icon="arrow-up"
            size={18}
            onPress={() => move(index, -1)}
            disabled={index === 0}
            accessibilityLabel={`Move ${dayName(item)} up`}
            accessibilityHint="Reorders workout day"
          />
          <IconButton
            icon="arrow-down"
            size={18}
            onPress={() => move(index, 1)}
            disabled={index === days.length - 1}
            accessibilityLabel={`Move ${dayName(item)} down`}
            accessibilityHint="Reorders workout day"
          />
          <IconButton
            icon="close"
            size={18}
            onPress={() => remove(item.id)}
            accessibilityLabel={`Remove ${dayName(item)}`}
          />
        </View>
      </View>
    ),
    [theme, days.length, move, remove]
  );

  return (
    <>
      <Stack.Screen
        options={{ title: program ? "Edit Program" : "New Program" }}
      />
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <TextInput
          label="Program Name"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
          placeholder="e.g. Push/Pull/Legs"
          accessibilityLabel="Program name"
        />
        <TextInput
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          style={styles.input}
          placeholder="e.g. 6-day PPL split"
          accessibilityLabel="Program description"
          multiline
        />
        {program && (
          <>
            <View style={styles.section}>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onBackground }}
              >
                Workout Days ({days.length})
              </Text>
            </View>
            <FlashList
              data={days}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant }}
                    accessibilityRole="text"
                    accessibilityLabel="No workout days added yet"
                  >
                    No days yet. Add workout templates below.
                  </Text>
                </View>
              }
              style={styles.list}
            />
            <Button
              mode="outlined"
              icon="plus"
              onPress={() =>
                router.push(`/program/pick-template?programId=${program.id}`)
              }
              style={styles.addBtn}
              accessibilityLabel="Add workout day from template"
            >
              Add Day
            </Button>
          </>
        )}
        <Button
          mode="contained"
          onPress={save}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
          accessibilityLabel={program ? "Done editing program" : "Create program"}
        >
          {program ? "Done" : "Create Program"}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
