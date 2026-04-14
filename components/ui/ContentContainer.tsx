import { type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useLayout } from "../../lib/layout";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Provides responsive horizontal padding on medium/expanded screens.
 * No max-width capping -- content flows to fill available width.
 */
export default function ContentContainer({ children, style }: Props) {
  const { horizontalPadding } = useLayout();

  return (
    <View style={[styles.base, { paddingHorizontal: horizontalPadding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    width: "100%" as unknown as number,
  },
});
