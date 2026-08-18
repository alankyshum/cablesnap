import { useMemo, type ReactNode } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextStyle,
  View,
} from "react-native";
import Constants from "expo-constants";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { CHANGELOG, type ReleaseEntry } from "@/lib/changelog.generated";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { stripInternalRefs } from "@/lib/release-notes-markdown";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Optional override for testing; defaults to CHANGELOG from the generator. */
  entries?: ReleaseEntry[];
  /** Optional override for testing; defaults to Constants.expoConfig?.version. */
  currentVersion?: string | null;
};

type MarkdownColors = {
  primary: string;
  surfaceVariant: string;
};

function parseInlineMarkdown(
  line: string,
  style: TextStyle,
  colors: MarkdownColors
): ReactNode[] {
  const tokenPattern =
    /`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_)/g;
  const spans: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let spanIndex = 0;

  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      spans.push(
        <Text key={`span-${spanIndex++}`} style={style}>
          {line.slice(lastIndex, match.index)}
        </Text>
      );
    }

    const token = match[0];
    if (token.startsWith("`")) {
      spans.push(
        <Text
          key={`span-${spanIndex++}`}
          style={[
            style,
            {
              fontFamily: Platform.select({
                ios: "Menlo",
                android: "monospace",
                default: "monospace",
              }),
              backgroundColor: colors.surfaceVariant,
              fontSize: typeof style.fontSize === "number" ? style.fontSize - 1 : undefined,
              paddingHorizontal: 3,
            },
          ]}
        >
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, url] = linkMatch;
        spans.push(
          <Text
            key={`span-${spanIndex++}`}
            style={[style, { color: colors.primary, textDecorationLine: "underline" }]}
            accessibilityRole="link"
            onPress={() => {
              if (/^(?:https?:\/\/|mailto:)/i.test(url)) {
                Linking.openURL(url).catch(() => {});
              }
            }}
          >
            {label}
          </Text>
        );
      }
    } else {
      const isBold = token.startsWith("**");
      const content = token.slice(isBold ? 2 : 1, isBold ? -2 : -1);
      spans.push(
        <Text
          key={`span-${spanIndex++}`}
          style={[style, isBold ? { fontWeight: "700" } : { fontStyle: "italic" }]}
        >
          {content}
        </Text>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    spans.push(
      <Text key={`span-${spanIndex}`} style={style}>
        {line.slice(lastIndex)}
      </Text>
    );
  }

  return spans;
}

function ReleaseBody({
  body,
  color,
  colors,
  fontSize,
  lineHeight,
}: {
  body: string;
  color: string;
  colors: MarkdownColors;
  fontSize: number;
  lineHeight: number;
}) {
  const textStyle: TextStyle = { color, fontSize, lineHeight };

  return (
    <View>
      {body.split("\n").map((line, index) => {
        const bulletMatch = line.match(/^\s*- (.*)$/);
        if (bulletMatch) {
          return (
            <View key={`line-${index}`} style={styles.bodyBulletRow}>
              <Text style={[textStyle, styles.bodyBullet]}>•</Text>
              <Text style={[textStyle, styles.bodyBulletText]}>
                {parseInlineMarkdown(bulletMatch[1], textStyle, colors)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`line-${index}`} style={textStyle}>
            {line ? parseInlineMarkdown(line, textStyle, colors) : "\u00a0"}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * Full-screen modal listing all release entries newest-first.
 * iOS: pageSheet presentation. Android: default slide-up.
 *
 * Current-version detection: case-insensitive compare of
 * `Constants.expoConfig?.version` against `entry.version` (generator has
 * already stripped the leading `v`). No match → no chip on any entry;
 * the modal still renders the list cleanly.
 *
 * Safe-area: `useSafeAreaInsets()` drives the header padding. ZERO
 * hardcoded `Platform.OS === 'ios' ? N : N` constants permitted
 * (regression lock).
 */
export default function ReleaseNotesModal({
  visible,
  onClose,
  entries = CHANGELOG,
  currentVersion,
}: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const effectiveCurrent = useMemo(() => {
    if (currentVersion !== undefined) return currentVersion;
    return Constants.expoConfig?.version ?? null;
  }, [currentVersion]);

  const currentNormalized = effectiveCurrent?.trim().toLowerCase() ?? null;
  const hasMatch = useMemo(
    () =>
      currentNormalized != null &&
      entries.some((e) => e.version.trim().toLowerCase() === currentNormalized),
    [entries, currentNormalized]
  );

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
        testID="release-notes-modal"
      >
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 12,
              paddingLeft: insets.left + 16,
              paddingRight: insets.right + 12,
              borderBottomColor: colors.outlineVariant ?? colors.outline,
            },
          ]}
        >
          <Text
            variant="body"
            style={{ color: colors.onSurface, fontWeight: "700", fontSize: fontSizes.lg }}
            accessibilityRole="header"
          >
            What&apos;s New
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close release notes"
            testID="release-notes-close"
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: pressed
                  ? colors.surfaceVariant
                  : "transparent",
              },
            ]}
          >
            <X size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        {entries.length === 0 ? (
          <View style={styles.emptyWrap} testID="release-notes-empty">
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
            >
              No release notes available
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingLeft: insets.left + 16,
                paddingRight: insets.right + 16,
                paddingBottom: insets.bottom + 24,
              },
            ]}
            showsVerticalScrollIndicator
          >
            {entries.map((entry, idx) => {
              const isCurrent =
                hasMatch &&
                currentNormalized != null &&
                entry.version.trim().toLowerCase() === currentNormalized;
              return (
                <View
                  key={`${entry.version}-${idx}`}
                  style={[
                    styles.entry,
                    idx > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.outlineVariant ?? colors.outline,
                    },
                  ]}
                  testID={`release-notes-entry-${entry.version}`}
                >
                  <View style={styles.entryHeader}>
                    <Text
                      variant="body"
                      accessibilityRole="header"
                      style={{
                        color: colors.onSurface,
                        fontWeight: "700",
                        fontSize: fontSizes.base,
                      }}
                    >
                      v{entry.version}
                    </Text>
                    {entry.date ? (
                      <Text
                        variant="body"
                        style={{
                          color: colors.onSurfaceVariant,
                          fontSize: fontSizes.sm,
                          marginLeft: 8,
                        }}
                      >
                        {entry.date}
                      </Text>
                    ) : null}
                    {isCurrent ? (
                      <View
                        style={[
                          styles.currentChip,
                          {
                            backgroundColor: colors.primaryContainer,
                          },
                        ]}
                        testID="release-notes-current-chip"
                      >
                        <Text
                          variant="body"
                          style={{
                            color: colors.onPrimaryContainer,
                            fontSize: fontSizes.xs,
                            fontWeight: "600",
                          }}
                        >
                          Current
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ marginTop: 6 }}>
                    <ReleaseBody
                      body={entry.body.split("\n").map(stripInternalRefs).join("\n")}
                      color={colors.onSurface}
                      colors={{
                        primary: colors.primary,
                        surfaceVariant: colors.surfaceVariant,
                      }}
                      fontSize={fontSizes.sm}
                      lineHeight={20}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingTop: 8,
  },
  entry: {
    paddingVertical: 14,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  currentChip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  bodyBulletRow: {
    flexDirection: "row",
  },
  bodyBullet: {
    width: 16,
  },
  bodyBulletText: {
    flex: 1,
  },
});
