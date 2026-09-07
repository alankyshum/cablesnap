import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import React from "react";
import { StyleSheet, View, FlatList } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { SearchResult } from "@/hooks/useFoodSearch";

const keyExtractor = (item: SearchResult, index: number) =>
  item.type === "local"
    ? `local-${item.food.id}`
    : `online-${item.food.name}-${item.food.calories}-${index}`;

export function BarcodeStatus({ loading, error, productName, onRetry }: {
  loading: boolean; error: string | null; productName: string | null; onRetry: () => void;
}) {
  const colors = useThemeColors();
  return (
    <>
      {loading && (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <View style={{ marginRight: 8 }}><Spinner size="sm" /></View>
           <Text variant="caption" style={{ color: colors.onSurfaceVariant }}><Trans id="components.nutrition.search.barcodeLoading">Looking up barcode...</Trans></Text>
        </View>
      )}
      {error && (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <Text variant="caption" style={{ color: colors.error, flex: 1 }}>{error}</Text>
           <Button variant="ghost" onPress={onRetry} accessibilityLabel={t({ id: "components.nutrition.search.retryBarcodeA11y", message: "Retry barcode scan" })}><Trans id="components.nutrition.search.retry">Retry</Trans></Button>
        </View>
      )}
      {productName && (
         <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }} accessibilityLiveRegion="polite" accessibilityLabel={t({ id: "components.nutrition.search.foundA11y", message: `Found: ${productName}` })}>
           <Trans id="components.nutrition.search.found">Found: {productName}</Trans>
        </Text>
      )}
    </>
  );
}

export function SearchResultsArea({ onlineLoading, onlineError, showEmptyMessage, hasResults, combinedResults, renderItemWithSeparator, retrySearch }: {
  onlineLoading: boolean; onlineError: string | null; showEmptyMessage: boolean; hasResults: boolean;
  combinedResults: SearchResult[]; renderItemWithSeparator: (info: { item: SearchResult; index: number }) => React.ReactElement; retrySearch: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.resultsList}>
      {onlineLoading && (
         <View style={{ marginVertical: 8 }} accessibilityLabel={t({ id: "components.nutrition.search.onlineA11y", message: "Searching online..." })}><Spinner size="sm" /></View>
      )}
      {onlineError && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text variant="caption" style={{ color: colors.error, flex: 1 }}>{onlineError}</Text>
           <Button variant="ghost" onPress={retrySearch} accessibilityLabel={t({ id: "components.nutrition.search.retrySearchA11y", message: "Retry search" })}><Trans id="components.nutrition.search.retrySearch">Retry</Trans></Button>
        </View>
      )}
      {showEmptyMessage && (
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 8 }}>
           <Trans id="components.nutrition.search.empty">No foods found. Try different terms or use Manual Entry.</Trans>
        </Text>
      )}
      {hasResults && (
        <FlatList
          data={combinedResults}
          renderItem={renderItemWithSeparator}
          keyExtractor={keyExtractor}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  resultsList: { minHeight: 0 },
});
