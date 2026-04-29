/* eslint-disable max-lines-per-function */
/**
 * BLD-850 — explainer modal for the "Next" suggestion.
 *
 * Mirrors the lightweight tooltip pattern used by `PreferencesCard.tsx`
 * (`soundTooltipVisible`) — controlled visibility, theme-aware colors,
 * backdrop press → close. Static content describing the three cases the
 * `suggest()` algorithm can produce: increase weight, increase reps, and
 * maintain.
 *
 * Copy MUST use the phrase "heaviest set last session" (not "last max" —
 * the earlier draft was ambiguous about set mode; every working/top/back-
 * off set with a logged weight is included in the max).
 */
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "../../constants/design-tokens";

export type SuggestionExplainerModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SuggestionExplainerModal({ visible, onClose }: SuggestionExplainerModalProps) {
  const colors = useThemeColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="suggestion-explainer-modal"
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Pressable
          // Inner Pressable swallows taps so the backdrop press doesn't fire
          // when the user taps inside the card.
          onPress={() => {}}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="How is Next calculated?"
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text variant="title" style={{ color: colors.onSurface, fontWeight: "700" }}>
                How is &ldquo;Next&rdquo; calculated?
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                testID="suggestion-explainer-close"
                style={styles.closeBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <Text variant="body" style={[styles.intro, { color: colors.onSurfaceVariant }]}>
              We compare your last 2 sessions for this exercise:
            </Text>

            <Section
              icon="arrow-up-bold"
              iconColor={colors.primary}
              title="Increase weight"
              body={
                "When all sets completed, RPE < 9.5, and your reps held vs. the prior session.\n\nNew weight = heaviest set last session + your weight step."
              }
              colors={colors}
            />
            <Section
              icon="arrow-up-bold"
              iconColor={colors.primary}
              title="Increase reps (bodyweight)"
              body={
                "When all sets completed → highest reps in last session + 1."
              }
              colors={colors}
            />
            <Section
              icon="equal"
              iconColor={colors.onSurfaceVariant}
              title="Maintain"
              body={
                "When RPE ≥ 9.5, you deloaded, reps dropped, or any set was incomplete."
              }
              colors={colors}
            />

            <Text variant="caption" style={[styles.footer, { color: colors.onSurfaceVariant }]}>
              Tap &ldquo;Next&rdquo; to fill empty sets with the suggested values (we&rsquo;ll
              ask first).
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({
  icon,
  iconColor,
  title,
  body,
  colors,
}: {
  icon: "arrow-up-bold" | "equal";
  iconColor: string;
  title: string;
  body: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
        <Text
          variant="body"
          style={{ color: colors.onSurface, fontWeight: "600", marginLeft: 8 }}
        >
          {title}
        </Text>
      </View>
      <Text variant="body" style={[styles.sectionBody, { color: colors.onSurfaceVariant }]}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    maxHeight: "80%",
  },
  scrollContent: { padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  closeBtn: { padding: 4 },
  intro: { marginBottom: 16, fontSize: fontSizes.sm },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  sectionBody: { fontSize: fontSizes.sm, lineHeight: 20, marginLeft: 26 },
  footer: { marginTop: 8, fontSize: fontSizes.xs, lineHeight: 16 },
});
