import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  Searchbar,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../lib/layout";
import { getTemplates } from "../../lib/db";
import { addProgramDay, getProgramDayCount } from "../../lib/programs";
import type { WorkoutTemplate } from "../../lib/types";

const ITEM_HEIGHT = 64;

export default function PickTemplate() {
  const theme = useTheme();
  const layout = useLayout();
  const router = useRouter();
  const { programId } = useLocalSearchParams<{ programId: string }>();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, query]);

  const pick = useCallback(
    async (tpl: WorkoutTemplate) => {
      if (programId) {
        const count = await getProgramDayCount(programId);
        await addProgramDay(programId, tpl.id, count);
        router.back();
      } else {
        router.back();
      }
    },
    [programId, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: WorkoutTemplate }) => (
      <TouchableRipple
        onPress={() => pick(item)}
        style={[
          styles.item,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
        accessibilityLabel={`Select template: ${item.name}`}
        accessibilityRole="button"
      >
        <View>
          <Text
            variant="titleSmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface }}
          >
            {item.name}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Created {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      </TouchableRipple>
    ),
    [theme, pick]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Pick Template" }} />
      <View
        style={[styles.container, { backgroundColor: theme.colors.background, paddingHorizontal: layout.horizontalPadding }]}
      >
        <Searchbar
          placeholder="Search templates..."
          value={query}
          onChangeText={setQuery}
          style={[styles.search, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel="Search templates"
        />
        <FlashList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.empty}>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {templates.length === 0
                    ? "No templates yet. Create one first."
                    : "No matching templates"}
                </Text>
              </View>
            )
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  search: {
    margin: 12,
    marginBottom: 4,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: ITEM_HEIGHT,
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptyList: {
    flexGrow: 1,
  },
});
