import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Modal, StyleSheet, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { captureRef } from "react-native-view-shot";
import { useToast } from "@/components/ui/bna-toast";
import { Button } from "@/components/ui/button";
import ShareCard from "@/components/ShareCard";
import type { ShareCardExercise, ShareCardPR } from "@/components/ShareCard";
import ShareSheet from "@/components/ShareSheet";
import StravaShareCard from "@/components/share/StravaShareCard";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { scrim, fontSizes } from "@/constants/design-tokens";
import { saveShareSettings } from "@/lib/db";
import { syncSessionToStrava, getStravaUserMessage } from "@/lib/strava";
import { stravaLog } from "../../../lib/strava-telemetry";

type Props = {
  shareSheetRef: React.RefObject<BottomSheetModal | null>;
  onShareText: () => void;
  imageDisabled: boolean;
  stravaConnected?: boolean;
  onConnectStrava?: () => void;
  // ShareCard data
  sessionName: string;
  shareCardDate: string;
  duration: string;
  completedSets: number;
  volumeDisplay: string;
  unit: "kg" | "lb";
  rating: number | null;
  shareCardPrs: ShareCardPR[];
  shareCardExercises: ShareCardExercise[];
  promoCaption: string;
  promoEnabled: boolean;
  colors: ThemeColors;
  sessionId?: string;
  stravaSynced?: boolean;
  stravaActivityId?: string | null;
  onRefreshSyncLog?: () => void;
};

export function SessionDetailShareOverlay({
  shareSheetRef,
  onShareText,
  imageDisabled,
  stravaConnected,
  onConnectStrava,
  sessionName,
  shareCardDate,
  duration,
  completedSets,
  volumeDisplay,
  unit,
  rating,
  shareCardPrs,
  shareCardExercises,
  promoCaption,
  promoEnabled,
  colors,
  sessionId,
  stravaSynced,
  stravaActivityId,
  onRefreshSyncLog,
}: Props) {
  const { toast, success, error, info } = useToast();
  const shareCardRef = useRef<View>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const [syncingToStrava, setSyncingToStrava] = useState(false);

  const handleSyncStrava = useCallback(async () => {
    if (!sessionId) return;
    setSyncingToStrava(true);
    try {
      const result = await syncSessionToStrava(sessionId, "manual_detail");
      if (result.status === "synced") {
        success("Synced to Strava ✓");
        onRefreshSyncLog?.();
      } else if (result.status === "queued") {
        info("Sync queued", "Will sync when back online");
        onRefreshSyncLog?.();
      } else if (result.status === "failed") {
        error(getStravaUserMessage(result.error));
        onRefreshSyncLog?.();
      } else if (result.status === "skipped") {
        info("Already on Strava");
        onRefreshSyncLog?.();
      }
    } catch {
      error("Strava sync failed");
    } finally {
      setSyncingToStrava(false);
    }
  }, [sessionId, onRefreshSyncLog, success, error, info]);

  const stravaCardRef = useRef<View>(null);
  const [stravaPreviewVisible, setStravaPreviewVisible] = useState(false);
  const [stravaImageLoading, setStravaImageLoading] = useState(false);
  const [editedCaption, setEditedCaption] = useState(promoCaption);
  const [editedPromoEnabled, setEditedPromoEnabled] = useState(promoEnabled);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ephemeral caption sync from prop
    setEditedCaption(promoCaption);
  }, [promoCaption]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ephemeral promoEnabled sync from prop
    setEditedPromoEnabled(promoEnabled);
  }, [promoEnabled]);

  const handleShareImage = useCallback(() => {
    setImageLoading(true);
    setPreviewVisible(true);
  }, []);

  const handleCaptureAndShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    let uri: string | null = null;
    try {
      setImageLoading(true);
      uri = await captureRef(shareCardRef, { format: "png", quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {
      toast({ description: "Unable to generate image" });
    } finally {
      setImageLoading(false);
      setPreviewVisible(false);
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, [toast]);

  const hasEditedThisSession = useRef(false);

  const commitCaptionEditLog = useCallback(() => {
    if (hasEditedThisSession.current) {
      stravaLog("info", "promo_caption_edited", { sessionId, captionLength: editedCaption.length });
      hasEditedThisSession.current = false;
    }
  }, [sessionId, editedCaption.length]);

  const handleShareStravaImage = useCallback(() => {
    setStravaImageLoading(false);
    setStravaPreviewVisible(true);
    hasEditedThisSession.current = false;
    stravaLog("info", "strava_share_image_tapped", {
      sessionId,
      hasPrs: shareCardPrs.length > 0,
      exerciseCount: shareCardExercises.length,
    });
  }, [sessionId, shareCardPrs.length, shareCardExercises.length]);

  const handleCloseStravaPreview = useCallback(() => {
    commitCaptionEditLog();
    setStravaPreviewVisible(false);
    setStravaImageLoading(false);
    stravaLog("info", "strava_share_image_cancelled", { sessionId });
  }, [sessionId, commitCaptionEditLog]);

  const handleCaptureStravaAndShare = useCallback(async () => {
    if (!stravaCardRef.current) return;
    commitCaptionEditLog();
    let uri: string | null = null;
    try {
      setStravaImageLoading(true);
      setIsCapturing(true);
      // Give React Native a frame to render the static view
      await new Promise((resolve) => setTimeout(resolve, 50));
      uri = await captureRef(stravaCardRef, { format: "png", quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
      stravaLog("info", "strava_share_image_shared", { sessionId });
    } catch {
      toast({ description: "Unable to generate image" });
    } finally {
      setIsCapturing(false);
      setStravaImageLoading(false);
      setStravaPreviewVisible(false);
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, [sessionId, toast, commitCaptionEditLog]);

  const handleCaptionChange = useCallback((text: string) => {
    setEditedCaption(text);
    hasEditedThisSession.current = true;
  }, []);

  const handleTogglePromoEnabled = useCallback((enabled: boolean) => {
    setEditedPromoEnabled(enabled);
    if (!enabled) {
      stravaLog("info", "promo_caption_disabled");
    }
  }, []);

  const handleSaveDefaultCaption = useCallback(async () => {
    commitCaptionEditLog();
    try {
      await saveShareSettings({
        promo_caption: editedCaption,
        promo_caption_enabled: editedPromoEnabled ? 1 : 0,
      });
      toast({ description: "Saved as default caption" });
      stravaLog("info", "promo_caption_saved_default", { captionLength: editedCaption.length });
      if (sessionId && stravaSynced && stravaActivityId) {
        syncSessionToStrava(sessionId).catch((err) => {
          if (__DEV__) console.warn("Background Strava description sync failed:", err);
        });
      }
    } catch {
      toast({ description: "Failed to save caption" });
    }
  }, [editedCaption, editedPromoEnabled, toast, commitCaptionEditLog, sessionId, stravaSynced, stravaActivityId]);

  return (
    <>
      <ShareSheet
        sheetRef={shareSheetRef}
        onShareText={onShareText}
        onShareImage={handleShareImage}
        imageDisabled={imageDisabled}
        onDismiss={() => {}}
        onShareStravaImage={handleShareStravaImage}
        stravaDisabled={imageDisabled}
        stravaConnected={stravaConnected}
        onConnectStrava={onConnectStrava}
        onSyncToStrava={handleSyncStrava}
        syncStravaDisabled={syncingToStrava}
        syncToStravaLabel={stravaSynced ? "Sync to Strava again" : "Sync to Strava"}
      />
      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setPreviewVisible(false); setImageLoading(false); }}
        accessibilityViewIsModal
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewScrollContent}>
              <View ref={shareCardRef} collapsable={false} style={styles.shareCardWrapper}>
                <ShareCard
                  name={sessionName}
                  date={shareCardDate}
                  duration={duration}
                  sets={completedSets}
                  volume={volumeDisplay}
                  unit={unit}
                  rating={rating}
                  prs={shareCardPrs}
                  exercises={shareCardExercises}
                />
              </View>
            </View>
            <View style={styles.previewActions}>
              {imageLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <>
                  <Button variant="default" onPress={handleCaptureAndShare} style={styles.previewBtn} accessibilityRole="button" accessibilityHint="Capture and share the workout card image" label="Share" />
                  <Button variant="outline" onPress={() => { setPreviewVisible(false); setImageLoading(false); }} style={styles.previewBtn} accessibilityRole="button" accessibilityHint="Cancel and close the preview" label="Cancel" />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={stravaPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseStravaPreview}
        accessibilityViewIsModal
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewScrollContent}>
              <View ref={stravaCardRef} collapsable={false} style={styles.stravaCardWrapper}>
                 <StravaShareCard
                  name={sessionName}
                  date={shareCardDate}
                  duration={duration}
                  sets={completedSets}
                  volume={volumeDisplay}
                  unit={unit}
                  prs={shareCardPrs}
                  exercises={shareCardExercises}
                  promoCaption={editedCaption}
                  promoEnabled={editedPromoEnabled}
                  interactive={!isCapturing}
                  onCaptionChange={handleCaptionChange}
                  onToggleEnabled={handleTogglePromoEnabled}
                  onCaptionBlur={commitCaptionEditLog}
                />
              </View>
            </View>
            {editedPromoEnabled && (
              <View style={styles.captionEditRow}>
                <View style={{ flex: 1 }} />
                <Button variant="ghost" onPress={handleSaveDefaultCaption} label="Save as default" />
              </View>
            )}
            <View style={styles.previewActions}>
              {stravaImageLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <>
                  <Button variant="default" onPress={handleCaptureStravaAndShare} style={styles.previewBtn} accessibilityRole="button" accessibilityHint="Capture and share the Strava workout card image" label="Share" />
                  <Button variant="outline" onPress={handleCloseStravaPreview} style={styles.previewBtn} accessibilityRole="button" accessibilityHint="Cancel and close the preview" label="Cancel" />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  previewOverlay: { flex: 1, backgroundColor: scrim.heavy, justifyContent: "center", alignItems: "center", padding: 16 },
  previewContainer: { width: "100%", maxWidth: 400, maxHeight: Dimensions.get("window").height * 0.85, borderRadius: 16, overflow: "hidden" },
  previewScrollContent: { alignItems: "center", padding: 8 },
  shareCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }] },
  stravaCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }] },
  previewActions: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 24, backgroundColor: scrim.light },
  previewBtn: { flex: 1, borderRadius: 8 },
  captionEditRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: scrim.light },
  captionInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: fontSizes.sm },
});
