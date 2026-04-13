import { useWindowDimensions } from "react-native";

const WIDE_BREAKPOINT = 768;

export function useLayout() {
  const { width } = useWindowDimensions();
  return {
    wide: width >= WIDE_BREAKPOINT,
    width,
    scale: width >= WIDE_BREAKPOINT ? 1.1 : 1.0,
  };
}
