import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import {
  addFoodEntry,
  addDailyLog,
  deleteDailyLog,
  getFavoriteFoods,
  findDuplicateFoodEntry,
} from "../lib/db";
import { searchFoods } from "../lib/foods";
import {
  fetchWithTimeout,
  lookupBarcodeWithTimeout,
  type ParsedFood,
  type BarcodeResult,
} from "../lib/openfoodfacts";
import type { FoodEntry, Meal, BuiltinFood } from "../lib/types";
import { MEALS, MEAL_LABELS } from "../lib/types";
import BarcodeScanner from "./BarcodeScanner";
import { radii } from "../constants/design-tokens";

// Unified result type for combined local + online search
type SearchResult =
  | { type: "local"; food: BuiltinFood }
  | { type: "online"; food: ParsedFood };

type Props = {
  dateKey: string;
  onFoodLogged: () => void;
  onSnack: (message: string, undoFn?: () => Promise<void>) => void;
};

export default function InlineFoodSearch({ dateKey, onFoodLogged, onSnack }: Props) {
  const theme = useTheme();

  // Search state
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<Meal>("snack");
  const [favorites, setFavorites] = useState<FoodEntry[]>([]);
  const [localResults, setLocalResults] = useState<BuiltinFood[]>([]);
  const [onlineResults, setOnlineResults] = useState<ParsedFood[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Barcode scanner
  const [scannerVisible, setScannerVisible] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [scannedProductName, setScannedProductName] = useState<string | null>(null);

  // Manual entry bottom sheet
  const manualSheetRef = useRef<BottomSheet>(null);
  const [manualName, setManualName] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualServing, setManualServing] = useState("1 serving");
  const [manualFavorite, setManualFavorite] = useState(false);

  // Refs for cleanup
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeAbortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, ParsedFood[]>>(new Map());

  // Load favorites on mount
  useEffect(() => {
    getFavoriteFoods().then(setFavorites).catch(() => {});
  }, []);

  // Local search (synchronous, immediate)
  useEffect(() => {
    if (!query.trim()) {
      setLocalResults([]);
      return;
    }
    setLocalResults(searchFoods(query));
  }, [query]);

  // Online search (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    setOnlineError(null);

    if (!query.trim() || query.trim().length < 2) {
      setOnlineResults([]);
      return;
    }

    const cached = cacheRef.current.get(query.trim().toLowerCase());
    if (cached) {
      setOnlineResults(cached);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setOnlineLoading(true);

      fetchWithTimeout(query.trim(), controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setOnlineLoading(false);
        if (result.ok) {
          setOnlineResults(result.foods);
          const cache = cacheRef.current;
          const key = query.trim().toLowerCase();
          cache.set(key, result.foods);
          if (cache.size > 10) {
            const first = cache.keys().next().value;
            if (first !== undefined) cache.delete(first);
          }
        } else {
          setOnlineResults([]);
          if (result.error === "timeout") {
            setOnlineError("Search timed out. Try again.");
          } else {
            setOnlineError("Could not reach food database.");
          }
        }
      });
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
    };
  }, []);

  const combinedResults: SearchResult[] = useMemo(() => {
    const items: SearchResult[] = [];
    localResults.forEach((food) => items.push({ type: "local", food }));
    onlineResults.forEach((food) => items.push({ type: "online", food }));
    return items;
  }, [localResults, onlineResults]);

  const logLocalFood = useCallback(async (food: BuiltinFood) => {
    setSaving(true);
    try {
      const entry = await addFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.serving,
        false,
      );
      const log = await addDailyLog(entry.id, dateKey, meal, 1);
      onFoodLogged();
      onSnack(`${food.name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to log food. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack]);

  const logOnlineFood = useCallback(async (food: ParsedFood) => {
    setSaving(true);
    try {
      const existing = await findDuplicateFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
      );
      const entry = existing ?? await addFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.servingLabel,
        false,
      );
      const log = await addDailyLog(entry.id, dateKey, meal, 1);
      onFoodLogged();
      onSnack(`${food.name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to log food. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack]);

  const logFavorite = useCallback(async (food: FoodEntry) => {
    setSaving(true);
    try {
      const log = await addDailyLog(food.id, dateKey, meal, 1);
      onFoodLogged();
      onSnack(`${food.name} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to log food. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dateKey, meal, onFoodLogged, onSnack]);

  // Barcode handling
  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    setScannerVisible(false);
    setBarcodeError(null);
    setBarcodeLoading(true);
    setScannedProductName(null);

    if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
    const controller = new AbortController();
    barcodeAbortRef.current = controller;

    const result: BarcodeResult = await lookupBarcodeWithTimeout(barcode, controller.signal);
    if (controller.signal.aborted) return;
    setBarcodeLoading(false);

    if (!result.ok) {
      setBarcodeError(
        result.error === "timeout"
          ? "Lookup timed out. Please try again."
          : "Could not look up barcode. Check your connection."
      );
      return;
    }
    if (result.status === "not_found") {
      setBarcodeError("Product not found. Try searching by name.");
      return;
    }
    if (result.status === "incomplete") {
      setBarcodeError("Product found but nutrition data is incomplete.");
      return;
    }

    setScannedProductName(result.food.name);
    setOnlineResults([result.food]);
    setLocalResults([]);
    setQuery("");
  }, []);

  const openScanner = () => {
    Keyboard.dismiss();
    setBarcodeError(null);
    setScannerVisible(true);
  };

  // Manual entry
  const openManualEntry = () => {
    Keyboard.dismiss();
    manualSheetRef.current?.expand();
  };

  const resetManualForm = () => {
    setManualName("");
    setManualCalories("");
    setManualProtein("");
    setManualCarbs("");
    setManualFat("");
    setManualServing("1 serving");
    setManualFavorite(false);
  };

  const saveManualEntry = async () => {
    if (!manualName.trim()) return;
    setSaving(true);
    try {
      const entry = await addFoodEntry(
        manualName.trim(),
        Math.max(0, parseFloat(manualCalories) || 0),
        Math.max(0, parseFloat(manualProtein) || 0),
        Math.max(0, parseFloat(manualCarbs) || 0),
        Math.max(0, parseFloat(manualFat) || 0),
        manualServing.trim() || "1 serving",
        manualFavorite,
      );
      const log = await addDailyLog(entry.id, dateKey, meal, 1);
      const foodName = manualName.trim();
      resetManualForm();
      manualSheetRef.current?.close();
      onFoodLogged();
      getFavoriteFoods().then(setFavorites).catch(() => {});
      onSnack(`${foodName} logged`, async () => {
        await deleteDailyLog(log.id);
        onFoodLogged();
      });
    } catch {
      onSnack("Failed to save entry. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  const renderItem = useCallback(({ item }: { item: SearchResult }) => {
    if (item.type === "local") {
      const food = item.food;
      return (
        <Pressable
          style={[styles.resultItem, { backgroundColor: theme.colors.surfaceVariant }]}
          onPress={() => logLocalFood(food)}
          disabled={saving}
          accessibilityLabel={`Log ${food.name}, ${food.calories} calories`}
          accessibilityRole="button"
        >
          <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
            {food.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {food.calories} cal · {food.protein}p · {food.carbs}c · {food.fat}f
          </Text>
        </Pressable>
      );
    }

    const food = item.food;
    return (
      <Pressable
        style={[styles.resultItem, { backgroundColor: theme.colors.surfaceVariant }]}
        onPress={() => logOnlineFood(food)}
        disabled={saving}
        accessibilityLabel={`Log ${food.name}, ${food.calories} calories`}
        accessibilityRole="button"
      >
        <Text variant="bodyMedium" numberOfLines={2} style={{ color: theme.colors.onSurface }}>
          {food.name}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {food.calories} cal · {food.protein}p · {food.carbs}c · {food.fat}f · per {food.servingLabel}
        </Text>
      </Pressable>
    );
  }, [theme, saving, logLocalFood, logOnlineFood]);

  const keyExtractor = useCallback(
    (item: SearchResult, index: number) =>
      item.type === "local"
        ? `local-${item.food.id}`
        : `online-${item.food.name}-${item.food.calories}-${index}`,
    [],
  );

  const showSeparator = localResults.length > 0 && onlineResults.length > 0;
  const separatorIndex = localResults.length;

  // Wrap renderItem with separator between local and online results.
  // Uses View (not Fragment) because FlashList requires a single View-based root.
  const renderItemWithSeparator = useCallback(({ item, index }: { item: SearchResult; index: number }) => {
    if (showSeparator && index === separatorIndex) {
      return (
        <View>
          <Text
            variant="labelSmall"
            style={[styles.separator, { color: theme.colors.onSurfaceVariant }]}
          >
            Online Results
          </Text>
          {renderItem({ item })}
        </View>
      );
    }
    return renderItem({ item });
  }, [renderItem, showSeparator, separatorIndex, theme]);

  const hasResults = combinedResults.length > 0;
  const showEmptyMessage = query.trim().length >= 2 && !hasResults && !onlineLoading && !onlineError;

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Card.Content style={styles.content}>
        {/* Meal selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mealRow}>
          {MEALS.map((m) => (
            <Chip
              key={m}
              selected={meal === m}
              onPress={() => setMeal(m)}
              style={styles.mealChip}
              accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
              accessibilityRole="button"
              accessibilityState={{ selected: meal === m }}
            >
              {MEAL_LABELS[m]}
            </Chip>
          ))}
        </ScrollView>

        {/* Favorites row */}
        {favorites.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.favRow}
            contentContainerStyle={styles.favRowContent}
          >
            {favorites.map((f) => (
              <Chip
                key={f.id}
                icon="heart"
                onPress={() => logFavorite(f)}
                style={styles.favChip}
                disabled={saving}
                accessibilityLabel={`Quick log ${f.name}`}
                accessibilityRole="button"
              >
                {f.name}
              </Chip>
            ))}
          </ScrollView>
        ) : (
          <Text
            variant="bodySmall"
            style={[styles.favHint, { color: theme.colors.onSurfaceVariant }]}
          >
            ★ Star foods to add them here
          </Text>
        )}

        {/* Search input */}
        <TextInput
          mode="outlined"
          placeholder="Search foods..."
          value={query}
          onChangeText={setQuery}
          left={<TextInput.Icon icon="magnify" />}
          right={
            Platform.OS !== "web" ? (
              <TextInput.Icon icon="barcode-scan" onPress={openScanner} />
            ) : undefined
          }
          style={styles.searchInput}
          accessibilityLabel="Search foods"
        />

        {/* Barcode loading/error */}
        {barcodeLoading && (
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" style={{ marginRight: 8 }} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Looking up barcode...
            </Text>
          </View>
        )}
        {barcodeError && (
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <Text variant="bodySmall" style={{ color: theme.colors.error, flex: 1 }}>
              {barcodeError}
            </Text>
            <Button
              mode="text"
              compact
              onPress={() => { setBarcodeError(null); setScannerVisible(true); }}
              accessibilityLabel="Retry barcode scan"
            >
              Retry
            </Button>
          </View>
        )}
        {scannedProductName && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
            accessibilityLiveRegion="polite"
          >
            Found: {scannedProductName}
          </Text>
        )}

        {/* Action buttons row */}
        <View style={styles.actionRow}>
          <Button
            mode="outlined"
            icon="pencil"
            onPress={openManualEntry}
            compact
            style={styles.actionBtn}
            accessibilityLabel="Manual entry"
          >
            Manual Entry
          </Button>
        </View>

        {/* Search results */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.resultsList}
        >
          {onlineLoading && (
            <ActivityIndicator
              size="small"
              style={{ marginVertical: 8 }}
              accessibilityLabel="Searching online..."
            />
          )}
          {onlineError && (
            <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 4 }}>
              {onlineError}
            </Text>
          )}
          {showEmptyMessage && (
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 8 }}
            >
              No foods found. Try different terms or use Manual Entry.
            </Text>
          )}
          {hasResults && (
            <FlashList
              data={combinedResults}
              renderItem={renderItemWithSeparator}
              keyExtractor={keyExtractor}
              style={{ maxHeight: 300 }}
            />
          )}
        </KeyboardAvoidingView>
      </Card.Content>

      {/* Barcode scanner modal */}
      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => {
          setScannerVisible(false);
          if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Manual entry bottom sheet */}
      <BottomSheet
        ref={manualSheetRef}
        index={-1}
        snapPoints={["70%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={resetManualForm}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.onSurfaceVariant }}
      >
        <BottomSheetView
          style={styles.sheetContent}
          accessibilityViewIsModal
        >
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Manual Food Entry
          </Text>
          <TextInput
            label="Food name"
            value={manualName}
            onChangeText={setManualName}
            mode="outlined"
            style={styles.sheetInput}
          />
          <TextInput
            label="Calories"
            value={manualCalories}
            onChangeText={setManualCalories}
            keyboardType="numeric"
            mode="outlined"
            style={styles.sheetInput}
          />
          <View style={styles.macroRow}>
            <TextInput
              label="Protein (g)"
              value={manualProtein}
              onChangeText={setManualProtein}
              keyboardType="numeric"
              mode="outlined"
              style={[styles.sheetInput, styles.flex]}
            />
            <View style={{ width: 8 }} />
            <TextInput
              label="Carbs (g)"
              value={manualCarbs}
              onChangeText={setManualCarbs}
              keyboardType="numeric"
              mode="outlined"
              style={[styles.sheetInput, styles.flex]}
            />
            <View style={{ width: 8 }} />
            <TextInput
              label="Fat (g)"
              value={manualFat}
              onChangeText={setManualFat}
              keyboardType="numeric"
              mode="outlined"
              style={[styles.sheetInput, styles.flex]}
            />
          </View>
          <TextInput
            label="Serving size"
            value={manualServing}
            onChangeText={setManualServing}
            mode="outlined"
            style={styles.sheetInput}
          />
          <Chip
            selected={manualFavorite}
            onPress={() => setManualFavorite(!manualFavorite)}
            icon={manualFavorite ? "heart" : "heart-outline"}
            style={styles.sheetFavChip}
            accessibilityLabel={manualFavorite ? "Remove from favorites" : "Save as favorite"}
            accessibilityRole="button"
            accessibilityState={{ selected: manualFavorite }}
          >
            Save as favorite
          </Chip>
          <Button
            mode="contained"
            onPress={saveManualEntry}
            loading={saving}
            disabled={saving || !manualName.trim()}
            contentStyle={styles.sheetBtnContent}
            accessibilityLabel="Log food"
          >
            Log Food
          </Button>
        </BottomSheetView>
      </BottomSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: radii.md,
  },
  content: {
    paddingVertical: 12,
  },
  mealRow: {
    marginBottom: 8,
  },
  mealChip: {
    marginRight: 6,
  },
  favRow: {
    marginBottom: 8,
  },
  favRowContent: {
    gap: 6,
  },
  favChip: {
    marginRight: 0,
  },
  favHint: {
    marginBottom: 8,
    fontStyle: "italic",
  },
  searchInput: {
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 8,
  },
  actionBtn: {
    flex: 0,
  },
  resultsList: {
    minHeight: 0,
  },
  resultItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    marginBottom: 4,
  },
  separator: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontWeight: "600",
  },
  // Bottom sheet styles
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sheetInput: {
    marginBottom: 12,
  },
  macroRow: {
    flexDirection: "row",
  },
  flex: {
    flex: 1,
  },
  sheetFavChip: {
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  sheetBtnContent: {
    paddingVertical: 8,
  },
});
