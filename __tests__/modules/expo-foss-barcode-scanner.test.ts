jest.mock("expo-modules-core", () => ({
  requireNativeViewManager: jest.fn(() => "FossBarcodeScannerView"),
}));

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  View: "View",
}));

describe("expo-foss-barcode-scanner JS API", () => {
  it("registers the native FossBarcodeScanner view", () => {
    const { requireNativeViewManager } = require("expo-modules-core");
    const { FossBarcodeScannerView } = require("../../modules/expo-foss-barcode-scanner/src");

    expect(requireNativeViewManager).toHaveBeenCalledWith("FossBarcodeScanner");
    expect(FossBarcodeScannerView).toBe("FossBarcodeScannerView");
  });
});
