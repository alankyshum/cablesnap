import { View, Text } from "react-native";
import { Colors } from "@/theme/colors";
import { getDatabase } from "@/lib/db";
import { WEB_UNSUPPORTED_MESSAGE } from "@/lib/web-support";

type Props = {
  banner: boolean;
  setBanner: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  themeColors: typeof Colors.light;
};

export function LayoutBanners({ banner, setBanner, error, setError, themeColors }: Props) {
  // BLD-565: on a web host without cross-origin isolation the only
  // surfaced error is WEB_UNSUPPORTED_MESSAGE and a Retry call to
  // getDatabase() would succeed (DB open is lazy) but the first query
  // would still crash with `ReferenceError: SharedArrayBuffer is not
  // defined`.  Suppress the Retry affordance for this specific error
  // so the user is not led into the crash path.
  const canRetry = !!error && error !== WEB_UNSUPPORTED_MESSAGE;
  return (
    <>
      {banner && (
        <View style={{ backgroundColor: themeColors.warningBanner, padding: 16 }}>
          <Text style={{ color: themeColors.foreground }}>
            ⚠️ Web storage unavailable — using in-memory database. Your data will not persist across page reloads.
          </Text>
          <Text style={{ color: themeColors.primary, marginTop: 8, fontWeight: "600" }} onPress={() => setBanner(false)}>
            Dismiss
          </Text>
        </View>
      )}
      {!!error && (
        <View style={{ backgroundColor: themeColors.errorBanner, padding: 16 }}>
          <Text style={{ color: themeColors.foreground }}>
            ❌ Database error: {error}. Try reloading the app.
          </Text>
          {canRetry && (
            <Text style={{ color: themeColors.primary, marginTop: 8, fontWeight: "600" }} onPress={() => { setError(null); getDatabase().catch((e) => setError(e?.message ?? "Retry failed")); }}>
              Retry
            </Text>
          )}
        </View>
      )}
    </>
  );
}
