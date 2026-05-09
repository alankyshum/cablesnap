import React, { useState, useRef, useCallback, useEffect } from "react";
import { Modal, Pressable, StyleSheet, View, Alert, Image, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { scrim } from "@/constants/design-tokens";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { captureSetupPhoto, saveReplacementSetupPhoto } from "@/lib/media/setup-photos";
import { toAbsPath } from "@/lib/media/set-media-common";
import type { SetMediaRow } from "@/lib/db/form-clips";

export type SetupPhotoSheetProps = {
  visible: boolean;
  setId: string;
  exerciseId: string;
  existingPhoto: SetMediaRow | null;
  onSaved: (row: SetMediaRow) => void;
  onDeleted: () => void;
  onClose: () => void;
};

type ViewMode = "camera" | "preview";

export function SetupPhotoSheet({ visible, setId, exerciseId, existingPhoto, onSaved, onDeleted, onClose }: SetupPhotoSheetProps) {
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [mode, setMode] = useState<ViewMode>(existingPhoto ? "preview" : "camera");
  const prevVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      prevVisibleRef.current = true;
      setMode(existingPhoto ? "preview" : "camera");
    } else if (!visible) {
      prevVisibleRef.current = false;
    }
  }, [visible, existingPhoto]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false });
      if (!photo?.uri) return;
      let row: SetMediaRow;
      if (existingPhoto) {
        row = await saveReplacementSetupPhoto({
          oldId: existingPhoto.id,
          oldRelPath: existingPhoto.rel_path,
          newCaptureArgs: { setId, exerciseId, uri: photo.uri, width: photo.width, height: photo.height },
        });
      } else {
        row = await captureSetupPhoto({ setId, exerciseId, uri: photo.uri, width: photo.width, height: photo.height });
      }
      onSaved(row);
      onClose();
    } catch {
      Alert.alert("Couldn't save setup photo", "Please try again.");
    } finally {
      setCapturing(false);
    }
  }, [capturing, existingPhoto, exerciseId, onClose, onSaved, setId]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete setup photo?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { onDeleted(); onClose(); } },
    ]);
  }, [onClose, onDeleted]);

  if (!visible) return null;

  if (!permission?.granted) {
    const canRequest = permission?.canAskAgain !== false;
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}> 
          <Text style={{ color: colors.onBackground, textAlign: "center", margin: 24 }}>
            Camera permission is required to take setup photos.
          </Text>
          <Pressable onPress={canRequest ? requestPermission : () => Linking.openSettings()} style={[styles.btn, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel={canRequest ? "Grant camera permission" : "Open settings"}>
            <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{canRequest ? "Grant Permission" : "Open Settings"}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        {mode === "camera" ? (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <View style={[styles.controls, { backgroundColor: scrim.heavy }]}>
              <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={28} color={colors.onSurface} />
              </Pressable>
              <Pressable
                onPress={handleCapture}
                disabled={capturing}
                style={[styles.captureBtn, { opacity: capturing ? 0.5 : 1, backgroundColor: colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Take setup photo"
              >
                <MaterialCommunityIcons name="camera" size={32} color={colors.onSurface} />
              </Pressable>
              {existingPhoto ? (
                <Pressable onPress={() => setMode("preview")} style={styles.iconBtn} accessibilityLabel="View current photo">
                  <MaterialCommunityIcons name="image" size={28} color={colors.onSurface} />
                </Pressable>
              ) : <View style={styles.iconBtn} />}
            </View>
          </>
        ) : (
          existingPhoto && (
            <>
              <Image source={{ uri: toAbsPath(existingPhoto.rel_path) }} style={styles.previewImage} resizeMode="contain" />
              <View style={[styles.controls, { backgroundColor: scrim.heavy }]}>
                <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close">
                  <MaterialCommunityIcons name="close" size={28} color={colors.onSurface} />
                </Pressable>
                <Pressable onPress={() => setMode("camera")} style={[styles.captureBtn, { backgroundColor: colors.surface }]} accessibilityLabel="Retake photo">
                  <MaterialCommunityIcons name="camera-retake" size={32} color={colors.onSurface} />
                </Pressable>
                <Pressable onPress={handleDelete} style={styles.iconBtn} accessibilityLabel="Delete photo">
                  <MaterialCommunityIcons name="trash-can-outline" size={28} color={colors.error} />
                </Pressable>
              </View>
            </>
          )
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  permissionContainer: { flex: 1, justifyContent: "center" },
  camera: { flex: 1 },
  previewImage: { flex: 1 },
  controls: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", padding: 24 },
  captureBtn: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  btn: { margin: 16, padding: 16, borderRadius: 8, alignItems: "center" },
  closeBtn: { padding: 16, alignItems: "center" },
});
