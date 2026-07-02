package com.aplusscore.android.deviceconfig

import android.content.res.Configuration
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class ScreenMetricsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ScreenMetricsModule"

  @ReactMethod
  fun getCurrentMetrics(promise: Promise) {
    try {
      promise.resolve(buildMetrics())
    } catch (error: Throwable) {
      promise.reject("SCREEN_METRICS_ERROR", error)
    }
  }

  private fun buildMetrics(): WritableMap {
    val resources = reactContext.resources
    val config = resources.configuration
    val displayMetrics = resources.displayMetrics

    val widthDp = if (config.screenWidthDp != Configuration.SCREEN_WIDTH_DP_UNDEFINED) {
      config.screenWidthDp
    } else {
      (displayMetrics.widthPixels / displayMetrics.density).toInt()
    }

    val heightDp = if (config.screenHeightDp != Configuration.SCREEN_HEIGHT_DP_UNDEFINED) {
      config.screenHeightDp
    } else {
      (displayMetrics.heightPixels / displayMetrics.density).toInt()
    }

    val smallestWidthDp = if (
      config.smallestScreenWidthDp != Configuration.SMALLEST_SCREEN_WIDTH_DP_UNDEFINED
    ) {
      config.smallestScreenWidthDp
    } else {
      minOf(widthDp, heightDp)
    }

    val result = Arguments.createMap()
    result.putInt("screenWidthDp", widthDp)
    result.putInt("screenHeightDp", heightDp)
    result.putInt("smallestScreenWidthDp", smallestWidthDp)
    result.putInt("densityDpi", displayMetrics.densityDpi)
    result.putDouble("fontScale", config.fontScale.toDouble())
    result.putDouble("density", displayMetrics.density.toDouble())
    result.putDouble("windowWidthPx", displayMetrics.widthPixels.toDouble())
    result.putDouble("windowHeightPx", displayMetrics.heightPixels.toDouble())
    result.putBoolean("isTablet", smallestWidthDp >= 600)
    result.putString(
      "orientation",
      if (config.orientation == Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait",
    )
    result.putString("sdkInt", Build.VERSION.SDK_INT.toString())
    return result
  }
}
