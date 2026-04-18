import React, { useCallback, useEffect, useRef } from "react";
import { Linking, StyleSheet, View, Pressable } from "react-native";
import { Button, Text } from "react-native-paper";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { CAMERA_OVERLAY } from "../constants/theme";
import { useThemeColors } from "@/hooks/useThemeColors";

type BarcodeScanResult = {
  type: string;
  data: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
};

const DEBOUNCE_MS = 2000;

export default function BarcodeScanner({ visible, onClose, onBarcodeScanned }: Props) {
  const colors = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const scannedRef = useRef(false);

  // Reset scanner state when overlay reopens after auto-close
  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      lastScannedRef.current = null;
      lastScannedTimeRef.current = 0;
    }
  }, [visible]);

  // Request permission when scanner becomes visible and permission is undetermined
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleBarCodeScanned = useCallback(
    (result: BarcodeScanResult) => {
      if (scannedRef.current) return;

      const now = Date.now();
      if (
        result.data === lastScannedRef.current &&
        now - lastScannedTimeRef.current < DEBOUNCE_MS
      ) {
        return;
      }

      lastScannedRef.current = result.data;
      lastScannedTimeRef.current = now;
      scannedRef.current = true;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onBarcodeScanned(result.data);
    },
    [onBarcodeScanned]
  );

  if (!visible) return null;

  // Permission denied and cannot ask again — show settings link
  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View
        style={[styles.overlay, { backgroundColor: colors.background }]}
        accessibilityLabel="Camera permission required"
        accessibilityViewIsModal
      >
        <View style={styles.permissionContent}>
          <Text
            variant="titleMedium"
            style={{ color: colors.onBackground, textAlign: "center", marginBottom: 12 }}
          >
            Camera Access Required
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 24, paddingHorizontal: 32 }}
          >
            FitForge needs camera access to scan food barcodes. Please enable camera access in your device settings.
          </Text>
          <Button
            mode="contained"
            onPress={() => Linking.openSettings()}
            style={{ marginBottom: 12 }}
            contentStyle={{ minHeight: 48 }}
            accessibilityLabel="Open device settings"
            accessibilityRole="button"
          >
            Open Settings
          </Button>
          <Button
            mode="outlined"
            onPress={onClose}
            contentStyle={{ minHeight: 48 }}
            accessibilityLabel="Close barcode scanner"
            accessibilityRole="button"
          >
            Cancel
          </Button>
        </View>
      </View>
    );
  }

  // Permission still loading or being requested
  if (!permission || !permission.granted) {
    return (
      <View
        style={[styles.overlay, { backgroundColor: colors.background }]}
        accessibilityLabel="Requesting camera permission"
        accessibilityViewIsModal
      >
        <View style={styles.permissionContent}>
          <Text
            variant="bodyMedium"
            style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
          >
            Requesting camera access...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.overlay, { backgroundColor: CAMERA_OVERLAY.background }]}
      accessibilityLabel="Barcode scanner. Point camera at a food barcode."
      accessibilityViewIsModal
    >
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
        onBarcodeScanned={handleBarCodeScanned}
      />

      {/* Semi-transparent overlay around scanning region */}
      <View style={styles.overlayContent}>
        <Text
          variant="titleMedium"
          style={[styles.instruction, { color: CAMERA_OVERLAY.text }]}
        >
          Scan a food barcode
        </Text>

        <View style={styles.scanRegion}>
          <View style={[styles.scanFrame, { borderColor: colors.primary }]} />
        </View>

        <Pressable
          onPress={() => {
            scannedRef.current = false;
            lastScannedRef.current = null;
            onClose();
          }}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: pressed ? CAMERA_OVERLAY.closeButtonPressed : CAMERA_OVERLAY.closeButton },
          ]}
          accessibilityLabel="Close barcode scanner"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={[styles.closeText, { color: CAMERA_OVERLAY.text }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  instruction: {
    position: "absolute",
    top: 80,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  scanRegion: {
    width: 280,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 280,
    height: 160,
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  closeButton: {
    position: "absolute",
    top: 48,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 48,
    minHeight: 48,
  },
  closeText: {
    fontSize: 22,
    fontWeight: "bold",
  },
});
