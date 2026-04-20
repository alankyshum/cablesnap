import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  /** Gap between cards in pixels. Default 12. */
  gap?: number;
  /** Minimum width for each child card. Default 280. */
  minChildWidth?: number;
  style?: ViewStyle;
};

/**
 * Pinterest-style flowing container. Children wrap into as many columns
 * as fit based on available width. Each child should use FlowCard styles.
 */
export default function FlowContainer({
  children,
  gap = 12,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  minChildWidth,
  style,
}: Props) {
  return (
    <View style={[styles.container, { gap }, style]}>
      {children}
    </View>
  );
}

export const FLOW_CARD_MIN = 280;
export const FLOW_CARD_MAX = 420;

export const flowCardStyle: ViewStyle = {
  minWidth: FLOW_CARD_MIN,
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: FLOW_CARD_MIN,
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
