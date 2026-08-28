import { TouchableOpacity, View, Linking } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { stravaLog } from "../../../lib/strava-telemetry";
import { t } from "@lingui/core/macro";

type Props = {
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  showEditButton: boolean;
  completedSetCount: number;
  onCancel: () => void;
  onSave: () => void;
  onEnterEdit: () => void;
  onOpenTemplate: () => void;
  onShare: () => void;
  colors: ThemeColors;
  stravaActivityId?: string | null;
  stravaSynced?: boolean;
  sessionId?: string;
};

/**
 * BLD-690 — Detail screen header buttons. Splits the read-only and edit-mode
 * affordances. Lives in its own file to keep `SessionDetail` under the
 * complexity gate (max 15) and to keep the JSX surface tidy.
 *
 * BLD-891 — Added share button (share-variant-outline icon) to the read-only
 * header row, positioned before Edit and Save-as-Template.
 */
export function SessionDetailHeaderActions({
  editing,
  dirty,
  saving,
  showEditButton,
  completedSetCount,
  onCancel,
  onSave,
  onEnterEdit,
  onOpenTemplate,
  onShare,
  colors,
  stravaActivityId,
  stravaSynced,
  sessionId,
}: Props) {
  if (editing) {
    const saveDisabled = !dirty || saving;
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onCancel} accessibilityLabel={t({ id: "components.session.detail.header.cancel-a11y", message: "Cancel edits" })} hitSlop={8} style={{ padding: 8 }}>
          <Text style={{ color: colors.onSurface }}>{t({ id: "components.session.detail.header.cancel", message: "Cancel" })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          disabled={saveDisabled}
          accessibilityLabel={t({ id: "components.session.detail.header.save-a11y", message: "Save edits" })}
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <Text style={{ color: saveDisabled ? colors.onSurfaceDisabled : colors.primary, fontWeight: "700" }}>
            {t({ id: "components.session.detail.header.save", message: "Save" })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!showEditButton) return null;
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {stravaSynced && stravaActivityId && (
        <TouchableOpacity
          onPress={() => {
            stravaLog("info", "view_on_strava_tapped", { sessionId, activityId: stravaActivityId });
            const url = `https://www.strava.com/activities/${stravaActivityId}`;
            Linking.openURL(url).catch((err) => {
              if (__DEV__) console.warn("Failed to open Strava link:", err);
            });
          }}
          accessibilityLabel={t({ id: "components.session.detail.header.strava-a11y", message: "View on Strava" })}
          accessibilityHint={t({ id: "components.session.detail.header.strava-hint", message: "Open this activity on Strava" })}
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="open-in-new" size={22} color="#FC6100" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onShare}
        accessibilityLabel={t({ id: "components.session.detail.header.share-a11y", message: "Share workout" })}
        accessibilityHint={t({ id: "components.session.detail.header.share-hint", message: "Share this workout session as text or image" })}
        hitSlop={8}
        style={{ padding: 8 }}
      >
        <MaterialCommunityIcons name="share-variant-outline" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onEnterEdit} accessibilityLabel={t({ id: "components.session.detail.header.edit-a11y", message: "Edit workout" })} hitSlop={8} style={{ padding: 8 }}>
        <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenTemplate}
        disabled={completedSetCount === 0}
        accessibilityLabel={t({ id: "components.session.detail.header.template-a11y", message: "Save as template" })}
        accessibilityHint={completedSetCount === 0 ? t({ id: "components.session.detail.header.template-disabled", message: "No exercises to save" }) : t({ id: "components.session.detail.header.template-hint", message: "Save this workout as a reusable template" })}
        hitSlop={8}
        style={{ padding: 8 }}
      >
        <MaterialCommunityIcons
          name="content-save-outline"
          size={22}
          color={completedSetCount === 0 ? colors.onSurfaceDisabled : colors.onSurface}
        />
      </TouchableOpacity>
    </View>
  );
}
