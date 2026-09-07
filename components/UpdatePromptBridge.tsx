import { useEffect, useState } from "react";
import { AppState, Linking, useWindowDimensions } from "react-native";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { checkForUpdate, clearLastCheckedAt, dismissUpdate, type AvailableUpdate } from "@/lib/update-check";
import { useToast } from "@/components/ui/bna-toast";
import { ReleaseBody } from "@/components/release-notes/ReleaseBody";
import { ScrollView } from "@/components/ui/scroll-view";
import { useThemeColors } from "@/hooks/useThemeColors";
import { stripHtmlComments, stripInternalRefs } from "@/lib/release-notes-markdown";

export function UpdatePromptBridge() {
  const { error: showError } = useToast();
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    let mounted = true;
    const check = async () => { const available = await checkForUpdate(); if (mounted && available) { setUpdate(available); setIsVisible(true); } };
    void check();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void check(); });
    return () => { mounted = false; sub.remove(); };
  }, []);
  if (!update) return null;
  const description = [`${update.currentVersion} → ${update.version}`, update.name].filter(Boolean).join("\n\n");
  const dismiss = () => dismissUpdate(update.tag);
  const download = async () => {
    try {
      await Linking.openURL(update.url);
    } catch (error) {
      console.warn("Unable to open update URL", error);
      showError("Couldn't open download link");
      await clearLastCheckedAt();
      return false;
    }
    await dismiss();
    return true;
  };
  return <AlertDialog testID="update-available-dialog" confirmTestID="update-download" cancelTestID="update-skip" isVisible={isVisible} dismissible={false} onClose={() => { setIsVisible(false); setUpdate(null); }} title="Update available" description={description} confirmText="Download" cancelText="Skip this version" onConfirm={() => download().catch((error) => { console.warn("Unable to dismiss update", error); return false; })} onCancel={() => void dismiss().catch((error) => console.warn("Unable to dismiss update", error))} style={{ margin: spacing.base }}>
    <ScrollView testID="update-release-notes-scroll" style={{ maxHeight: height * 0.45 }} showsVerticalScrollIndicator nestedScrollEnabled>
      <ReleaseBody body={stripHtmlComments(update.body).split("\n").map(stripInternalRefs).join("\n")} color={colors.onSurface} colors={{ primary: colors.primary, surfaceVariant: colors.surfaceVariant }} fontSize={fontSizes.sm} lineHeight={20} />
    </ScrollView>
  </AlertDialog>;
}
