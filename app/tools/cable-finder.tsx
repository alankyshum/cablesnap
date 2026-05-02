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
import type { MountPosition, Attachment, MuscleGroup } from "@/lib/types";
import {
  MOUNT_POSITION_LABELS,
  ATTACHMENT_LABELS,
  MUSCLE_LABELS,
} from "@/lib/types";
import { MOUNT_POSITION_VALUES } from "@/lib/cable-variant";
import {
  getCableExercises,
  getAvailableAttachments,
  type CableFinderFilters,
  type CableExercise,
} from "@/lib/db/cable-finder";

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
    .sort(([a], [b]) => (MUSCLE_LABELS[a] ?? a).localeCompare(MUSCLE_LABELS[b] ?? b))
    .map(([muscle, data]) => ({
      title: MUSCLE_LABELS[muscle] ?? muscle,
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
          {section.count} {section.count === 1 ? "exercise" : "exercises"}
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
        accessibilityLabel={`${item.name}, ${item.primary_muscles.map((m) => MUSCLE_LABELS[m]).join(", ")}`}
        accessibilityHint="Opens exercise details"
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
            Mount Position
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
                accessibilityLabel={`Mount position: ${MOUNT_POSITION_LABELS[pos]}`}
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
              Attachment
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
                  accessibilityLabel={`Attachment: ${ATTACHMENT_LABELS[att]}`}
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
            No exercises match this setup.{"\n"}Try a different mount position
            or attachment.
          </Text>
        </View>
      ) : null,
    [loaded, colors]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Cable Setup Finder" }} />
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
