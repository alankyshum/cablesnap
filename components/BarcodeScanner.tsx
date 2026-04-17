import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";

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
  const theme = useTheme();
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = useCallback(
    (result: BarcodeScanResult) => {
      const now = Date.now();
      if (
        result.data === lastScannedRef.current &&
        now - lastScannedTimeRef.current < DEBOUNCE_MS
      ) {
        return;
      }

      lastScannedRef.current = result.data;
      lastScannedTimeRef.current = now;
      setScanned(true);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onBarcodeScanned(result.data);
    },
    [onBarcodeScanned]
  );

  if (!visible) return null;

  return (
    <View
      style={styles.overlay}
      accessibilityLabel="Barcode scanner. Point camera at a food barcode."
      accessibilityViewIsModal
    >
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Semi-transparent overlay around scanning region */}
      <View style={styles.overlayContent}>
        <Text
          variant="titleMedium"
          style={[styles.instruction, { color: "#ffffff" }]}
        >
          Scan a food barcode
        </Text>

        <View style={styles.scanRegion}>
          <View style={[styles.scanFrame, { borderColor: theme.colors.primary }]} />
        </View>

        <Pressable
          onPress={() => {
            setScanned(false);
            lastScannedRef.current = null;
            onClose();
          }}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: pressed ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)" },
          ]}
          accessibilityLabel="Close barcode scanner"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: "#000000",
  },
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
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
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "bold",
  },
});
