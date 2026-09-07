import { ActivityIndicator, Dimensions, Modal, Platform, StyleSheet, TextInput, View, Linking } from "react-native";
import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import ShareCard from "@/components/ShareCard";
import type { ShareCardExercise, ShareCardPR } from "@/components/ShareCard";
import StravaShareCard from "@/components/share/StravaShareCard";
import AchievementRecapCard from "@/components/share/AchievementRecapCard";
import type { AchievementDef } from "@/lib/achievements";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { RefObject } from "react";
import { fontSizes, scrim } from "@/constants/design-tokens";
import { saveShareSettings } from "@/lib/db";
import { syncSessionToStrava } from "@/lib/strava";
import { useToast } from "@/components/ui/bna-toast";
import { stravaLog } from "../../../lib/strava-telemetry";
import { t } from "@lingui/core/macro";

type Props = {
  colors: ThemeColors;
  session: { id?: string; completed_at?: number | null; name?: string | null };
  completedSetCount: number;
  // Template modal
  templateModalVisible: boolean;
  setTemplateModalVisible: (v: boolean) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  saving: boolean;
  handleSaveAsTemplate: () => void;
  // Navigation
  onDone: () => void;
  onViewDetails: () => void;
  onSharePress: () => void;
  // Share preview
  previewVisible: boolean;
  setPreviewVisible: (v: boolean) => void;
  imageLoading: boolean;
  setImageLoading: (v: boolean) => void;
  shareCardRef: RefObject<View | null>;
  handleCaptureAndShare: () => void;
  // Strava share preview
  stravaPreviewVisible: boolean;
  setStravaPreviewVisible: (v: boolean) => void;
  stravaImageLoading: boolean;
  setStravaImageLoading: (v: boolean) => void;
  stravaCardRef: RefObject<View | null>;
  handleCaptureStravaAndShare: () => void;
  // Achievement share preview
  achievementPreviewVisible: boolean;
  setAchievementPreviewVisible: (v: boolean) => void;
  achievementImageLoading: boolean;
  setAchievementImageLoading: (v: boolean) => void;
  achievementCardRef: RefObject<View | null>;
  handleCaptureAchievementAndShare: (achievementCount: number) => void;
  newAchievements: AchievementDef[];
  // Promo caption
  promoCaption: string;
  promoEnabled: boolean;
  // Share card data
  shareCardDate: string;
  duration: string;
  completedCount: number;
  volumeDisplay: string;
  unit: "kg" | "lb";
  rating: number | null;
  shareCardPrs: ShareCardPR[];
  shareCardExercises: ShareCardExercise[];
  stravaActivityId?: string | null;
  stravaSynced?: boolean;
};

export default function SummaryFooter({
  colors, session, completedSetCount,
  templateModalVisible, setTemplateModalVisible,
  templateName, setTemplateName, saving, handleSaveAsTemplate,
  onDone, onViewDetails, onSharePress,
  previewVisible, setPreviewVisible, imageLoading, setImageLoading,
  shareCardRef, handleCaptureAndShare,
  stravaPreviewVisible, setStravaPreviewVisible,
  stravaImageLoading, setStravaImageLoading,
  stravaCardRef, handleCaptureStravaAndShare,
  achievementPreviewVisible, setAchievementPreviewVisible,
  achievementImageLoading, setAchievementImageLoading,
  achievementCardRef, handleCaptureAchievementAndShare,
  newAchievements,
  promoCaption, promoEnabled,
  shareCardDate, duration, completedCount, volumeDisplay, unit, rating,
  shareCardPrs, shareCardExercises,
  stravaActivityId,
  stravaSynced,
}: Props) {
  const { toast } = useToast();
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

  const hasEditedThisSession = useRef(false);

  const commitCaptionEditLog = useCallback(() => {
    if (hasEditedThisSession.current) {
      stravaLog("info", "promo_caption_edited", { sessionId: session.id, captionLength: editedCaption.length });
      hasEditedThisSession.current = false;
    }
  }, [session.id, editedCaption.length]);

  const handleCaptionChange = (text: string) => {
    setEditedCaption(text);
    hasEditedThisSession.current = true;
  };

  const handleTogglePromoEnabled = (enabled: boolean) => {
    setEditedPromoEnabled(enabled);
    if (!enabled) {
      stravaLog("info", "promo_caption_disabled");
    }
  };

  const handleSaveDefaultCaption = async () => {
    commitCaptionEditLog();
    try {
      await saveShareSettings({
        promo_caption: editedCaption,
        promo_caption_enabled: editedPromoEnabled ? 1 : 0,
      });
      toast({ description: t({ id: "components.session.summary.footer.saved-caption", message: "Saved as default caption" }) });
      stravaLog("info", "promo_caption_saved_default", { captionLength: editedCaption.length });
      if (session.id && stravaSynced) {
        syncSessionToStrava(session.id, "post_workout").catch((err) => {
          if (__DEV__) console.warn("Background Strava description sync failed:", err);
        });
      }
    } catch {
      toast({ description: t({ id: "components.session.summary.footer.caption-error", message: "Failed to save caption" }) });
    }
  };

  const localCaptureStravaAndShare = async () => {
    commitCaptionEditLog();
    setIsCapturing(true);
    // Give React Native a frame to render the static view
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await handleCaptureStravaAndShare();
    } finally {
      setIsCapturing(false);
    }
  };

  const localCaptureAchievementAndShare = async () => {
    commitCaptionEditLog();
    setIsCapturing(true);
    // Give React Native a frame to render the static view
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await handleCaptureAchievementAndShare(newAchievements.length);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <>
      <View style={styles.actions}>
        {stravaSynced && stravaActivityId && (
          <Button
            variant="outline"
            onPress={() => {
              stravaLog("info", "view_on_strava_tapped", { sessionId: session.id, activityId: stravaActivityId });
              const url = `https://www.strava.com/activities/${stravaActivityId}`;
              Linking.openURL(url).catch((err) => {
                if (__DEV__) console.warn("Failed to open Strava link:", err);
              });
            }}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "components.session.summary.footer.strava-a11y", message: "View on Strava" })}
            accessibilityHint={t({ id: "components.session.summary.footer.strava-hint", message: "Open this activity on Strava" })}
            label={t({ id: "components.session.summary.footer.strava", message: "View on Strava" })}
          />
        )}
        {session.completed_at && (
          <Button
            variant="outline"
            onPress={() => {
              setTemplateName((session.name ?? "").slice(0, 100));
              setTemplateModalVisible(true);
            }}
            style={styles.actionBtn}
            disabled={completedSetCount === 0}
            accessibilityRole="button"
            accessibilityHint={completedSetCount === 0 ? t({ id: "components.session.summary.footer.template-disabled", message: "No exercises to save" }) : t({ id: "components.session.summary.footer.template-hint", message: "Save this workout as a reusable template" })}
            accessibilityState={{ disabled: completedSetCount === 0 }}
            label={t({ id: "components.session.summary.footer.save-template", message: "Save as Template" })}
          />
        )}
        <Button variant="default" onPress={onDone} style={styles.actionBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.done-hint", message: "Return to workouts tab" })} label={t({ id: "components.session.summary.footer.done", message: "Done" })} />
        <Button variant="outline" onPress={onSharePress} style={styles.actionBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.share-hint", message: "Share workout summary" })} label={t({ id: "components.session.summary.footer.share", message: "Share" })} />
        <Button variant="ghost" onPress={onViewDetails} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.details-hint", message: "View detailed workout breakdown" })} label={t({ id: "components.session.summary.footer.details", message: "View Details" })} />
      </View>

      <SaveTemplateModal
        visible={templateModalVisible}
        onClose={() => setTemplateModalVisible(false)}
        colors={colors}
        templateName={templateName}
        onNameChange={(t) => setTemplateName(t.slice(0, 100))}
        handleSaveAsTemplate={handleSaveAsTemplate}
        saving={saving}
      />

      <SharePreviewModal
        visible={previewVisible}
        onClose={() => { setPreviewVisible(false); setImageLoading(false); }}
        colors={colors}
        shareCardRef={shareCardRef}
        session={session}
        shareCardDate={shareCardDate}
        duration={duration}
        completedCount={completedCount}
        volumeDisplay={volumeDisplay}
        unit={unit}
        rating={rating}
        shareCardPrs={shareCardPrs}
        shareCardExercises={shareCardExercises}
        imageLoading={imageLoading}
        handleCaptureAndShare={handleCaptureAndShare}
      />

      <StravaPreviewModal
        visible={stravaPreviewVisible}
        onClose={() => {
          commitCaptionEditLog();
          setStravaPreviewVisible(false);
          setStravaImageLoading(false);
          stravaLog("info", "strava_share_image_cancelled", { sessionId: session.id });
        }}
        colors={colors}
        stravaCardRef={stravaCardRef}
        session={session}
        shareCardDate={shareCardDate}
        duration={duration}
        completedCount={completedCount}
        volumeDisplay={volumeDisplay}
        unit={unit}
        shareCardPrs={shareCardPrs}
        shareCardExercises={shareCardExercises}
        editedCaption={editedCaption}
        editedPromoEnabled={editedPromoEnabled}
        isCapturing={isCapturing}
        setEditedCaption={handleCaptionChange}
        setEditedPromoEnabled={handleTogglePromoEnabled}
        handleSaveDefaultCaption={handleSaveDefaultCaption}
        stravaImageLoading={stravaImageLoading}
        localCaptureStravaAndShare={localCaptureStravaAndShare}
        onCaptionBlur={commitCaptionEditLog}
      />

      <AchievementPreviewModal
        visible={achievementPreviewVisible}
        onClose={() => {
          commitCaptionEditLog();
          setAchievementPreviewVisible(false);
          setAchievementImageLoading(false);
        }}
        colors={colors}
        achievementCardRef={achievementCardRef}
        newAchievements={newAchievements}
        session={session}
        shareCardDate={shareCardDate}
        editedCaption={editedCaption}
        editedPromoEnabled={editedPromoEnabled}
        isCapturing={isCapturing}
        setEditedCaption={handleCaptionChange}
        setEditedPromoEnabled={handleTogglePromoEnabled}
        handleSaveDefaultCaption={handleSaveDefaultCaption}
        achievementImageLoading={achievementImageLoading}
        localCaptureAchievementAndShare={localCaptureAchievementAndShare}
        onCaptionBlur={commitCaptionEditLog}
      />
    </>
  );
}

function SaveTemplateModal({
  visible,
  onClose,
  colors,
  templateName,
  onNameChange,
  handleSaveAsTemplate,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  templateName: string;
  onNameChange: (t: string) => void;
  handleSaveAsTemplate: () => void;
  saving: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>{t({ id: "components.session.summary.footer.modal-title", message: "Save as Template" })}</Text>
          <TextInput
            value={templateName}
            onChangeText={onNameChange}
            placeholder={t({ id: "components.session.summary.footer.modal-placeholder", message: "Template name" })}
            placeholderTextColor={colors.onSurfaceDisabled}
            maxLength={100}
            style={[styles.modalInput, { color: colors.onSurface, backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}
            autoFocus
            accessibilityLabel={t({ id: "components.session.summary.footer.modal-name-a11y", message: "Template name" })}
          />
          <View style={styles.modalActions}>
            <Button variant="ghost" onPress={onClose} label={t({ id: "components.session.summary.footer.modal-cancel", message: "Cancel" })} />
            <Button variant="default" onPress={handleSaveAsTemplate} loading={saving} disabled={saving || !templateName.trim()} label={t({ id: "components.session.summary.footer.modal-save", message: "Save" })} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SharePreviewModal({
  visible,
  onClose,
  colors,
  shareCardRef,
  session,
  shareCardDate,
  duration,
  completedCount,
  volumeDisplay,
  unit,
  rating,
  shareCardPrs,
  shareCardExercises,
  imageLoading,
  handleCaptureAndShare,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  shareCardRef: RefObject<View | null>;
  session: { name?: string | null };
  shareCardDate: string;
  duration: string;
  completedCount: number;
  volumeDisplay: string;
  unit: "kg" | "lb";
  rating: number | null;
  shareCardPrs: ShareCardPR[];
  shareCardExercises: ShareCardExercise[];
  imageLoading: boolean;
  handleCaptureAndShare: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      {...(Platform.OS !== 'web' ? { accessibilityViewIsModal: true } : {})}
    >
      <View style={styles.previewOverlay} testID="summary-preview-overlay">
        <View style={styles.previewContainer} testID="summary-preview-container">
          <View style={styles.previewScrollContent}>
            <View ref={shareCardRef} collapsable={false} style={styles.shareCardWrapper} testID="summary-share-card-wrapper">
              <ShareCard
                name={session?.name ?? "Workout"}
                date={shareCardDate}
                duration={duration}
                sets={completedCount}
                volume={volumeDisplay}
                unit={unit}
                rating={rating}
                prs={shareCardPrs}
                exercises={shareCardExercises}
              />
            </View>
          </View>
          <View style={styles.previewActions} testID="summary-preview-actions">
            {imageLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <Button variant="default" onPress={handleCaptureAndShare} style={styles.previewBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.image-hint", message: "Capture and share the workout card image" })} label={t({ id: "components.session.summary.footer.share-preview", message: "Share" })} />
                <Button variant="outline" onPress={onClose} style={styles.previewBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.cancel-preview-hint", message: "Cancel and close the preview" })} label={t({ id: "components.session.summary.footer.cancel-preview", message: "Cancel" })} />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StravaPreviewModal({
  visible,
  onClose,
  colors,
  stravaCardRef,
  session,
  shareCardDate,
  duration,
  completedCount,
  volumeDisplay,
  unit,
  shareCardPrs,
  shareCardExercises,
  editedCaption,
  editedPromoEnabled,
  isCapturing,
  setEditedCaption,
  setEditedPromoEnabled,
  handleSaveDefaultCaption,
  stravaImageLoading,
  localCaptureStravaAndShare,
  onCaptionBlur,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  stravaCardRef: RefObject<View | null>;
  session: { name?: string | null };
  shareCardDate: string;
  duration: string;
  completedCount: number;
  volumeDisplay: string;
  unit: "kg" | "lb";
  shareCardPrs: ShareCardPR[];
  shareCardExercises: ShareCardExercise[];
  editedCaption: string;
  editedPromoEnabled: boolean;
  isCapturing: boolean;
  setEditedCaption: (c: string) => void;
  setEditedPromoEnabled: (e: boolean) => void;
  handleSaveDefaultCaption: () => void;
  stravaImageLoading: boolean;
  localCaptureStravaAndShare: () => void;
  onCaptionBlur?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      {...(Platform.OS !== 'web' ? { accessibilityViewIsModal: true } : {})}
    >
      <View style={styles.previewOverlay} testID="summary-strava-preview-overlay">
        <View style={styles.previewContainer} testID="summary-strava-preview-container">
          <View style={styles.previewScrollContent}>
            <View ref={stravaCardRef} collapsable={false} style={styles.stravaCardWrapper} testID="summary-strava-share-card-wrapper">
              <StravaShareCard
                name={session?.name ?? "Workout"}
                date={shareCardDate}
                duration={duration}
                sets={completedCount}
                volume={volumeDisplay}
                unit={unit}
                prs={shareCardPrs}
                exercises={shareCardExercises}
                promoCaption={editedCaption}
                promoEnabled={editedPromoEnabled}
                interactive={!isCapturing}
                onCaptionChange={setEditedCaption}
                onToggleEnabled={setEditedPromoEnabled}
                onCaptionBlur={onCaptionBlur}
              />
            </View>
          </View>
          {editedPromoEnabled && (
            <View style={styles.captionEditRow}>
              <View style={{ flex: 1 }} />
              <Button variant="ghost" onPress={handleSaveDefaultCaption} label={t({ id: "components.session.summary.footer.save-default", message: "Save as default" })} />
            </View>
          )}
          <View style={styles.previewActions} testID="summary-strava-preview-actions">
            {stravaImageLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <Button variant="default" onPress={localCaptureStravaAndShare} style={styles.previewBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.strava-preview-hint", message: "Capture and share the Strava workout card image" })} label={t({ id: "components.session.summary.footer.strava-share", message: "Share" })} />
                <Button variant="outline" onPress={onClose} style={styles.previewBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.strava-cancel-hint", message: "Cancel and close the preview" })} label={t({ id: "components.session.summary.footer.strava-cancel", message: "Cancel" })} />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AchievementPreviewModal({
  visible,
  onClose,
  colors,
  achievementCardRef,
  newAchievements,
  session,
  shareCardDate,
  editedCaption,
  editedPromoEnabled,
  isCapturing,
  setEditedCaption,
  setEditedPromoEnabled,
  handleSaveDefaultCaption,
  achievementImageLoading,
  localCaptureAchievementAndShare,
  onCaptionBlur,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
  achievementCardRef: RefObject<View | null>;
  newAchievements: AchievementDef[];
  session: { name?: string | null };
  shareCardDate: string;
  editedCaption: string;
  editedPromoEnabled: boolean;
  isCapturing: boolean;
  setEditedCaption: (c: string) => void;
  setEditedPromoEnabled: (e: boolean) => void;
  handleSaveDefaultCaption: () => void;
  achievementImageLoading: boolean;
  localCaptureAchievementAndShare: () => void;
  onCaptionBlur?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      {...(Platform.OS !== 'web' ? { accessibilityViewIsModal: true } : {})}
    >
      <View style={styles.previewOverlay} testID="summary-achievement-preview-overlay">
        <View style={styles.previewContainer} testID="summary-achievement-preview-container">
          <View style={styles.previewScrollContent}>
            <View ref={achievementCardRef} collapsable={false} style={styles.achievementCardWrapper} testID="summary-achievement-share-card-wrapper">
              <AchievementRecapCard
                achievements={newAchievements}
                sessionName={session?.name ?? "Workout"}
                date={shareCardDate}
                promoCaption={editedCaption}
                promoEnabled={editedPromoEnabled}
                interactive={!isCapturing}
                onCaptionChange={setEditedCaption}
                onToggleEnabled={setEditedPromoEnabled}
                onCaptionBlur={onCaptionBlur}
              />
            </View>
          </View>
          {editedPromoEnabled && (
            <View style={styles.captionEditRow}>
              <View style={{ flex: 1 }} />
              <Button variant="ghost" onPress={handleSaveDefaultCaption} label={t({ id: "components.session.summary.footer.achievement-save-default", message: "Save as default" })} />
            </View>
          )}
          <View style={styles.previewActions} testID="summary-achievement-preview-actions">
            {achievementImageLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <Button variant="default" onPress={localCaptureAchievementAndShare} style={styles.previewBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.achievement-share-hint", message: "Capture and share the achievement recap card image" })} label={t({ id: "components.session.summary.footer.achievement-share", message: "Share" })} />
                <Button variant="outline" onPress={onClose} style={styles.previewBtn} accessibilityRole="button" accessibilityHint={t({ id: "components.session.summary.footer.achievement-cancel-hint", message: "Cancel and close the preview" })} label={t({ id: "components.session.summary.footer.achievement-cancel", message: "Cancel" })} />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: 16, gap: 12 },
  actionBtn: { borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: scrim.light, justifyContent: "center", alignItems: "center", padding: 24 },
  modalContent: { width: "100%", maxWidth: 400, borderRadius: 16, padding: 24 },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: fontSizes.base, marginBottom: 16 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  previewOverlay: { flex: 1, backgroundColor: scrim.heavy, justifyContent: "center", alignItems: "center", padding: 16 },
  previewContainer: { width: "100%", maxWidth: 400, maxHeight: Dimensions.get("window").height * 0.85, borderRadius: 16, overflow: "hidden" },
  previewScrollContent: { alignItems: "center", padding: 8 },
  shareCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }] },
  stravaCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }] },
  achievementCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }] },
  previewActions: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 24, backgroundColor: scrim.light },
  previewBtn: { flex: 1, borderRadius: 8 },
  captionEditRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: scrim.light },
  captionInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: fontSizes.sm },
});
