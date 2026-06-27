import { type ReactNode } from "react";
import { type ViewStyle } from "react-native";
import Masonry from "./Masonry";

type Props = {
  children: ReactNode;
  /** Gap between cards in pixels. Default 12. */
  gap?: number;
  /**
   * @deprecated No longer used. {@link Masonry} derives its column count from the
   * window class via `useLayout()`, not from a per-child minimum width. Retained
   * only so existing call sites that still pass this prop keep type-checking.
   */
  minChildWidth?: number;
  style?: ViewStyle;
};

/**
 * @deprecated Prefer importing {@link Masonry} directly. `FlowContainer` is now a
 * thin backwards-compatibility shim that delegates to `Masonry`.
 *
 * Historically this was a flex `row + wrap` ("Pinterest-style") container, but
 * flex-wrap stretches every wrapped row to its tallest child, leaving dead
 * vertical space under shorter tiles. {@link Masonry} replaces that with a true
 * column-distributing, shortest-column-first layout. This wrapper keeps the old
 * public API (same props, same `null`/`false` child handling) so existing call
 * sites migrate with zero churn.
 */
export default function FlowContainer({ children, gap = 12, style }: Props) {
  return (
    <Masonry gap={gap} style={style}>
      {children}
    </Masonry>
  );
}

export const FLOW_CARD_MIN = 280;
export const FLOW_CARD_MAX = 420;

/**
 * @deprecated Retained for backwards compatibility with call sites that spread
 * this into a tile's own style (e.g. `{ ...flowCardStyle, maxWidth: 560 }`).
 * Inside a {@link Masonry} column a tile is already full-column width, so the
 * `minWidth`/`flexBasis` here are inert and harmless. New code should not rely
 * on this style.
 */
export const flowCardStyle: ViewStyle = {
  minWidth: FLOW_CARD_MIN,
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: FLOW_CARD_MIN,
};
