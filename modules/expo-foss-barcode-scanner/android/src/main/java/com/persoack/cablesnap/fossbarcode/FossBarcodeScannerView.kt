package com.persoack.cablesnap.fossbarcode

import android.content.Context
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.BarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import com.journeyapps.barcodescanner.camera.CameraSettings
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class FossBarcodeScannerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val barcodeView = BarcodeView(context)
  val onBarcodeScanned by EventDispatcher<BarcodeScannedEvent>()

  init {
    barcodeView.decoderFactory = DefaultDecoderFactory(
      listOf(
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ),
    )
    barcodeView.cameraSettings = CameraSettings().apply {
      isAutoFocusEnabled = true
    }
    barcodeView.setStatusText("")
    addView(barcodeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    barcodeView.decodeContinuous(object : BarcodeCallback {
      override fun barcodeResult(result: BarcodeResult) {
        result.text?.let { onBarcodeScanned(BarcodeScannedEvent(it)) }
      }
    })
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    barcodeView.resume()
  }

  override fun onDetachedFromWindow() {
    barcodeView.pause()
    super.onDetachedFromWindow()
  }
}

class BarcodeScannedEvent(
  @Field val data: String,
) : Record
