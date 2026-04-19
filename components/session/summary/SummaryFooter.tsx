import { ActivityIndicator, Modal, StyleSheet, TextInput, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import ShareCard from "@/components/ShareCard";
import type { ShareCardExercise, ShareCardPR } from "@/components/ShareCard";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { RefObject } from "react";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  colors: ThemeColors;
  session: { completed_at?: number | null; name?: string | null };
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
  // Share card data
  shareCardDate: string;
  duration: string;
  completedCount: number;
  volumeDisplay: string;
  unit: "kg" | "lb";
  rating: number | null;
  shareCardPrs: ShareCardPR[];
  shareCardExercises: ShareCardExercise[];
};

export default function SummaryFooter({
  colors, session, completedSetCount,
  templateModalVisible, setTemplateModalVisible,
  templateName, setTemplateName, saving, handleSaveAsTemplate,
  onDone, onViewDetails, onSharePress,
  previewVisible, setPreviewVisible, imageLoading, setImageLoading,
  shareCardRef, handleCaptureAndShare,
  shareCardDate, duration, completedCount, volumeDisplay, unit, rating,
  shareCardPrs, shareCardExercises,
}: Props) {
  return (
    <>
      <View style={styles.actions}>
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
            accessibilityHint={completedSetCount === 0 ? "No exercises to save" : "Save this workout as a reusable template"}
            accessibilityState={{ disabled: completedSetCount === 0 }}
            label="Save as Template"
          />
        )}
        <Button variant="default" onPress={onDone} style={styles.actionBtn} accessibilityRole="button" accessibilityHint="Return to workouts tab" label="Done" />
        <Button variant="outline" onPress={onSharePress} style={styles.actionBtn} accessibilityRole="button" accessibilityHint="Share workout summary" label="Share" />
        <Button variant="ghost" onPress={onViewDetails} accessibilityRole="button" accessibilityHint="View detailed workout breakdown" label="View Details" />
      </View>

      {/* Save as Template Modal */}
      <Modal visible={templateModalVisible} transparent animationType="fade" onRequestClose={() => setTemplateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text variant="title" style={{ color: colors.onSurface, marginBottom: 16 }}>Save as Template</Text>
            <TextInput
              value={templateName}
              onChangeText={(t) => setTemplateName(t.slice(0, 100))}
              placeholder="Template name"
              placeholderTextColor={colors.onSurfaceDisabled}
              maxLength={100}
              style={[styles.modalInput, { color: colors.onSurface, backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}
              autoFocus
              accessibilityLabel="Template name"
            />
            <View style={styles.modalActions}>
              <Button variant="ghost" onPress={() => setTemplateModalVisible(false)} label="Cancel" />
              <Button variant="default" onPress={handleSaveAsTemplate} loading={saving} disabled={saving || !templateName.trim()} label="Save" />
            </View>
          </View>
        </View>
      </Modal>

      {/* Share card preview modal */}
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
  actions: { marginTop: 16, gap: 12 },
  actionBtn: { borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalContent: { width: "100%", maxWidth: 400, borderRadius: 16, padding: 24 },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: fontSizes.base, marginBottom: 16 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 16 },
  previewContainer: { width: "100%", maxWidth: 400, maxHeight: "85%", borderRadius: 16, overflow: "hidden" },
  previewScrollContent: { alignItems: "center", padding: 8 },
  shareCardWrapper: { alignSelf: "center", transform: [{ scale: 0.3 }], transformOrigin: "top center" },
  previewActions: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 24, backgroundColor: "rgba(0,0,0,0.5)" },
  previewBtn: { flex: 1, borderRadius: 8 },
});
