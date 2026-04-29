import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Modal, StyleSheet, View } from "react-native";
import BottomSheet from "@gorhom/bottom-sheet";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { captureRef } from "react-native-view-shot";
import { useToast } from "@/components/ui/bna-toast";
import { Button } from "@/components/ui/button";
import ShareCard from "@/components/ShareCard";
import type { ShareCardExercise, ShareCardPR } from "@/components/ShareCard";
import ShareSheet from "@/components/ShareSheet";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { scrim } from "@/constants/design-tokens";

type Props = {
  shareSheetRef: React.RefObject<BottomSheet | null>;
  onShareText: () => void;
  imageDisabled: boolean;
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
  colors: ThemeColors;
};

/**
 * BLD-891 — Share sheet + image preview modal for the session detail screen.
 * Extracted as a standalone component to keep SessionDetail under the
 * complexity gate (max 15).
 */
export function SessionDetailShareOverlay({
  shareSheetRef,
  onShareText,
  imageDisabled,
  sessionName,
  shareCardDate,
  duration,
  completedSets,
  volumeDisplay,
  unit,
  rating,
  shareCardPrs,
  shareCardExercises,
  colors,
}: Props) {
  const { toast } = useToast();
  const shareCardRef = useRef<View>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

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

  return (
    <>
      <ShareSheet
        sheetRef={shareSheetRef}
        onShareText={onShareText}
        onShareImage={handleShareImage}
        imageDisabled={imageDisabled}
        onDismiss={() => {}}
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
    </>
  );
}

const styles = StyleSheet.create({
  previewOverlay: { flex: 1, backgroundColor: scrim.heavy, justifyContent: "center", alignItems: "center", padding: 16 },
  previewContainer: { width: "100%", maxWidth: 400, maxHeight: Dimensions.get("window").height * 0.85, borderRadius: 16, overflow: "hidden" },
  previewScrollContent: { alignItems: "center", padding: 8 },
  shareCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }] },
  previewActions: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 24, backgroundColor: scrim.light },
  previewBtn: { flex: 1, borderRadius: 8 },
});
