import { useWindowDimensions } from "react-native";

export const BREAKPOINTS = {
  compact: 0,
  medium: 600,
  expanded: 1024,
} as const;

export type WindowClass = "compact" | "medium" | "expanded";

export function useLayout() {
  const { width } = useWindowDimensions();
  const windowClass: WindowClass =
    width >= BREAKPOINTS.expanded
      ? "expanded"
      : width >= BREAKPOINTS.medium
        ? "medium"
        : "compact";

  return {
    width,
    windowClass,
    compact: windowClass === "compact",
    medium: windowClass === "medium",
    expanded: windowClass === "expanded",
    /** True for both medium and expanded */
    atLeastMedium: width >= BREAKPOINTS.medium,
    scale: windowClass === "compact" ? 1.0 : 1.1,
    horizontalPadding:
      windowClass === "expanded" ? 32 : windowClass === "medium" ? 24 : 16,
  };
}
