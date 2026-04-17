import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import { useLayout } from "../../lib/layout";
import {
  addFoodEntry,
  addDailyLog,
  getFavoriteFoods,
  findDuplicateFoodEntry,
  toggleFavorite,
} from "../../lib/db";
import { searchFoods, getCategories } from "../../lib/foods";
import {
  fetchWithTimeout,
  lookupBarcodeWithTimeout,
  type ParsedFood,
  type BarcodeResult,
} from "../../lib/openfoodfacts";
import type { FoodEntry, Meal, BuiltinFood, FoodCategory } from "../../lib/types";
import { MEALS, MEAL_LABELS } from "../../lib/types";
import BarcodeScanner from "../../components/BarcodeScanner";

function DatabaseTab({ meal, saving, onSaving, dateKey }: { meal: Meal; saving: boolean; onSaving: (v: boolean) => void; dateKey: string }) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [saveFav, setSaveFav] = useState(false);
  const categories = getCategories();
  const today = dateKey;

  const results = useMemo(() => searchFoods(query, category), [query, category]);

  const mult = Math.max(0.25, parseFloat(multiplier) || 0);
  const valid = parseFloat(multiplier) >= 0.25;

  const expand = (id: string) => {
    setExpanded(expanded === id ? null : id);
    setMultiplier("1");
    setSaveFav(false);
  };

  const log = async (food: BuiltinFood) => {
    if (!valid) return;
    onSaving(true);
    try {
      const entry = await addFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.serving,
        saveFav
      );
      await addDailyLog(entry.id, today, meal, mult);
      router.back();
    } finally {
      onSaving(false);
    }
  };

  const header = () => (
    <View>
      <TextInput
        mode="outlined"
        placeholder="Search foods..."
        value={query}
        onChangeText={setQuery}
        left={<TextInput.Icon icon="magnify" />}
        style={styles.input}
        accessibilityLabel="Search foods"
      />
      <View style={styles.chips}>
        <Chip
          selected={category === null}
          onPress={() => setCategory(null)}
          style={styles.chip}
          accessibilityRole="button"
          accessibilityState={{ selected: category === null }}
        >
          All
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.id}
            selected={category === c.id}
            onPress={() => setCategory(category === c.id ? null : c.id)}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityState={{ selected: category === c.id }}
          >
            {c.label}
          </Chip>
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: BuiltinFood }) => {
    const open = expanded === item.id;
    const scaled = {
      calories: (item.calories * mult).toFixed(0),
      protein: (item.protein * mult).toFixed(1),
      carbs: (item.carbs * mult).toFixed(1),
      fat: (item.fat * mult).toFixed(1),
    };

    return (
      <Card
        style={[styles.dbCard, { backgroundColor: theme.colors.surfaceVariant }]}
        onPress={() => expand(item.id)}
        accessibilityLabel={`${item.name}, ${item.calories} calories per ${item.serving}`}
        accessibilityRole="button"
      >
        <Card.Content>
          <Text
            variant="titleSmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface }}
          >
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.calories} cal · {item.protein}p · {item.carbs}c · {item.fat}f · {item.serving}
          </Text>
          {open && (
            <View style={[styles.detail, { borderTopColor: theme.colors.outlineVariant }]}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Serving: {item.serving}
              </Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
                Multiplier
              </Text>
              <View style={styles.multChips}>
                {["0.5", "1", "1.5", "2"].map((v) => (
                  <Chip
                    key={v}
                    selected={multiplier === v}
                    onPress={() => setMultiplier(v)}
                    style={styles.chip}
                    accessibilityRole="button"
                    accessibilityState={{ selected: multiplier === v }}
                  >
                    {v}x
                  </Chip>
                ))}
              </View>
              <TextInput
                mode="outlined"
                label="Custom amount"
                value={multiplier}
                onChangeText={setMultiplier}
                keyboardType="numeric"
                dense
                style={styles.multInput}
                accessibilityLabel={`Serving multiplier: ${multiplier} times`}
              />
              {!valid && (
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 4 }}>
                  Minimum 0.25x
                </Text>
              )}
              <View
                style={styles.macros}
                accessibilityLiveRegion="polite"
              >
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {scaled.calories} cal · {scaled.protein}p · {scaled.carbs}c · {scaled.fat}f
                </Text>
              </View>
              <Chip
                selected={saveFav}
                onPress={() => setSaveFav(!saveFav)}
                icon={saveFav ? "heart" : "heart-outline"}
                style={styles.favChip}
                accessibilityLabel={saveFav ? "Remove from favorites" : "Save as favorite"}
                accessibilityRole="button"
                accessibilityState={{ selected: saveFav }}
              >
                Save as Favorite
              </Chip>
              <Button
                mode="contained"
                onPress={() => log(item)}
                loading={saving}
                disabled={saving || !valid}
                style={styles.btn}
                contentStyle={styles.btnContent}
                accessibilityLabel="Log food"
              >
                Log Food
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const empty = () => (
    <Text
      variant="bodyMedium"
      style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 24 }}
    >
      No foods found. Try a different search term.
    </Text>
  );

  return (
    <FlashList
      data={results}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      style={{ backgroundColor: theme.colors.background }}
    />
  );
}

function OnlineTab({ meal, saving, onSaving, dateKey, autoScan }: { meal: Meal; saving: boolean; onSaving: (v: boolean) => void; dateKey: string; autoScan?: boolean }) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParsedFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [saveFav, setSaveFav] = useState(false);
  const [offline, setOffline] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [scannedProductName, setScannedProductName] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeAbortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, ParsedFood[]>>(new Map());
  const today = dateKey;

  // Auto-open scanner when navigated with scan=true
  const autoScanTriggered = useRef(false);
  useEffect(() => {
    if (autoScan && !autoScanTriggered.current && Platform.OS !== "web") {
      autoScanTriggered.current = true;
      setScannerVisible(true);
    }
  }, [autoScan]);

  // Proactive offline detection on mount / tab switch
  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((state) => {
      if (mounted) setOffline(!state.isConnected);
    });
    return () => { mounted = false; };
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    setError(null);

    if (!query.trim()) {
      setResults([]);
      setHint(null);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      setHint("Type at least 2 characters");
      return;
    }

    setHint(null);

    const cached = cacheRef.current.get(query.trim().toLowerCase());
    if (cached) {
      setResults(cached);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      fetchWithTimeout(query.trim(), controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        if (result.ok) {
          setResults(result.foods);
          // Cache (limit to 10 entries)
          const cache = cacheRef.current;
          const key = query.trim().toLowerCase();
          cache.set(key, result.foods);
          if (cache.size > 10) {
            const first = cache.keys().next().value;
            if (first !== undefined) cache.delete(first);
          }
        } else {
          setResults([]);
          if (result.error === "timeout") {
            setError("Search timed out. Please try again.");
          } else if (result.error === "offline") {
            setError("Could not reach food database. Check your connection.");
          } else {
            setError("Could not reach food database. Check your connection.");
          }
        }
      });
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
    };
  }, []);

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
      if (result.error === "timeout") {
        setBarcodeError("Lookup timed out. Please try again.");
      } else if (result.error === "offline") {
        setBarcodeError("Could not look up barcode. Check your connection.");
      } else {
        setBarcodeError("Could not look up barcode. Check your connection.");
      }
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
    setResults([result.food]);
    setQuery("");
    setExpanded(null);
  }, []);

  const openScanner = () => {
    Keyboard.dismiss();
    setBarcodeError(null);
    setScannerVisible(true);
  };

  const retryBarcode = () => {
    setBarcodeError(null);
    setScannerVisible(true);
  };

  const switchToTextSearch = () => {
    setBarcodeError(null);
  };

  const mult = Math.max(0.25, parseFloat(multiplier) || 0);
  const valid = parseFloat(multiplier) >= 0.25;

  const expand = (idx: number) => {
    setExpanded(expanded === idx ? null : idx);
    setMultiplier("1");
    setSaveFav(false);
  };

  const retry = () => {
    setError(null);
    // Re-trigger search by cycling query
    const q = query;
    setQuery("");
    setTimeout(() => setQuery(q), 0);
  };

  const log = async (food: ParsedFood) => {
    if (!valid) return;
    onSaving(true);
    try {
      // Dedup: check if identical food entry already exists
      const existing = await findDuplicateFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat
      );
      const entry = existing ?? await addFoodEntry(
        food.name,
        food.calories,
        food.protein,
        food.carbs,
        food.fat,
        food.servingLabel,
        saveFav
      );
      // If dedup reused an existing entry and user wants favorite, update it
      if (existing && saveFav && !existing.is_favorite) {
        await toggleFavorite(existing.id);
      }
      await addDailyLog(entry.id, today, meal, mult);
      router.back();
    } finally {
      onSaving(false);
    }
  };

  if (offline) {
    return (
      <View style={styles.emptyContainer}>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 24 }}
          accessibilityLiveRegion="polite"
        >
          You&apos;re offline. Connect to search online foods.
        </Text>
      </View>
    );
  }

  const header = () => (
    <View>
      {Platform.OS !== "web" && (
        <Button
          mode="outlined"
          icon="barcode-scan"
          onPress={openScanner}
          style={styles.scanBtn}
          contentStyle={styles.scanBtnContent}
          accessibilityLabel="Scan food barcode"
          accessibilityRole="button"
        >
          Scan Barcode
        </Button>
      )}
      {barcodeLoading && (
        <View style={{ alignItems: "center", padding: 16 }} accessibilityLiveRegion="polite">
          <ActivityIndicator
            style={{ marginBottom: 8 }}
            accessibilityLabel="Looking up barcode..."
            accessibilityRole="progressbar"
          />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Looking up barcode...
          </Text>
        </View>
      )}
      {barcodeError && (
        <View style={{ alignItems: "center", padding: 16 }} accessibilityLiveRegion="polite">
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: "center", marginBottom: 12 }}>
            {barcodeError}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              mode="outlined"
              onPress={retryBarcode}
              accessibilityLabel="Retry barcode scan"
              accessibilityRole="button"
              contentStyle={{ minHeight: 48 }}
            >
              Retry
            </Button>
            <Button
              mode="outlined"
              onPress={switchToTextSearch}
              accessibilityLabel="Search by name instead"
              accessibilityRole="button"
              contentStyle={{ minHeight: 48 }}
            >
              Search by Name
            </Button>
          </View>
        </View>
      )}
      {scannedProductName && (
        <View accessibilityLiveRegion="polite">
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 4, marginBottom: 8 }}
            accessibilityLabel={`Found: ${scannedProductName}`}
          >
            Found: {scannedProductName}
          </Text>
        </View>
      )}
      <TextInput
        mode="outlined"
        placeholder="Search for foods online"
        value={query}
        onChangeText={setQuery}
        left={<TextInput.Icon icon="magnify" />}
        style={styles.input}
        accessibilityLabel="Search online food database"
      />
      {hint && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 4, marginBottom: 8 }}>
          {hint}
        </Text>
      )}
      {loading && (
        <ActivityIndicator
          style={{ marginVertical: 16 }}
          accessibilityLabel="Searching..."
          accessibilityRole="progressbar"
        />
      )}
      {error && (
        <View style={{ alignItems: "center", padding: 16 }} accessibilityLiveRegion="polite">
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: "center", marginBottom: 12 }}>
            {error}
          </Text>
          <Button
            mode="outlined"
            onPress={retry}
            accessibilityLabel="Retry search"
            accessibilityRole="button"
            contentStyle={{ minHeight: 48 }}
          >
            Retry
          </Button>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item, index }: { item: ParsedFood; index: number }) => {
    const open = expanded === index;
    const scaled = {
      calories: (item.calories * mult).toFixed(0),
      protein: (item.protein * mult).toFixed(1),
      carbs: (item.carbs * mult).toFixed(1),
      fat: (item.fat * mult).toFixed(1),
    };

    return (
      <Card
        style={[styles.dbCard, { backgroundColor: theme.colors.surfaceVariant }]}
        onPress={() => expand(index)}
        accessibilityLabel={`${item.name}, ${item.calories} calories per ${item.servingLabel}`}
        accessibilityRole="button"
      >
        <Card.Content>
          <Text
            variant="titleSmall"
            numberOfLines={2}
            style={{ color: theme.colors.onSurface }}
          >
            {item.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.calories} cal · {item.protein}p · {item.carbs}c · {item.fat}f · per {item.servingLabel}
          </Text>
          {open && (
            <View style={[styles.detail, { borderTopColor: theme.colors.outlineVariant }]}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Serving: {item.servingLabel}
              </Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
                Multiplier
              </Text>
              <View style={styles.multChips}>
                {["0.5", "1", "1.5", "2"].map((v) => (
                  <Chip
                    key={v}
                    selected={multiplier === v}
                    onPress={() => setMultiplier(v)}
                    style={styles.chip}
                    accessibilityRole="button"
                    accessibilityState={{ selected: multiplier === v }}
                  >
                    {v}x
                  </Chip>
                ))}
              </View>
              <TextInput
                mode="outlined"
                label="Custom amount"
                value={multiplier}
                onChangeText={setMultiplier}
                keyboardType="numeric"
                dense
                style={styles.multInput}
                accessibilityLabel={`Serving multiplier: ${multiplier} times`}
              />
              {!valid && (
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 4 }}>
                  Minimum 0.25x
                </Text>
              )}
              <View
                style={styles.macros}
                accessibilityLiveRegion="polite"
              >
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {scaled.calories} cal · {scaled.protein}p · {scaled.carbs}c · {scaled.fat}f
                </Text>
              </View>
              <Chip
                selected={saveFav}
                onPress={() => setSaveFav(!saveFav)}
                icon={saveFav ? "heart" : "heart-outline"}
                style={styles.favChip}
                accessibilityLabel={saveFav ? "Remove from favorites" : "Save as favorite"}
                accessibilityRole="button"
                accessibilityState={{ selected: saveFav }}
              >
                Save as Favorite
              </Chip>
              <Button
                mode="contained"
                onPress={() => log(item)}
                loading={saving}
                disabled={saving || !valid}
                style={styles.btn}
                contentStyle={styles.btnContent}
                accessibilityLabel="Log food"
              >
                Log Food
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const empty = () => {
    if (loading || error || !query.trim() || hint) return null;
    return (
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 24 }}
      >
        No foods found for &apos;{query.trim()}&apos;. Try different terms or use manual entry.
      </Text>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlashList
        data={results}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.name}-${item.calories}-${index}`}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        style={{ backgroundColor: theme.colors.background }}
      />
      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => {
          setScannerVisible(false);
          if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />
    </View>
  );
}

function localDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TAB_BUTTONS = [
  { value: "new", label: "New" },
  { value: "favorites", label: "Favs" },
  { value: "database", label: "Database" },
  { value: "online", label: "Online" },
];

export default function AddFood() {
  const theme = useTheme();
  const layout = useLayout();
  const params = useLocalSearchParams<{ date?: string; scan?: string }>();
  const dateKey = params.date || localDateKey();
  const [tab, setTab] = useState(params.scan === "true" ? "online" : "new");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [serving, setServing] = useState("1 serving");
  const [meal, setMeal] = useState<Meal>("snack");
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<FoodEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getFavoriteFoods().then(setFavorites);
    }, [])
  );

  const today = dateKey;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const entry = await addFoodEntry(
        name.trim(),
        Math.max(0, parseFloat(calories) || 0),
        Math.max(0, parseFloat(protein) || 0),
        Math.max(0, parseFloat(carbs) || 0),
        Math.max(0, parseFloat(fat) || 0),
        serving.trim() || "1 serving",
        favorite
      );
      await addDailyLog(entry.id, today, meal, 1);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const quickLog = async (food: FoodEntry) => {
    setSaving(true);
    try {
      await addDailyLog(food.id, today, meal, 1);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (tab === "database" || tab === "online") {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, paddingHorizontal: layout.horizontalPadding }]}>
        <View style={styles.header}>
          <SegmentedButtons
            value={tab}
            onValueChange={setTab}
            buttons={TAB_BUTTONS}
            style={styles.tabs}
            density="medium"
          />
          <View style={styles.meals}>
            {MEALS.map((m) => (
              <Chip
                key={m}
                selected={meal === m}
                onPress={() => setMeal(m)}
                style={styles.chip}
                accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
                accessibilityRole="button"
                accessibilityState={{ selected: meal === m }}
              >
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </View>
        </View>
        {tab === "database" ? (
          <DatabaseTab meal={meal} saving={saving} onSaving={setSaving} dateKey={dateKey} />
        ) : (
          <OnlineTab meal={meal} saving={saving} onSaving={setSaving} dateKey={dateKey} autoScan={params.scan === "true"} />
        )}
      </View>
    );
  }

  const renderFav = ({ item: f }: { item: FoodEntry }) => (
    <Card
      style={[styles.favCard, { backgroundColor: theme.colors.surfaceVariant }]}
      onPress={() => quickLog(f)}
      accessibilityLabel={`Quick log ${f.name}, ${f.calories} calories`}
      accessibilityRole="button"
    >
      <Card.Content>
        <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
          {f.name}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {f.calories} cal · {f.protein}p · {f.carbs}c · {f.fat}f · {f.serving_size}
        </Text>
      </Card.Content>
    </Card>
  );

  return (
    <FlashList
      data={tab === "favorites" ? favorites : []}
      keyExtractor={(f) => f.id}
      renderItem={renderFav}
      style={StyleSheet.flatten([styles.container, { backgroundColor: theme.colors.background }])}
      contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 32 }}
      ListHeaderComponent={
        <>
          <SegmentedButtons
            value={tab}
            onValueChange={setTab}
            buttons={TAB_BUTTONS}
            style={styles.tabs}
            density="medium"
          />

          <View style={styles.meals}>
            {MEALS.map((m) => (
              <Chip
                key={m}
                selected={meal === m}
                onPress={() => setMeal(m)}
                style={styles.chip}
                accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
                accessibilityRole="button"
                accessibilityState={{ selected: meal === m }}
              >
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </View>

          {tab === "new" ? (
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <TextInput
                  label="Food name"
                  value={name}
                  onChangeText={setName}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Calories"
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                  mode="outlined"
                  style={styles.input}
                />
                <View style={styles.row}>
                  <TextInput
                    label="Protein (g)"
                    value={protein}
                    onChangeText={setProtein}
                    keyboardType="numeric"
                    mode="outlined"
                    style={[styles.input, styles.flex]}
                  />
                  <View style={{ width: 8 }} />
                  <TextInput
                    label="Carbs (g)"
                    value={carbs}
                    onChangeText={setCarbs}
                    keyboardType="numeric"
                    mode="outlined"
                    style={[styles.input, styles.flex]}
                  />
                  <View style={{ width: 8 }} />
                  <TextInput
                    label="Fat (g)"
                    value={fat}
                    onChangeText={setFat}
                    keyboardType="numeric"
                    mode="outlined"
                    style={[styles.input, styles.flex]}
                  />
                </View>
                <TextInput
                  label="Serving size"
                  value={serving}
                  onChangeText={setServing}
                  mode="outlined"
                  style={styles.input}
                />
                <Chip
                  selected={favorite}
                  onPress={() => setFavorite(!favorite)}
                  icon={favorite ? "heart" : "heart-outline"}
                  style={styles.favChip}
                  accessibilityLabel={favorite ? "Remove from favorites" : "Save as favorite"}
                  accessibilityRole="button"
                  accessibilityState={{ selected: favorite }}
                >
                  Save as favorite
                </Chip>
                <Button
                  mode="contained"
                  onPress={save}
                  loading={saving}
                  disabled={saving || !name.trim()}
                  style={styles.btn}
                  contentStyle={styles.btnContent}
                  accessibilityLabel="Log food"
                >
                  Log Food
                </Button>
              </Card.Content>
            </Card>
          ) : favorites.length === 0 ? (
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 16 }}
                >
                  No favorites yet. Save foods as favorites when logging them.
                </Text>
              </Card.Content>
            </Card>
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { padding: 16, paddingBottom: 0 },
  tabs: { marginBottom: 16 },
  meals: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  chip: { marginRight: 0 },
  card: { marginBottom: 16 },
  input: { marginBottom: 12 },
  row: { flexDirection: "row" },
  flex: { flex: 1 },
  favChip: { marginBottom: 16 },
  btn: { marginTop: 8 },
  btnContent: { paddingVertical: 8 },
  favCard: { marginBottom: 8, borderRadius: 8 },
  dbCard: { marginBottom: 8, borderRadius: 8 },
  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  multChips: { flexDirection: "row", gap: 6, marginBottom: 8 },
  multInput: { marginBottom: 8 },
  macros: { marginBottom: 12, padding: 8, borderRadius: 8 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  scanBtn: { marginBottom: 12 },
  scanBtnContent: { minHeight: 48, paddingVertical: 8 },
});
