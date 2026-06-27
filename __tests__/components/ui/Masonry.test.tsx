/**
 * __tests__/components/ui/Masonry.test.tsx
 *
 * BLD-2029 (P0-1) — real masonry layout primitive.
 *
 * Acceptance criteria covered (see issue plan):
 *  #1 Column count derives from window width (375→1, 800→2, 1200→3).
 *  #2 `columnCount` prop override wins over the window-class default.
 *  #3 Distribution is shortest-column-first (Tier-1 equal weights → round-robin).
 *  #4 Source order is preserved within each column (a11y).
 *  #5 The multi-column row uses `alignItems: 'flex-start'` (no row-stretch).
 *  #6 Backwards-compat: `FlowContainer` renders all children and still exports
 *     `flowCardStyle` / `FLOW_CARD_MIN` / `FLOW_CARD_MAX`.
 *  #7 `null` / `false` children are skipped.
 *  #8 Headless-safe: renders fully without any `onLayout` event firing.
 */
import React from "react";
import { render, within } from "@testing-library/react-native";
import { Text, View } from "react-native";

// Drive useLayout() deterministically by mocking the underlying RN hook. We let
// the *real* lib/layout.useLayout run so this exercises the true width→class
// mapping (BREAKPOINTS 0/600/1024) rather than a hand-rolled stub.
let mockWidth = 375;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));

import Masonry, { distributeIntoColumns } from "@/components/ui/Masonry";
import FlowContainer, {
  flowCardStyle,
  FLOW_CARD_MIN,
  FLOW_CARD_MAX,
} from "@/components/ui/FlowContainer";

const TID = "masonry";

/** Tile helper with a stable testID so we can locate it in the tree. */
function Tile({ id }: { id: number }) {
  return (
    <View testID={`tile-${id}`}>
      <Text>{`tile ${id}`}</Text>
    </View>
  );
}

function renderTiles(count: number, props: Record<string, unknown> = {}) {
  const tiles = Array.from({ length: count }, (_, i) => <Tile key={i} id={i} />);
  return render(
    <Masonry testID={TID} {...props}>
      {tiles}
    </Masonry>,
  );
}

/** Count rendered column wrappers via their `${testID}-col-N` testIDs. */
function columnCount(queryAllByTestId: (m: RegExp) => unknown[]): number {
  return queryAllByTestId(new RegExp(`^${TID}-col-\\d+$`)).length;
}

describe("distributeIntoColumns (Tier-1, equal weights)", () => {
  it("packs shortest-column-first → round-robin across columns in source order (#3)", () => {
    const items = [0, 1, 2, 3, 4];
    const cols = distributeIntoColumns(items, 2, items.map(() => 0));
    // col0 wins ties (lowest index): 0,2,4 ; col1: 1,3
    expect(cols).toEqual([
      [0, 2, 4],
      [1, 3],
    ]);
  });

  it("preserves ascending source order within every column (#4)", () => {
    const items = [0, 1, 2, 3, 4, 5];
    const cols = distributeIntoColumns(items, 3, items.map(() => 0));
    cols.forEach((col) => {
      const sorted = [...col].sort((a, b) => a - b);
      expect(col).toEqual(sorted);
    });
  });

  it("respects measured heights: a tall first tile pushes the next item to a shorter column (#3 Tier-2)", () => {
    const items = ["a", "b", "c"];
    // 'a' measured tall (100), others unmeasured (0 → weight 1).
    const cols = distributeIntoColumns(items, 2, [100, 0, 0]);
    // a→col0 (h=100). b→col1 (shortest, h=0→1). c→col1 (1<100).
    expect(cols).toEqual([["a"], ["b", "c"]]);
  });

  it("clamps invalid column counts to at least one column", () => {
    expect(distributeIntoColumns([1, 2], 0, [0, 0])).toEqual([[1, 2]]);
  });

  it("never throws on non-finite column counts (NaN/Infinity/negative) — defends against partial layout mocks", () => {
    // Regression for BLD-2029: a `useLayout()` mock without `windowClass`
    // previously yielded `new Array(NaN)` → RangeError during render.
    expect(distributeIntoColumns([1, 2, 3], NaN, [0, 0, 0])).toEqual([[1, 2, 3]]);
    expect(distributeIntoColumns([1, 2, 3], Infinity, [0, 0, 0])).toEqual([[1, 2, 3]]);
    expect(distributeIntoColumns([1, 2, 3], -5, [0, 0, 0])).toEqual([[1, 2, 3]]);
  });
});

describe("Masonry — column count by width (#1)", () => {
  afterEach(() => {
    mockWidth = 375;
  });

  it("renders a single-column stack (no column wrappers) on a phone-portrait width (375)", () => {
    mockWidth = 375;
    const { getByTestId, queryAllByTestId } = renderTiles(4);
    // Single-column fast path: container exists, but no `-col-N` wrappers.
    expect(getByTestId(TID)).toBeTruthy();
    expect(columnCount(queryAllByTestId)).toBe(0);
    // All tiles still rendered.
    for (let i = 0; i < 4; i += 1) expect(getByTestId(`tile-${i}`)).toBeTruthy();
  });

  it("renders 2 columns on a medium width (800)", () => {
    mockWidth = 800;
    const { queryAllByTestId } = renderTiles(4);
    expect(columnCount(queryAllByTestId)).toBe(2);
  });

  it("renders 3 columns on an expanded width (1200)", () => {
    mockWidth = 1200;
    const { queryAllByTestId } = renderTiles(6);
    expect(columnCount(queryAllByTestId)).toBe(3);
  });
});

describe("Masonry — columnCount prop override (#2)", () => {
  afterEach(() => {
    mockWidth = 375;
  });

  it("a columnCount override wins over the window-class default (compact width but 2 cols)", () => {
    mockWidth = 375; // would be 1 column by class
    const { queryAllByTestId } = renderTiles(4, { columnCount: 2 });
    expect(columnCount(queryAllByTestId)).toBe(2);
  });

  it("a columnCount override can force a single column even on a wide screen", () => {
    mockWidth = 1200; // would be 3 columns by class
    const { getByTestId, queryAllByTestId } = renderTiles(4, { columnCount: 1 });
    expect(columnCount(queryAllByTestId)).toBe(0); // single-column fast path
    expect(getByTestId(TID)).toBeTruthy();
  });
});

describe("Masonry — distribution & order in the rendered tree", () => {
  afterEach(() => {
    mockWidth = 375;
  });

  it("distributes children across columns and preserves source order within a column (#3, #4)", () => {
    mockWidth = 800; // 2 columns
    const { getByTestId } = renderTiles(5);
    const col0 = getByTestId(`${TID}-col-0`);
    const col1 = getByTestId(`${TID}-col-1`);

    // Scope tile lookups to each column subtree via RNTL `within`, then read the
    // numeric id back out of each tile's testID, in tree (= source) order.
    const idsIn = (col: ReturnType<typeof getByTestId>): number[] =>
      within(col)
        .getAllByTestId(/^tile-\d+$/)
        .map((n) => Number(String(n.props.testID).replace("tile-", "")));

    // Equal Tier-1 weights → col0 gets even indices, col1 odd indices.
    expect(idsIn(col0)).toEqual([0, 2, 4]);
    expect(idsIn(col1)).toEqual([1, 3]);
  });
});

describe("Masonry — no row-stretch (#5)", () => {
  afterEach(() => {
    mockWidth = 375;
  });

  it("the multi-column row container uses alignItems:'flex-start' so columns stay independent", () => {
    mockWidth = 800;
    const { UNSAFE_getAllByType } = renderTiles(4);
    const rows = UNSAFE_getAllByType(View).filter((n) => {
      const flat = Array.isArray(n.props.style)
        ? Object.assign({}, ...n.props.style.filter(Boolean))
        : n.props.style;
      return flat && flat.flexDirection === "row";
    });
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      const flat = Array.isArray(row.props.style)
        ? Object.assign({}, ...row.props.style.filter(Boolean))
        : row.props.style;
      expect(flat.alignItems).toBe("flex-start");
    });
  });
});

describe("Masonry — null/false children (#7) and headless-safety (#8)", () => {
  afterEach(() => {
    mockWidth = 375;
  });

  it("skips null and false children", () => {
    mockWidth = 800;
    const showHidden = false;
    const { getByTestId, queryByTestId } = render(
      <Masonry testID={TID}>
        <Tile key="a" id={0} />
        {null}
        {false}
        {showHidden && <Tile key="hidden" id={99} />}
        <Tile key="b" id={1} />
      </Masonry>,
    );
    expect(getByTestId("tile-0")).toBeTruthy();
    expect(getByTestId("tile-1")).toBeTruthy();
    expect(queryByTestId("tile-99")).toBeNull();
  });

  it("renders all tiles on first paint without any onLayout event firing (#8)", () => {
    mockWidth = 1200; // 3 columns
    const { getByTestId } = renderTiles(6);
    // No fireEvent(..., 'layout') here — assert full render with zero measurement.
    for (let i = 0; i < 6; i += 1) expect(getByTestId(`tile-${i}`)).toBeTruthy();
  });
});

describe("FlowContainer backwards-compat (#6)", () => {
  afterEach(() => {
    mockWidth = 375;
  });

  it("still renders all children through the Masonry delegate", () => {
    mockWidth = 800;
    const { getByTestId } = render(
      <FlowContainer gap={16}>
        <Tile key="a" id={0} />
        <Tile key="b" id={1} />
        <Tile key="c" id={2} />
      </FlowContainer>,
    );
    expect(getByTestId("tile-0")).toBeTruthy();
    expect(getByTestId("tile-1")).toBeTruthy();
    expect(getByTestId("tile-2")).toBeTruthy();
  });

  it("keeps exporting flowCardStyle / FLOW_CARD_MIN / FLOW_CARD_MAX for spreading call sites", () => {
    expect(FLOW_CARD_MIN).toBe(280);
    expect(FLOW_CARD_MAX).toBe(420);
    expect(flowCardStyle).toMatchObject({
      minWidth: 280,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 280,
    });
  });
});
