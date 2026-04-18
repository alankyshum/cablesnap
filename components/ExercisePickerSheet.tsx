import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SearchBar } from "@/components/ui/searchbar";
import { X } from "lucide-react-native";
import { getAllExercises } from "../lib/db";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Exercise,
} from "../lib/types";
import { duration as durationTokens, elevation } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import ExerciseItem, { ITEM_HEIGHT } from "./exercise-picker/ExerciseItem";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onPick: (exercise: Exercise) => void;
};

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

export default function ExercisePickerSheet({ visible, onDismiss, onPick }: Props) {
  const colors = useThemeColors();
  const { height: SCREEN_H } = useWindowDimensions();
  const SNAP_MID = SCREEN_H * 0.45;
  const SNAP_TOP = SCREEN_H * 0.06;
  const DISMISS_THRESHOLD = SCREEN_H * 0.75;

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<Category>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const translateY = useSharedValue(SCREEN_H);
  const backdropOpacity = useSharedValue(0);
  const context = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setQuery("");
      setSelected(new Set());
      setLoading(true);
      getAllExercises()
        .then(setExercises)
        .finally(() => setLoading(false));

      translateY.value = withSpring(SNAP_MID, SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, { duration: durationTokens.normal });
    } else if (mounted) {
      translateY.value = withTiming(SCREEN_H, { duration: durationTokens.fast });
      backdropOpacity.value = withTiming(0, { duration: durationTokens.fast }, () => {
        runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, translateY, backdropOpacity, SCREEN_H, SNAP_MID]);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(SCREEN_H, { duration: durationTokens.fast });
    backdropOpacity.value = withTiming(0, { duration: durationTokens.fast }, () => {
      runOnJS(onDismiss)();
    });
  }, [translateY, backdropOpacity, onDismiss, SCREEN_H]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = context.value + e.translationY;
      translateY.value = Math.max(SNAP_TOP, next);
    })
    .onEnd((e) => {
      const current = translateY.value;
      const velocity = e.velocityY;

      if (current > DISMISS_THRESHOLD || velocity > 800) {
        runOnJS(dismiss)();
      } else if (current < (SNAP_MID + SNAP_TOP) / 2 || velocity < -400) {
        translateY.value = withSpring(SNAP_TOP, SPRING_CONFIG);
      } else {
        translateY.value = withSpring(SNAP_MID, SPRING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.5,
  }));

  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
    const q = norm(query);
    const qNoSpace = q.replace(/ /g, "");
    return exercises.filter((ex) => {
      if (q) {
        const n = norm(ex.name);
        if (!n.includes(q) && !n.replace(/ /g, "").includes(qNoSpace)) return false;
      }
      if (selected.size > 0 && !selected.has(ex.category)) return false;
      return true;
    });
  }, [exercises, query, selected]);

  const toggle = useCallback((cat: Category) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handlePick = useCallback((exercise: Exercise) => {
    onPick(exercise);
  }, [onPick]);

  const renderItem = useCallback(
    ({ item }: { item: Exercise }) => (
      <ExerciseItem item={item} onPick={handlePick} />
    ),
    [handlePick],
  );

  if (!mounted) return null;

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={dismiss}
        accessibilityLabel="Close exercise picker"
        accessibilityRole="button"
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }, backdropStyle]}
          pointerEvents="none"
        />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, height: SCREEN_H },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View style={styles.handleZone}>
            <View style={[styles.handle, { backgroundColor: colors.onSurfaceVariant }]} />
          </Animated.View>
        </GestureDetector>

        <View style={styles.header}>
          <Text variant="subtitle" style={[styles.title, { color: colors.onBackground }]}>
            Pick Exercise
          </Text>
          <Button variant="ghost" size="icon" icon={X} onPress={dismiss} accessibilityLabel="Close exercise picker" />
        </View>

        <SearchBar
          placeholder="Search exercises..."
          value={query}
          onChangeText={setQuery}
          containerStyle={[styles.search, { backgroundColor: colors.surfaceVariant }]}
          accessibilityLabel="Search exercises"
        />

        <View style={styles.chips}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            keyExtractor={(c) => c}
            renderItem={({ item: cat }) => (
              <Chip
                selected={selected.has(cat)}
                onPress={() => toggle(cat)}
                style={styles.filterChip}
                compact
                accessibilityLabel={`Filter by ${CATEGORY_LABELS[cat]}`}
                accessibilityRole="checkbox"
                accessibilityState={{ selected: selected.has(cat) }}
              >
                {CATEGORY_LABELS[cat]}
              </Chip>
            )}
          />
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          getItemLayout={(_data, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          style={styles.list}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.empty}>
                <Text
                  variant="subtitle"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  No exercises found
                </Text>
              </View>
            )
          }
        />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    ...elevation.high,
  },
  handleZone: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  title: {
    fontWeight: "700",
  },
  search: {
    marginHorizontal: 12,
    marginBottom: 4,
  },
  chips: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filterChip: {
    marginRight: 6,
  },
  list: {
    flex: 1,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
  },
});
