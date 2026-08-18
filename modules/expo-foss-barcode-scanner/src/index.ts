import { requireNativeViewManager } from "expo-modules-core";
import { Platform, View } from "react-native";
import type { NativeSyntheticEvent } from "react-native";

export type BarcodeScannedEvent = NativeSyntheticEvent<{ data: string }>;

export type FossBarcodeScannerProps = {
  onBarcodeScanned?: (event: BarcodeScannedEvent) => void;
  style?: object;
};

/** Embedded ZXing view. Android-only; barcode formats are restricted natively. */
export const FossBarcodeScannerView =
  Platform.OS === "android"
    ? requireNativeViewManager<FossBarcodeScannerProps>("FossBarcodeScanner")
    : View;
