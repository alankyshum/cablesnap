import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { lookupBarcodeWithTimeout, type ParsedFood, type BarcodeResult } from "../lib/openfoodfacts";

const BARCODE_ERRORS: Record<string, string> = {
  timeout: "Lookup timed out. Please try again.",
  not_found: "Product not found. Try searching by name.",
  incomplete: "Product found but nutrition data is incomplete.",
  default: "Could not look up barcode. Check your connection.",
};

export function useBarcodeScanner(
  scanOnMount: boolean | undefined,
  onFound: (food: ParsedFood) => void,
) {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [scannedProductName, setScannedProductName] = useState<string | null>(null);
  const barcodeAbortRef = useRef<AbortController | null>(null);

  const scanMountTriggered = useRef(false);
  useEffect(() => {
    if (scanOnMount && !scanMountTriggered.current && Platform.OS !== "web") {
      scanMountTriggered.current = true;
      queueMicrotask(() => setScannerVisible(true));
    }
  }, [scanOnMount]);

  useEffect(() => {
    return () => { if (barcodeAbortRef.current) barcodeAbortRef.current.abort(); };
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    setScannerVisible(false);
    setBarcodeError(null);
    setBarcodeLoading(true);
    setScannedProductName(null);

    if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
    const controller = new AbortController();
    barcodeAbortRef.current = controller;

    const result: BarcodeResult = await lookupBarcodeWithTimeout(barcode, controller.signal);
    if (controller.signal.aborted) return;
    setBarcodeLoading(false);

    if (!result.ok) {
      setBarcodeError(BARCODE_ERRORS[result.error] ?? BARCODE_ERRORS.default);
      return;
    }
    if (result.status !== "found") {
      setBarcodeError(BARCODE_ERRORS[result.status]);
      return;
    }

    setScannedProductName(result.food.name);
    onFound(result.food);
  }, [onFound]);

  const openScanner = useCallback(() => {
    setBarcodeError(null);
    setScannerVisible(true);
  }, []);

  const closeScanner = useCallback(() => {
    setScannerVisible(false);
    if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
  }, []);

  return {
    scannerVisible, barcodeLoading, barcodeError, scannedProductName,
    handleBarcodeScanned, openScanner, closeScanner,
  };
}
