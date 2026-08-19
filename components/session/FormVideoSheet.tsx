import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * FormVideoSheet.tsx
 *
 * Full-screen modal for recording a form-check video clip.
 *
 * Uses <CameraView mode="video" mute videoQuality="720p"> — mute is a
 * CameraView prop (not a recordAsync option). Recording uses codec: 'avc1'
 * on iOS only (per Camera.types.d.ts:194-197, VideoCodec union).
 *
 * Hard Rules (AC14):
 *   - No microphone permission requested.
 *   - mute prop ensures video-only capture.
 *   - useMediaSurfaceMounted() called at root (AC12 Sentry gate).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useMediaSurfaceMounted } from "@/hooks/useMediaSurfaceMounted";
import { recordClip, saveReplacementClip } from "@/lib/media/form-clips";
import { useBackupExclusionStatus } from "@/lib/form-clips-context";
import * as Sentry from "@sentry/react-native";

const MAX_DURATION_S = 15;

export type FormVideoSheetProps = {
  isVisible: boolean;
  setId: string;
  exerciseId: string;
  setNumber: number;
  onClose: () => void;
  onClipSaved: (clipId: string) => void;
  /** BLD-1105: 'add' (default) records a new clip; 'replace' swaps an existing one. */
  mode?: "add" | "replace";
  /** BLD-1105: Required when mode='replace'. id is the set_media.id ULID. */
  replaceTarget?: { id: string; rel_path: string };
};

export function FormVideoSheet({
  isVisible,
  setId,
  exerciseId,
  setNumber,
  onClose,
  onClipSaved,
  mode = "add",
  replaceTarget,
}: FormVideoSheetProps) {
  if (!isVisible) return null;
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={isVisible}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <FormVideoSheetBody
        setId={setId}
        exerciseId={exerciseId}
        setNumber={setNumber}
        onClose={onClose}
        onClipSaved={onClipSaved}
        mode={mode}
        replaceTarget={replaceTarget}
      />
    </Modal>
  );
}

type BodyProps = Omit<FormVideoSheetProps, "isVisible">;

function FormVideoSheetBody({ setId, exerciseId, setNumber, onClose, onClipSaved, mode = "add", replaceTarget }: BodyProps) {
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  // BLD-1092: null=pending, true=excluded from backup, false=exclusion failed
  const backupExclusionOk = useBackupExclusionStatus();

  // AC12: increment replay-gate counter while this surface is mounted.
  useMediaSurfaceMounted();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= MAX_DURATION_S) {
          stopTimer();
          // Auto-stop at max duration.
          cameraRef.current?.stopRecording();
          return MAX_DURATION_S;
        }
        return e + 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const handleStartRecording = useCallback(async () => {
    if (recording || !cameraRef.current) return;
    setRecording(true);
    setElapsed(0);
    startTimer();
    try {
      const result = await cameraRef.current?.recordAsync({
        maxDuration: MAX_DURATION_S,
        // codec is iOS-only; Android ignores. Valid VideoCodec values: avc1 | hvc1 | jpeg | apcn | ap4h
        ...(Platform.OS === "ios" ? { codec: "avc1" as const } : {}),
      });
      setRecordedUri(result?.uri ?? null);
    } catch {
      Sentry.addBreadcrumb({ category: "form-clips", message: "record_error", level: "error" });
      Alert.alert(t({ id: "session.formvideosheet.str14", message: "Recording failed" }), t({ id: "session.formvideosheet.str15", message: "Could not record video. Please try again." }));
    } finally {
      stopTimer();
      setRecording(false);
    }
  }, [recording, startTimer, stopTimer]);

  const handleStopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const handleDiscard = useCallback(() => {
    setRecordedUri(null);
    setElapsed(0);
  }, []);

  const handleSave = useCallback(async () => {
    if (!recordedUri || saving) return;
    setSaving(true);
    try {
      const clipArgs = {
        setId,
        exerciseId,
        uri: recordedUri,
        durationMs: elapsed > 0 ? elapsed * 1000 : null,
      };
      let savedId: string;
      if (mode === "replace" && replaceTarget) {
        const newRow = await saveReplacementClip({
          oldId: replaceTarget.id,
          oldRelPath: replaceTarget.rel_path,
          newClipArgs: clipArgs,
        });
        savedId = newRow.id;
      } else {
        const row = await recordClip(clipArgs);
        savedId = row.id;
      }
      onClipSaved(savedId);
      onClose();
    } catch (err) {
      Sentry.captureException(err, { tags: { source: "form_clips_save" } });
      Alert.alert(t({ id: "session.formvideosheet.str16", message: "Save failed" }), t({ id: "session.formvideosheet.str17", message: "Could not save clip. Check device storage and try again." }));
    } finally {
      setSaving(false);
    }
  }, [recordedUri, saving, setId, exerciseId, elapsed, mode, replaceTarget, onClipSaved, onClose]);

  // Permission denied state
  if (!permission?.granted) {
    const canRequest = permission?.canAskAgain !== false;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel={t({ id: "session.formvideosheet.str1", message: "Close" })} accessibilityRole="button">
          <MaterialCommunityIcons name="close" size={28} color={colors.onSurface} />
        </Pressable>
        <View style={styles.permissionContent}>
          <MaterialCommunityIcons name="camera-off" size={48} color={colors.onSurfaceVariant} />
          <Text variant="heading" style={[styles.permissionTitle, { color: colors.onSurface }]}>{t({ id: "session.formvideosheet.str4", message: "Camera access needed" })}</Text>
          <Text style={[styles.permissionBody, { color: colors.onSurfaceVariant }]}>{t({ id: "session.formvideosheet.str5", message: "Camera access is needed to record a form clip. CableSnap stores clips on this device." })}</Text>
          {canRequest ? (
            <Pressable
              style={[styles.permBtn, { backgroundColor: colors.primary }]}
              onPress={requestPermission}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t({ id: "session.formvideosheet.str6", message: "Grant camera access" })}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.permBtn, { backgroundColor: colors.primary }]}
              onPress={() => Linking.openSettings()}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t({ id: "session.formvideosheet.str7", message: "Open Settings" })}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // Review state — clip recorded, waiting for save/discard.
  if (recordedUri) {
    return (
      <ReviewView
        uri={recordedUri}
        elapsed={elapsed}
        saving={saving}
        colors={colors}
        onDiscard={handleDiscard}
        onSave={handleSave}
        onClose={onClose}
      />
    );
  }

  // Camera state
  return (
    // eslint-disable-next-line no-restricted-syntax
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        mode="video"
        mute
        videoQuality="720p"
        facing="back"
      />
      {/* Privacy banner — copy depends on backup-exclusion result (BLD-1092) */}
      <View style={styles.privacyBanner} pointerEvents="none">
        <MaterialCommunityIcons name="lock-outline" size={14} color="#fff" />
        {backupExclusionOk === true ? (
          <Text style={styles.privacyText}>{t({ id: "session.formvideosheet.str8", message: "Saved on this device only — never uploaded" })}</Text>
        ) : (
          <Text style={styles.privacyText}>{t({ id: "session.formvideosheet.str9", message: "Saved locally on your device" })}</Text>
        )}
      </View>
      {/* Close */}
      <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel={t({ id: "session.formvideosheet.str2", message: "Close" })} accessibilityRole="button">
        <MaterialCommunityIcons name="close" size={28} color="#fff" />
      </Pressable>
      {/* Timer */}
      {recording && (
        <View style={styles.timerBadge} pointerEvents="none">
          <View style={styles.recDot} />
          <Text style={styles.timerText}>{MAX_DURATION_S - elapsed}s</Text>
        </View>
      )}
      {/* Record / Stop button — disabled on iOS when backup exclusion failed */}
      <View style={styles.recordBtnRow}>
        <Text style={styles.setLabel} accessibilityRole="text">{t({ id: "session.formvideosheet.str10", message: `Set ${setNumber}` })}</Text>
        {Platform.OS === "ios" && backupExclusionOk === false ? (
          <View style={styles.recordBtnDisabledWrap}>
            <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#f88" />
            <Text style={styles.recordBtnDisabledText}>{t({ id: "session.formvideosheet.str11", message: "Recording unavailable" })}</Text>
          </View>
        ) : (
          <Pressable
            onPress={recording ? handleStopRecording : handleStartRecording}
            accessibilityRole="button"
            accessibilityLabel={recording ? "Stop recording" : "Start recording"}
            hitSlop={12}
            style={[styles.recordBtn, recording && styles.recordBtnActive]}
          >
            <View style={[styles.recordInner, recording && styles.recordInnerActive]} />
          </Pressable>
        )}
        <Text style={styles.durationHint}>{MAX_DURATION_S}s max</Text>
      </View>
    </View>
  );
}

type ReviewViewProps = {
  uri: string;
  elapsed: number;
  saving: boolean;
  colors: ReturnType<typeof useThemeColors>;
  onDiscard: () => void;
  onSave: () => void;
  onClose: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReviewView({ uri, elapsed, saving, colors, onDiscard, onSave, onClose }: ReviewViewProps) {
  // AC12: increment replay-gate counter while this preview surface is mounted.
  useMediaSurfaceMounted();

  return (
    // eslint-disable-next-line no-restricted-syntax
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel={t({ id: "session.formvideosheet.str3", message: "Close" })} accessibilityRole="button">
        <MaterialCommunityIcons name="close" size={28} color="#fff" />
      </Pressable>
      <View style={styles.reviewCenter}>
        <MaterialCommunityIcons name="video-check" size={64} color="#fff" />
        <Text style={styles.reviewTitle}>{t({ id: "session.formvideosheet.str12", message: "Clip ready" })}</Text>
        <Text style={styles.reviewSub}>{elapsed > 0 ? `${elapsed}s` : ""} · 720p · no audio</Text>
      </View>
      <View style={styles.reviewActions}>
        <Pressable
          // eslint-disable-next-line no-restricted-syntax
          style={[styles.reviewBtn, { borderColor: "#fff", borderWidth: 1 }]}
          onPress={onDiscard}
          accessibilityRole="button"
          disabled={saving}
        >
          {/* eslint-disable-next-line no-restricted-syntax */}
          <Text style={{ color: "#fff" }}>{t({ id: "session.formvideosheet.str13", message: "Re-record" })}</Text>
        </Pressable>
        <Pressable
          style={[styles.reviewBtn, { backgroundColor: colors.primary }]}
          onPress={onSave}
          accessibilityRole="button"
          disabled={saving}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
            {saving ? "Saving…" : "Save clip"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  privacyBanner: {
    position: "absolute",
    top: 60,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  // Camera overlay — intentionally hardcoded colors (UI always on #000 background)
  // eslint-disable-next-line no-restricted-syntax
  privacyText: { fontSize: 11, color: "#fff", lineHeight: 16 },
  timerBadge: {
    position: "absolute",
    top: 56,
    left: "50%",
    transform: [{ translateX: -40 }],
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  // eslint-disable-next-line no-restricted-syntax
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#e53935" },
  // eslint-disable-next-line no-restricted-syntax
  timerText: { color: "#fff", fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  recordBtnRow: {
    position: "absolute",
    bottom: 56,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
  },
  setLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 8 },
  durationHint: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 8 },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    // eslint-disable-next-line no-restricted-syntax
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  // eslint-disable-next-line no-restricted-syntax
  recordBtnActive: { borderColor: "#e53935" },
  recordInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    // eslint-disable-next-line no-restricted-syntax
    backgroundColor: "#e53935",
  },
  recordInnerActive: {
    width: 28,
    height: 28,
    borderRadius: 6,
    // eslint-disable-next-line no-restricted-syntax
    backgroundColor: "#e53935",
  },
  recordBtnDisabledWrap: {
    alignItems: "center",
    gap: 6,
  },
  recordBtnDisabledText: {
    // eslint-disable-next-line no-restricted-syntax
    color: "#f88",
    fontSize: 12,
  },
  permissionContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  permissionTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 12 },
  permissionBody: { textAlign: "center", lineHeight: 22 },
  permBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  reviewCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  // eslint-disable-next-line no-restricted-syntax
  reviewTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  reviewSub: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  reviewActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 56,
    justifyContent: "center",
  },
  reviewBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
