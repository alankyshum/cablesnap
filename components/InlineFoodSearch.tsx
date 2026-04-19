import React, { useCallback, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Meal } from "../lib/types";
import { MEALS, MEAL_LABELS } from "../lib/types";
import BarcodeScanner from "./BarcodeScanner";
import ManualFoodEntry from "./ManualFoodEntry";
import FoodResultItem from "./FoodResultItem";
import { ScanBarcode } from "lucide-react-native";
import { radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useFoodLogger } from "@/hooks/useFoodLogger";
import { useFoodSearch, type SearchResult } from "@/hooks/useFoodSearch";

type Props = {
  dateKey: string;
  onFoodLogged: () => void;
  onSnack: (message: string, undoFn?: () => Promise<void>) => void;
  scanOnMount?: boolean;
};

const keyExtractor = (item: SearchResult, index: number) =>
  item.type === "local"
    ? `local-${item.food.id}`
    : `online-${item.food.name}-${item.food.calories}-${index}`;

function BarcodeStatus({ loading, error, productName, onRetry }: {
  loading: boolean; error: string | null; productName: string | null; onRetry: () => void;
}) {
  const colors = useThemeColors();
  return (
    <>
      {loading && (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <View style={{ marginRight: 8 }}><Spinner size="sm" /></View>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Looking up barcode...</Text>
        </View>
      )}
      {error && (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <Text variant="caption" style={{ color: colors.error, flex: 1 }}>{error}</Text>
          <Button variant="ghost" onPress={onRetry} accessibilityLabel="Retry barcode scan">Retry</Button>
        </View>
      )}
      {productName && (
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Found: ${productName}`}
        >
          Found: {productName}
        </Text>
      )}
    </>
  );
}

// eslint-disable-next-line complexity -- orchestrating search + barcode + favorites + expand UI inherently requires branching
export default function InlineFoodSearch({ dateKey, onFoodLogged, onSnack, scanOnMount }: Props) {
  const colors = useThemeColors();
  const [meal, setMeal] = useState<Meal>("snack");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [saveFav, setSaveFav] = useState(false);

  const {
    query, setQuery, favorites, setFavorites,
    localResults, onlineResults, onlineLoading, onlineError, combinedResults,
    scannerVisible, barcodeLoading, barcodeError, scannedProductName,
    handleBarcodeScanned, openScanner, closeScanner,
    retrySearch,
  } = useFoodSearch(scanOnMount);

  const clearExpand = useCallback(() => setExpandedKey(null), []);
  const { saving, logLocalFood, logOnlineFood, logFavorite, logManualFood } = useFoodLogger({
    dateKey, meal, onFoodLogged, onSnack, onAfterLog: clearExpand,
  });

  const mult = Math.max(0, parseFloat(multiplier) || 0);
  const validMult = mult >= 0.25;
  const isNative = Platform.OS !== "web";
  const hasBarcodeStatus = barcodeLoading || barcodeError != null || scannedProductName != null;

  const expandResult = useCallback((key: string) => {
    setExpandedKey((prev) => {
      if (prev === key) return null;
      setMultiplier("1");
      setSaveFav(false);
      return key;
    });
  }, []);

  const renderItem = useCallback(({ item, index }: { item: SearchResult; index: number }) => (
    <FoodResultItem
      item={item}
      index={index}
      expandedKey={expandedKey}
      multiplier={multiplier}
      mult={mult}
      validMult={validMult}
      saveFav={saveFav}
      saving={saving}
      onExpand={expandResult}
      onSetMultiplier={setMultiplier}
      onToggleFav={() => setSaveFav((p) => !p)}
      onLogLocal={(food) => logLocalFood(food, mult, saveFav)}
      onLogOnline={(food) => logOnlineFood(food, mult, saveFav)}
    />
  ), [expandedKey, multiplier, mult, validMult, saveFav, saving, expandResult, logLocalFood, logOnlineFood]);

  const showSeparator = localResults.length > 0 && onlineResults.length > 0;
  const separatorIndex = localResults.length;

  const renderItemWithSeparator = useCallback(({ item, index }: { item: SearchResult; index: number }) => {
    if (showSeparator && index === separatorIndex) {
      return (
        <View>
          <Text variant="caption" style={[styles.separator, { color: colors.onSurfaceVariant }]}>
            Online Results
          </Text>
          {renderItem({ item, index })}
        </View>
      );
    }
    return renderItem({ item, index });
  }, [renderItem, showSeparator, separatorIndex, colors]);

  const hasResults = combinedResults.length > 0;
  const hasMinQuery = query.trim().length >= 2;
  const showEmptyMessage = hasMinQuery && !hasResults && !onlineLoading && !onlineError;

  return (
    <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
      <CardContent style={styles.content}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.mealRow}
          data={MEALS}
          keyExtractor={(m) => m}
          renderItem={({ item: m }) => (
            <Chip
              key={m}
              selected={meal === m}
              onPress={() => setMeal(m)}
              style={styles.mealChip}
              accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
              role="button"
              accessibilityState={{ selected: meal === m }}
            >
              {MEAL_LABELS[m]}
            </Chip>
          )}
        />

        {favorites.length > 0 ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.favRow}
            contentContainerStyle={styles.favRowContent}
            data={favorites}
            keyExtractor={(f) => f.id}
            renderItem={({ item: f }) => (
              <Chip
                key={f.id}
                onPress={() => logFavorite(f)}
                style={styles.favChip}
                disabled={saving}
                accessibilityLabel={`Quick log ${f.name}`}
                role="button"
              >
                {f.name}
              </Chip>
            )}
          />
        ) : (
          <Text variant="caption" style={[styles.favHint, { color: colors.onSurfaceVariant }]}>
            ★ Star foods to add them here
          </Text>
        )}

        <Input
          variant="outline"
          placeholder="Search foods..."
          value={query}
          onChangeText={setQuery}
          containerStyle={styles.searchInput}
          accessibilityLabel="Search foods"
          rightComponent={
            isNative ? (
              <Pressable
                onPress={() => { Keyboard.dismiss(); openScanner(); }}
                accessibilityLabel="Scan barcode"
                style={{ padding: 4 }}
              >
                <ScanBarcode size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            ) : undefined
          }
        />

        {hasBarcodeStatus && (
          <BarcodeStatus
            loading={barcodeLoading}
            error={barcodeError}
            productName={scannedProductName}
            onRetry={openScanner}
          />
        )}

        <View style={styles.actionRow}>
          <ManualFoodEntry saving={saving} onSave={logManualFood} onFavoritesChanged={setFavorites} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.resultsList}>
          {onlineLoading && (
            <View style={{ marginVertical: 8 }} accessibilityLabel="Searching online..."><Spinner size="sm" /></View>
          )}
          {onlineError && (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Text variant="caption" style={{ color: colors.error, flex: 1 }}>{onlineError}</Text>
              <Button variant="ghost" onPress={retrySearch} accessibilityLabel="Retry search">Retry</Button>
            </View>
          )}
          {showEmptyMessage && (
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 8 }}>
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
      </CardContent>

      <BarcodeScanner visible={scannerVisible} onClose={closeScanner} onBarcodeScanned={handleBarcodeScanned} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, borderRadius: radii.md },
  content: { paddingVertical: 12 },
  mealRow: { marginBottom: 8 },
  mealChip: { marginRight: 6 },
  favRow: { marginBottom: 8 },
  favRowContent: { gap: 6 },
  favChip: { marginRight: 0 },
  favHint: { marginBottom: 8, fontStyle: "italic" },
  searchInput: { marginBottom: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  actionRow: { flexDirection: "row", marginBottom: 8, gap: 8 },
  resultsList: { minHeight: 0 },
  separator: { paddingVertical: 6, paddingHorizontal: 4, fontWeight: "600" },
});
