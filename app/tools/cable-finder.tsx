import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SectionList,
  StyleSheet,
  View,
  Pressable,
  ScrollView,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { spacing } from "@/constants/design-tokens";
import {
  ATTACHMENT_LABELS,
  MOUNT_POSITION_LABELS,
  type Attachment,
  type MountPosition,
  type MuscleGroup,
} from "@/lib/types";
import { MOUNT_POSITION_VALUES } from "@/lib/cable-variant";
import {
  getCableExercises,
  getAvailableAttachments,
  type CableFinderFilters,
  type CableExercise,
} from "@/lib/db/cable-finder";
import { plural, t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

function muscleLabel(muscle: MuscleGroup): string {
  switch (muscle) {
    case "chest": return t({ id: "app.tools.cableFinder.muscle.chest", message: "Chest" });
    case "back": return t({ id: "app.tools.cableFinder.muscle.back", message: "Back" });
    case "shoulders": return t({ id: "app.tools.cableFinder.muscle.shoulders", message: "Shoulders" });
    case "biceps": return t({ id: "app.tools.cableFinder.muscle.biceps", message: "Biceps" });
    case "triceps": return t({ id: "app.tools.cableFinder.muscle.triceps", message: "Triceps" });
    case "quads": return t({ id: "app.tools.cableFinder.muscle.quads", message: "Quads" });
    case "hamstrings": return t({ id: "app.tools.cableFinder.muscle.hamstrings", message: "Hamstrings" });
    case "glutes": return t({ id: "app.tools.cableFinder.muscle.glutes", message: "Glutes" });
    case "calves": return t({ id: "app.tools.cableFinder.muscle.calves", message: "Calves" });
    case "core": return t({ id: "app.tools.cableFinder.muscle.core", message: "Core" });
    case "forearms": return t({ id: "app.tools.cableFinder.muscle.forearms", message: "Forearms" });
    case "traps": return t({ id: "app.tools.cableFinder.muscle.traps", message: "Traps" });
    case "lats": return t({ id: "app.tools.cableFinder.muscle.lats", message: "Lats" });
    case "full_body": return t({ id: "app.tools.cableFinder.muscle.fullBody", message: "Full Body" });
  }
}

type Section = {
  title: string;
  count: number;
  data: CableExercise[];
};

function buildSections(exercises: CableExercise[]): Section[] {
  const groups = new Map<MuscleGroup, CableExercise[]>();
  for (const ex of exercises) {
    // primary_muscles is an array; group by first muscle
    const muscle = ex.primary_muscles[0] ?? ("other" as MuscleGroup);
    const list = groups.get(muscle);
    if (list) {
      list.push(ex);
    } else {
      groups.set(muscle, [ex]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => muscleLabel(a).localeCompare(muscleLabel(b)))
    .map(([muscle, data]) => ({
      title: muscleLabel(muscle),
      count: data.length,
      data,
    }));
}

export default function CableSetupFinder() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();

  const [mountFilter, setMountFilter] = useState<MountPosition | null>(null);
  const [attachmentFilter, setAttachmentFilter] = useState<Attachment | null>(null);
  const [exercises, setExercises] = useState<CableExercise[]>([]);
  const [availableAttachments, setAvailableAttachments] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load available attachments once
  useEffect(() => {
    getAvailableAttachments().then(setAvailableAttachments);
  }, []);

  // Load exercises when filters change
  useEffect(() => {
    const filters: CableFinderFilters = {
      mountPosition: mountFilter,
      attachment: attachmentFilter,
    };
    getCableExercises(filters).then((results) => {
      setExercises(results);
      setLoaded(true);
    });
  }, [mountFilter, attachmentFilter]);

  const sections = useMemo(() => buildSections(exercises), [exercises]);

  const toggleMount = useCallback(
    (pos: MountPosition) => {
      setMountFilter((prev) => (prev === pos ? null : pos));
    },
    []
  );

  const toggleAttachment = useCallback(
    (att: Attachment) => {
      setAttachmentFilter((prev) => (prev === att ? null : att));
    },
    []
  );

  const handleExercisePress = useCallback(
    (id: string) => {
      router.push(`/exercise/${id}`);
    },
    [router]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View
        style={[styles.sectionHeader, { backgroundColor: colors.background }]}
        accessibilityRole="header"
      >
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          {section.title}
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          {t({ id: "app.tools.cableFinder.exerciseCount", message: plural(section.count, { one: "# exercise", other: "# exercises" }) })}
        </Text>
      </View>
    ),
    [colors]
  );

  const renderItem = useCallback(
    ({ item }: { item: CableExercise }) => (
      <Pressable
        style={[styles.exerciseRow, { borderBottomColor: colors.outline }]}
        onPress={() => handleExercisePress(item.id)}
        accessibilityRole="button"
         accessibilityLabel={i18n._({ id: "app.tools.cableFinder.exerciseA11y-localized", message: "{name}, {muscles}", values: { name: item.name, muscles: item.primary_muscles.map(muscleLabel).join(", ") } })}
         accessibilityHint={t({ id: "app.tools.cableFinder.openDetails", message: "Opens exercise details" })}
      >
        <View style={styles.exerciseInfo}>
          <Text variant="body" style={{ color: colors.onSurface }}>
            {item.name}
          </Text>
          {(item.mount_position || item.attachment) && (
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {[
                item.mount_position
                ? MOUNT_POSITION_LABELS[item.mount_position]
                  : null,
                item.attachment
                  ? ATTACHMENT_LABELS[item.attachment]
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
        </View>
      </Pressable>
    ),
    [colors, handleExercisePress]
  );

  const keyExtractor = useCallback((item: CableExercise) => item.id, []);

  const listHeader = useMemo(
    () => (
      <View style={styles.filtersContainer}>
        {/* Mount Position */}
        <View>
          <Text
            variant="caption"
            style={[styles.filterLabel, { color: colors.onSurfaceVariant }]}
          >
            {t({ id: "app.tools.cableFinder.mountPosition", message: "Mount Position" })}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {MOUNT_POSITION_VALUES.map((pos) => (
              <Chip
                key={pos}
                selected={mountFilter === pos}
                onPress={() => toggleMount(pos)}
                accessibilityRole="checkbox"
                accessibilityState={{ selected: mountFilter === pos }}
                    accessibilityLabel={i18n._({ id: "app.tools.cableFinder.mountPositionA11yValueLocalized", message: "Mount position: {position}", values: { position: MOUNT_POSITION_LABELS[pos] } })}
              >
                {MOUNT_POSITION_LABELS[pos]}
              </Chip>
            ))}
          </ScrollView>
        </View>

        {/* Attachment — only show types that exist */}
        {availableAttachments.length > 0 && (
          <View>
            <Text
              variant="caption"
              style={[styles.filterLabel, { color: colors.onSurfaceVariant }]}
            >
              {t({ id: "app.tools.cableFinder.attachment", message: "Attachment" })}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {availableAttachments.map((att) => (
                <Chip
                  key={att}
                  selected={attachmentFilter === att}
                  onPress={() => toggleAttachment(att)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: attachmentFilter === att }}
                    accessibilityLabel={i18n._({ id: "app.tools.cableFinder.attachmentA11yValue", message: "Attachment: {attachment}", values: { attachment: ATTACHMENT_LABELS[att] } })}
                >
                  {ATTACHMENT_LABELS[att]}
                </Chip>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    ),
    [
      mountFilter,
      attachmentFilter,
      availableAttachments,
      colors,
      toggleMount,
      toggleAttachment,
    ]
  );

  const emptyComponent = useMemo(
    () =>
      loaded ? (
        <View style={styles.emptyContainer}>
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
          >
             {t({ id: "app.tools.cableFinder.empty", message: "No exercises match this setup.\nTry a different mount position or attachment." })}
          </Text>
        </View>
      ) : null,
    [loaded, colors]
  );

  return (
    <>
      <Stack.Screen options={{ title: t({ id: "app.tools.cableFinder.title", message: "Cable Setup Finder" }) }} />
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        stickySectionHeadersEnabled={false}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: layout.horizontalPadding,
          paddingBottom: 40,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  filtersContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  filterLabel: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  exerciseRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exerciseInfo: {
    gap: 2,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: "center",
  },
});
