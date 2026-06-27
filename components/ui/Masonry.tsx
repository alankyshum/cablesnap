import { Children, isValidElement, useCallback, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { spacing } from "@/constants/design-tokens";
import { useLayout, type WindowClass } from "@/lib/layout";

/**
 * Default column count per window class. A true Pinterest-style masonry fans
 * content out into more columns as horizontal space grows so wide screens stop
 * wasting the second axis.
 *
 * - compact  (<600px)      → 1 column  (phones portrait / large phones portrait)
 * - medium   (600–1023px)  → 2 columns (large phones landscape, small tablets)
 * - expanded (≥1024px)     → 3 columns (tablets / foldables unfolded)
 */
const COLUMNS_BY_CLASS: Record<WindowClass, number> = {
  compact: 1,
  medium: 2,
  expanded: 3,
};

export type MasonryProps = {
  children: ReactNode;
  /** Gutter between columns and between cells. Default `spacing.base` (16). */
  gap?: number;
  /**
   * Hard override for the number of columns (must be >= 1). When omitted the
   * column count is derived from `useLayout()`'s window class
   * (see {@link COLUMNS_BY_CLASS}).
   */
  columnCount?: number;
  style?: ViewStyle;
  /** Forwarded to the outer container for testing/automation. */
  testID?: string;
};

type Renderable = { node: ReactNode; key: string };

/**
 * Normalize `children` into a flat, render-stable list. `Children.toArray`
 * already drops `null`/`undefined`/boolean entries and flattens fragments and
 * nested arrays (mirroring the historical `FlowContainer` behavior so callers
 * that conditionally render tiles keep working), assigning each surviving child
 * a stable key so React reconciliation and `onLayout` height tracking stay
 * correct across re-renders.
 */
function toRenderables(children: ReactNode): Renderable[] {
  return Children.toArray(children).map((child, index) => {
    const key =
      isValidElement(child) && child.key != null ? String(child.key) : `masonry-${index}`;
    return { node: child, key };
  });
}

/**
 * Distribute items into `columnCount` buckets **shortest-column-first**, in
 * source order. `heights` weights each item; ties resolve to the lowest column
 * index, which keeps the distribution deterministic (stable snapshots) and
 * preserves a natural left-to-right reading bias.
 *
 * With equal weights this degenerates to balanced round-robin
 * (item *i* → column `i % columnCount`) — the Tier-1 first-paint / headless
 * result. Once real measured heights are known (Tier 2) the same routine packs
 * by true height so varied-height tiles interlock with no dead vertical gaps.
 */
export function distributeIntoColumns<T>(
  items: T[],
  columnCount: number,
  heights: number[],
): T[][] {
  // Clamp to a finite, >=1 integer so a NaN/Infinity/negative input can never
  // produce `new Array(badLength)` → RangeError.
  const cols = Number.isFinite(columnCount) ? Math.max(1, Math.floor(columnCount)) : 1;
  const buckets: T[][] = Array.from({ length: cols }, () => []);
  const colHeights = new Array<number>(cols).fill(0);

  for (let i = 0; i < items.length; i += 1) {
    let target = 0;
    for (let c = 1; c < cols; c += 1) {
      if (colHeights[c] < colHeights[target]) target = c;
    }
    buckets[target].push(items[i]);
    // Unmeasured items weigh 1 so distribution stays balanced before layout.
    colHeights[target] += heights[i] > 0 ? heights[i] : 1;
  }

  return buckets;
}

/**
 * A real column-distributing masonry layout primitive.
 *
 * Unlike a flex `row + wrap` (which stretches every wrapped row to its tallest
 * child and leaves dead vertical space under shorter tiles), this renders N
 * independent `View` columns and packs children **shortest-column-first**, so
 * tiles of varied height interlock tightly and use the full width.
 *
 * Behavior is intentionally **headless-safe**: it renders fully on first paint
 * with a deterministic balanced distribution and never gates tile visibility on
 * a measurement pass, so it works under SSR/Playwright/jest where `onLayout`
 * does not fire. On a real device, per-cell `onLayout` heights progressively
 * refine the packing.
 *
 * A11y: children keep their source order within a column; columns are a purely
 * visual arrangement.
 */
export default function Masonry({
  children,
  gap = spacing.base,
  columnCount,
  style,
  testID,
}: MasonryProps) {
  const layout = useLayout();
  // Resolve the column count defensively: an explicit `columnCount >= 1` prop
  // wins; otherwise map the window class through COLUMNS_BY_CLASS, falling back
  // to a single column for any unrecognized class (keeps us safe against partial
  // `useLayout()` mocks and future window classes — never yields NaN/undefined).
  const resolvedColumns =
    columnCount != null && columnCount >= 1
      ? Math.floor(columnCount)
      : (COLUMNS_BY_CLASS[layout.windowClass] ?? 1);

  const items = useMemo(() => toRenderables(children), [children]);

  // Tier 2: measured cell heights keyed by stable child key. Absent until (and
  // unless) onLayout fires; on platforms where it never fires we stay on Tier 1.
  const [heights, setHeights] = useState<Record<string, number>>({});

  const onCellLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setHeights((prev) => {
      const current = prev[key];
      // Only update when the height meaningfully changes, to avoid render loops.
      if (current != null && Math.abs(current - next) < 1) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  // Single-column fast path: a plain vertical stack. No row wrapper means phone
  // layout is byte-for-byte the simple stacked case (zero responsive risk).
  if (resolvedColumns <= 1) {
    return (
      <View style={[{ gap }, style]} testID={testID}>
        {items.map((item) => (
          <View key={item.key} onLayout={(e) => onCellLayout(item.key, e)}>
            {item.node}
          </View>
        ))}
      </View>
    );
  }

  const weights = items.map((item) => heights[item.key] ?? 0);
  const columns = distributeIntoColumns(items, resolvedColumns, weights);

  return (
    <View style={[styles.row, { gap }, style]} testID={testID}>
      {columns.map((column, columnIndex) => (
        <View
          key={`col-${columnIndex}`}
          style={[styles.column, { gap }]}
          testID={testID ? `${testID}-col-${columnIndex}` : undefined}
        >
          {column.map((item) => (
            <View key={item.key} onLayout={(e) => onCellLayout(item.key, e)}>
              {item.node}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    // Critical: columns must NOT stretch to match each other's height. This is
    // exactly the flex-wrap bug we replace — each column is an independent stack.
    alignItems: "flex-start",
  },
  column: {
    flex: 1,
    flexDirection: "column",
    // Allow a column to shrink below its content's intrinsic width inside the
    // row so 2/3-column layouts divide the available width evenly.
    minWidth: 0,
  },
});
