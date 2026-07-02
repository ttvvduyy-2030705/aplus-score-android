package com.aplusscore.android.video

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class ReplayOverlayModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ReplayOverlayModule"

  @ReactMethod
  fun burnOverlays(
    sourcePath: String,
    outputPath: String,
    overlayMap: ReadableMap,
    promise: Promise,
  ) {
    promise.resolve(sourcePath)
  }
}
