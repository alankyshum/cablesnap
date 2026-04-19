import React, { useCallback, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Meal } from "../lib/types";
import BarcodeScanner from "./BarcodeScanner";
import ManualFoodEntry from "./ManualFoodEntry";
import FoodResultItem from "./FoodResultItem";
import { MealFavoritesBar } from "./nutrition/MealFavoritesBar";
import { BarcodeStatus, SearchResultsArea } from "./nutrition/FoodSearchUI";
import { ScanBarcode } from "lucide-react-native";
import { radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useFoodLogger } from "@/hooks/useFoodLogger";
import { useFoodSearch, type SearchResult } from "@/hooks/useFoodSearch";

type Props = { dateKey: string; onFoodLogged: () => void; onSnack: (message: string, undoFn?: () => Promise<void>) => void; scanOnMount?: boolean };

// eslint-disable-next-line complexity
export default function InlineFoodSearch({ dateKey, onFoodLogged, onSnack, scanOnMount }: Props) {
  const colors = useThemeColors();
  const [meal, setMeal] = useState<Meal>("snack");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState("1");
  const [saveFav, setSaveFav] = useState(false);
  const {
    query, setQuery, favorites, setFavorites, localResults, onlineResults,
    onlineLoading, onlineError, combinedResults, scannerVisible,
    barcodeLoading, barcodeError, scannedProductName,
    handleBarcodeScanned, openScanner, closeScanner, retrySearch,
  } = useFoodSearch(scanOnMount);
  const clearExpand = useCallback(() => setExpandedKey(null), []);
  const { saving, logLocalFood, logOnlineFood, logFavorite, logManualFood } = useFoodLogger({ dateKey, meal, onFoodLogged, onSnack, onAfterLog: clearExpand });
  const mult = Math.max(0, parseFloat(multiplier) || 0);
  const validMult = mult >= 0.25;
  const hasBarcodeStatus = barcodeLoading || barcodeError != null || scannedProductName != null;
  const expandResult = useCallback((key: string) => {
    setExpandedKey((prev) => { if (prev === key) return null; setMultiplier("1"); setSaveFav(false); return key; });
  }, []);
  const showSep = localResults.length > 0 && onlineResults.length > 0;
  const sepIdx = localResults.length;
  const renderItem = useCallback(({ item, index }: { item: SearchResult; index: number }) => {
    const el = <FoodResultItem item={item} index={index} expandedKey={expandedKey} multiplier={multiplier} mult={mult} validMult={validMult} saveFav={saveFav} saving={saving} onExpand={expandResult} onSetMultiplier={setMultiplier} onToggleFav={() => setSaveFav((p) => !p)} onLogLocal={(f) => logLocalFood(f, mult, saveFav)} onLogOnline={(f) => logOnlineFood(f, mult, saveFav)} />;
    if (showSep && index === sepIdx) return <View><Text variant="caption" style={[styles.separator, { color: colors.onSurfaceVariant }]}>Online Results</Text>{el}</View>;
    return el;
  }, [expandedKey, multiplier, mult, validMult, saveFav, saving, expandResult, logLocalFood, logOnlineFood, showSep, sepIdx, colors]);
  const hasResults = combinedResults.length > 0;
  const showEmptyMessage = query.trim().length >= 2 && !hasResults && !onlineLoading && !onlineError;
  const barcodeBtn = Platform.OS !== "web" ? <Pressable onPress={() => { Keyboard.dismiss(); openScanner(); }} accessibilityLabel="Scan barcode" style={{ padding: 4 }}><ScanBarcode size={20} color={colors.onSurfaceVariant} /></Pressable> : undefined;

  return (
    <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
      <CardContent style={styles.content}>
        <MealFavoritesBar meal={meal} onMealChange={setMeal} favorites={favorites} saving={saving} onLogFavorite={logFavorite} />
        <Input variant="outline" placeholder="Search foods..." value={query} onChangeText={setQuery} containerStyle={styles.searchInput} accessibilityLabel="Search foods" rightComponent={barcodeBtn} />
        {hasBarcodeStatus && <BarcodeStatus loading={barcodeLoading} error={barcodeError} productName={scannedProductName} onRetry={openScanner} />}
        <View style={styles.actionRow}><ManualFoodEntry saving={saving} onSave={logManualFood} onFavoritesChanged={setFavorites} /></View>
        <SearchResultsArea onlineLoading={onlineLoading} onlineError={onlineError} showEmptyMessage={showEmptyMessage} hasResults={hasResults} combinedResults={combinedResults} renderItemWithSeparator={renderItem} retrySearch={retrySearch} />
      </CardContent>
      <BarcodeScanner visible={scannerVisible} onClose={closeScanner} onBarcodeScanned={handleBarcodeScanned} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 8, borderRadius: radii.md },
  content: { paddingVertical: 12 },
  searchInput: { marginBottom: 8 },
  actionRow: { flexDirection: "row", marginBottom: 8, gap: 8 },
  separator: { paddingVertical: 6, paddingHorizontal: 4, fontWeight: "600" },
});
