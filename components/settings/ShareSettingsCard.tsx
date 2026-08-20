import { useState } from "react";
import { Platform, StyleSheet, Switch, TextInput, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { useShareSettings } from "@/hooks/useShareSettings";
import type { ThemeColors } from "@/hooks/useThemeColors";
import ErrorBoundary from "@/components/ErrorBoundary";
import { stravaLog } from "../../lib/strava-telemetry";
import { useLingui } from "@lingui/react/macro";

type Props = {
  colors: ThemeColors;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function ShareSettingsCard({ colors, bareContent = false }: Props) {
  const { settings, effectiveCaption, update, DEFAULT_PROMO_CAPTION } = useShareSettings();
  const { t } = useLingui();
  const [draftCaption, setDraftCaption] = useState("");
  const [editing, setEditing] = useState(false);

  const promoEnabled = settings?.promo_caption_enabled === 1;
  const stravaDescEnabled = settings?.strava_description_enabled === 1;

  const startEditing = () => {
    setDraftCaption(settings?.promo_caption ?? "");
    setEditing(true);
  };

  const saveCaption = async () => {
    const trimmed = draftCaption.trim();
    await update({ promo_caption: trimmed.slice(0, 200) });
    stravaLog("info", "promo_caption_saved_default", { captionLength: trimmed.length });
    setEditing(false);
  };

  const content = (
    <>
      {!bareContent && (
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>
          {t({ id: "settings.sharing.title", message: "Sharing" })}
        </Text>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
            {t({ id: "settings.sharing.promoCaption", message: "Promo Caption" })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {promoEnabled ? (effectiveCaption || DEFAULT_PROMO_CAPTION) : t({ id: "settings.sharing.off", message: "Off" })}
          </Text>
        </View>
        <Switch
          value={promoEnabled}
          onValueChange={async (v) => {
            if (!v) {
              stravaLog("info", "promo_caption_disabled");
            }
            await update({ promo_caption_enabled: v ? 1 : 0 });
          }}
          trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
          thumbColor={Platform.OS === "ios" ? undefined : promoEnabled ? colors.primary : colors.onSurfaceVariant}
          accessibilityLabel={t({ id: "settings.sharing.togglePromoA11y", message: "Toggle promotional caption" })}
        />
      </View>

      {promoEnabled && (
        <View style={{ marginTop: spacing.sm }}>
          {editing ? (
            <View>
              {/* Stable data default: this caption is persisted/sent to Strava, so it must not be localized. */}
              <TextInput
                value={draftCaption}
                onChangeText={(t) => setDraftCaption(t.slice(0, 200))}
                placeholder={DEFAULT_PROMO_CAPTION}
                placeholderTextColor={colors.onSurfaceDisabled}
                multiline
                maxLength={200}
                numberOfLines={2}
                style={[
                  styles.input,
                  {
                    color: colors.onSurface,
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.outline,
                  },
                ]}
                accessibilityLabel={t({ id: "settings.sharing.editPromoA11y", message: "Edit promotional caption" })}
              />
              <View style={styles.inputActions}>
                <Button variant="ghost" size="sm" onPress={() => setEditing(false)} label={t({ id: "common.cancel", message: "Cancel" })} />
                <Button variant="default" size="sm" onPress={saveCaption} label={t({ id: "common.save", message: "Save" })} />
              </View>
            </View>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onPress={startEditing}
              label={settings?.promo_caption ? t({ id: "settings.sharing.editCaption", message: "Edit caption" }) : t({ id: "settings.sharing.editCaptionOptional", message: "Edit caption (optional)" })}
              accessibilityLabel={t({ id: "settings.sharing.editPromoA11y", message: "Edit promotional caption" })}
            />
          )}
        </View>
      )}

      <View style={[styles.row, { marginTop: spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
            {t({ id: "settings.sharing.appendPromo", message: "Append Promo to Strava" })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {t({ id: "settings.sharing.appendPromoHint", message: "Append promo caption to Strava activity description" })}
          </Text>
        </View>
        <Switch
          value={stravaDescEnabled}
          onValueChange={async (v) => {
            stravaLog("info", "strava_description_toggled", { enabled: v });
            await update({ strava_description_enabled: v ? 1 : 0 });
          }}
          trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
          thumbColor={Platform.OS === "ios" ? undefined : stravaDescEnabled ? colors.primary : colors.onSurfaceVariant}
          accessibilityLabel={t({ id: "settings.sharing.toggleAppendA11y", message: "Toggle appending promo to Strava description" })}
        />
      </View>
    </>
  );

  if (bareContent) return <ErrorBoundary><View>{content}</View></ErrorBoundary>;

  return (
    <ErrorBoundary>
      <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>{content}</CardContent>
      </Card>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: fontSizes.base,
    minHeight: 64,
    textAlignVertical: "top",
  },
  inputActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: spacing.sm },
});
