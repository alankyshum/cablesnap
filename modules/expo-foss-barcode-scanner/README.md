# expo-foss-barcode-scanner

Local Expo module embedding ZXing Android Embedded 4.3.0 (Apache-2.0).
The native view decodes only EAN-13, EAN-8, UPC-A, and UPC-E. It has no Google
ML Kit, Firebase, Google Play Services, or Install Referrer dependency.

Scanning uses an embedded `BarcodeView`, not a separate Activity. ZXing's
beep/status UI is disabled; the existing CableSnap overlay, haptics, debounce,
and close behavior remain in React Native. Camera permission continues to be
provided by `expo-camera`, which is still required for form video and setup
photos.
