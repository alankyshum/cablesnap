import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, spacing } from "@/constants/design-tokens";

export type BreadcrumbSegment = {
  label: string;
  href?: string;
};

export type BreadcrumbTitleProps = {
  segments: BreadcrumbSegment[];
};

export default function BreadcrumbTitle({ segments }: BreadcrumbTitleProps) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <View style={styles.container} accessibilityLabel={segments.map(({ label }) => label).join("/")}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const content = (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.label, { color: colors.onSurface }, !isLast && styles.parentLabel]}
          >
            {segment.label}
          </Text>
        );

        return (
          <View key={`${segment.label}-${index}`} style={styles.segment}>
            {index > 0 && <Text style={[styles.separator, { color: colors.onSurfaceVariant }]}>/</Text>}
            {!isLast && segment.href ? (
              <Pressable
                onPress={() => router.push(segment.href as never)}
                accessibilityRole="link"
                accessibilityLabel={segment.label}
                style={styles.pressable}
              >
                {content}
              </Pressable>
            ) : (
              content
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
  },
  pressable: {
    minWidth: spacing.xxxl,
    minHeight: spacing.xxxl,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
    flexShrink: 1,
  },
  parentLabel: {
    maxWidth: "100%",
  },
  separator: {
    fontSize: fontSizes.sm,
    marginHorizontal: spacing.xs,
  },
});
