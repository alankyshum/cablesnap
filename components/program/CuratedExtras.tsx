/**
 * BLD-1000: Curated-program-only UI fragments lifted out of `app/program/[id].tsx`
 * to keep the main file under its decomposition line-budget.
 *
 * Exports:
 *   - `CuratedChip`        : the "CURATED" chip shown in the header.
 *   - `useCuratedCaption`  : load / dismiss the one-shot intro caption.
 *   - `CuratedCaption`     : the dismissible intro card itself.
 *   - `AttributionFooter`  : tappable CC-BY-SA 3.0 source link.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { fontSizes } from "@/constants/design-tokens";
import { getAppSetting, setAppSetting } from "../../lib/db";
import { t } from "@lingui/core/macro";

export type CuratedAttribution = { label: string; url: string; license: string };

const CAPTION_KEY = "curated_intro_dismissed";

export function CuratedChip() {
  return (
    <Chip
      compact
      style={styles.chip}
       accessibilityLabel={t({ id: "components.program.curated-extras.chip-a11y", message: "Curated program from the community. Editable in place." })}
    >
       {t({ id: "components.program.curated-extras.curated", message: "CURATED" })}
    </Chip>
  );
}

export function useCuratedCaption() {
  const [dismissed, setDismissed] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAppSetting(CAPTION_KEY)
      .then((v) => {
        setDismissed(v === "1");
        setLoaded(true);
      })
      .catch(() => {
        setDismissed(false);
        setLoaded(true);
      });
  }, []);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    try {
      await setAppSetting(CAPTION_KEY, "1");
    } catch {
      /* persist failed; local dismiss still applies */
    }
  }, []);

  return { visible: loaded && !dismissed, dismiss };
}

export function CuratedCaption({
  visible, onDismiss, surface, outline, onSurfaceVariant,
}: {
  visible: boolean;
  onDismiss: () => void;
  surface: string;
  outline: string;
  onSurfaceVariant: string;
}) {
  if (!visible) return null;
  return (
    <View style={[styles.captionCard, { backgroundColor: surface, borderColor: outline }]}>
      <Text style={[styles.captionText, { color: onSurfaceVariant }]} maxFontSizeMultiplier={1.5}>
         {t({ id: "components.program.curated-extras.caption", message: "Curated programs are added by CableSnap. Edit freely or hide them via the filter on the Programs screen." })}
      </Text>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={8}
         accessibilityLabel={t({ id: "components.program.curated-extras.dismiss-a11y", message: "Dismiss curated programs info" })}
        accessibilityRole="button"
        style={styles.captionDismiss}
      >
        <MaterialCommunityIcons name="close" size={18} color={onSurfaceVariant} />
      </TouchableOpacity>
    </View>
  );
}

export function AttributionFooter({
  attribution, primary, onSurfaceVariant,
}: {
  attribution: CuratedAttribution | undefined;
  primary: string;
  onSurfaceVariant: string;
}) {
  if (!attribution) return null;
  return (
    <TouchableOpacity
      onPress={() => void Linking.openURL(attribution.url)}
      accessibilityLabel={t({ id: "components.program.curated-extras.source-a11y", message: `Source: ${attribution.label} (${attribution.license}). Opens in browser.` })}
      accessibilityRole="link"
      style={styles.attributionRow}
    >
      <Text style={[styles.attributionText, { color: onSurfaceVariant }]} maxFontSizeMultiplier={1.5}>
        Adapted from{" "}
        <Text style={{ color: primary, textDecorationLine: "underline" }} maxFontSizeMultiplier={1.5}>
          {attribution.label}
        </Text>{" "}
        ({attribution.license}).
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "flex-start", marginBottom: 12 },
  captionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  captionText: { flex: 1, fontSize: fontSizes.sm, lineHeight: 18 },
  captionDismiss: { paddingTop: 1 },
  attributionRow: { marginTop: 16, paddingBottom: 8 },
  attributionText: { fontSize: fontSizes.xs, lineHeight: 16 },
});
