import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Constants from "expo-constants";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { CHANGELOG, type ReleaseEntry } from "@/lib/changelog.generated";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Optional override for testing; defaults to CHANGELOG from the generator. */
  entries?: ReleaseEntry[];
  /** Optional override for testing; defaults to Constants.expoConfig?.version. */
  currentVersion?: string | null;
};

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
 * (BLD-568/569 regression lock).
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
                  <Text
                    variant="body"
                    style={{
                      color: colors.onSurface,
                      fontSize: fontSizes.sm,
                      lineHeight: 20,
                      marginTop: 6,
                    }}
                  >
                    {entry.body}
                  </Text>
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
});
