package com.persoack.cablesnap.fossbarcode

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FossBarcodeScannerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FossBarcodeScanner")

    View(FossBarcodeScannerView::class) {
      Events("onBarcodeScanned")
    }
  }
}
