package com.aplusscore.android.uvc

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Log
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = UvcProbeModule.NAME)
class UvcProbeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "UvcProbe"
        private const val TAG = "UVC_VIEW"
        private const val MIN_VALID_RECORDING_BYTES = 128L * 1024L
        private const val MIN_USB_SHORT_REPLAY_BYTES = 8L * 1024L
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun listUsbDevices(promise: Promise) {
        try {
            val usbManager = reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
            val result = Arguments.createArray()

            usbManager.deviceList.values.forEach { device ->
                val isVideoDevice = looksLikeVideoDevice(device)
                if (isVideoDevice) {
                    Log.e(TAG, "[USBWebcam] device-detected source=usb device=${device.deviceName} vendorId=${device.vendorId} productId=${device.productId} reason=probe-list")
                }
                val item = Arguments.createMap()
                item.putString("deviceName", device.deviceName)
                item.putInt("vendorId", device.vendorId)
                item.putInt("productId", device.productId)
                item.putInt("deviceClass", device.deviceClass)
                item.putInt("deviceSubclass", device.deviceSubclass)
                item.putBoolean("looksLikeVideo", isVideoDevice)
                result.pushMap(item)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("UVC_LIST_ERROR", e)
        }
    }

    @ReactMethod
    fun startRecording(outputPath: String, promise: Promise) {
        Log.e(TAG, "[USBWebcamRecorder] start-request bridge source=usb outputPath=$outputPath")
        Log.e(TAG, "[USBWebcamRecorder] outputPath=$outputPath")
        val view = UvcCameraRegistry.activeView
        if (view == null) {
            Log.e(TAG, "[USBWebcamRecorder] start-failed reason=active-view-null")
            promise.reject("UVC_START_ERROR", "active-view-null")
            return
        }

        view.startRecording(outputPath) { ok, message ->
            if (ok) {
                Log.e(TAG, "[USBWebcamRecorder] start-success bridge source=usb outputPath=$outputPath")
                promise.resolve(outputPath)
            } else {
                Log.e(TAG, "[USBWebcamRecorder] start-failed bridge reason=${message ?: "start-failed"}")
                promise.reject("UVC_START_ERROR", message ?: "start-failed")
            }
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        Log.e(TAG, "[USBWebcamRecorder] stop-request bridge source=usb")
        val view = UvcCameraRegistry.activeView
        if (view == null) {
            Log.e(TAG, "[USBWebcamRecorder] stop-failed bridge reason=active-view-null")
            promise.resolve(null)
            return
        }

        view.stopRecording { savedPath ->
            waitForRecordingFile(savedPath, 0, promise)
        }
    }

    private fun waitForRecordingFile(savedPath: String?, attempt: Int, promise: Promise) {
        val file = if (savedPath.isNullOrBlank()) null else File(savedPath)
        val exists = try { file?.exists() == true } catch (_: Throwable) { false }
        val size = if (exists) try { file?.length() ?: 0L } catch (_: Throwable) { 0L } else 0L
        val usable = exists && size >= MIN_USB_SHORT_REPLAY_BYTES

        Log.e(
            TAG,
            "[USBWebcamRecorder] segment-finalized bridge path=$savedPath exists=$exists size=$size usable=$usable attempt=$attempt shortReplayMinBytes=$MIN_USB_SHORT_REPLAY_BYTES",
        )

        if (usable || savedPath.isNullOrBlank() || attempt >= 12) {
            // Return the real native path even if the file is still too small.
            // JS validates exists/size again and refuses replay/history if it is not usable.
            promise.resolve(if (exists || usable) savedPath else null)
            return
        }

        Handler(Looper.getMainLooper()).postDelayed({
            waitForRecordingFile(savedPath, attempt + 1, promise)
        }, 350)
    }

    @ReactMethod
    fun setZoom(zoom: Double, promise: Promise) {
        val view = UvcCameraRegistry.activeView
        if (view == null) {
            promise.resolve(1.0)
            return
        }

        try {
            promise.resolve(view.setZoom(zoom))
        } catch (e: Exception) {
            promise.reject("UVC_ZOOM_ERROR", e)
        }
    }

    @ReactMethod
    fun getZoomInfo(promise: Promise) {
        val view = UvcCameraRegistry.activeView
        val map = Arguments.createMap()

        if (view == null) {
            map.putBoolean("supported", false)
            map.putDouble("minZoom", 1.0)
            map.putDouble("maxZoom", 1.0)
            map.putDouble("zoom", 1.0)
            map.putString("source", "external")
            map.putString("unit", "ratio")
            promise.resolve(map)
            return
        }

        try {
            val info = view.getZoomInfo()
            map.putBoolean("supported", info.supported)
            map.putDouble("minZoom", info.minZoom)
            map.putDouble("maxZoom", info.maxZoom)
            map.putDouble("zoom", info.zoom)
            map.putString("source", "external")
            map.putString("unit", info.unit)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("UVC_ZOOM_INFO_ERROR", e)
        }
    }


    @ReactMethod
    fun requestLayout(reason: String, promise: Promise) {
        try {
            val view = UvcCameraRegistry.activeView
            if (view == null) {
                promise.resolve(false)
                return
            }

            view.post {
                try {
                    view.requestNativeLayout(reason)
                } catch (t: Throwable) {
                    Log.e(TAG, "requestLayout bridge failed", t)
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UVC_LAYOUT_ERROR", e)
        }
    }

    @ReactMethod
    fun restartPreview(reason: String, promise: Promise) {
        try {
            val view = UvcCameraRegistry.activeView
            if (view == null) {
                promise.resolve(false)
                return
            }

            view.post {
                try {
                    view.restartPreview(reason)
                } catch (t: Throwable) {
                    Log.e(TAG, "restartPreview bridge failed", t)
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UVC_RESTART_ERROR", e)
        }
    }

    @ReactMethod
    fun getPreviewStatus(promise: Promise) {
        try {
            val view = UvcCameraRegistry.activeView
            val map = Arguments.createMap()

            if (view == null) {
                map.putBoolean("activeView", false)
                map.putBoolean("cameraOpened", false)
                map.putBoolean("previewStarted", false)
                map.putBoolean("surfaceReady", false)
                map.putBoolean("isRecording", false)
                map.putBoolean("hasFrameCallback", false)
                map.putDouble("lastFrameTimestampMs", 0.0)
                map.putDouble("lastFrameAgeMs", -1.0)
                map.putBoolean("previewFirstFrameReceived", false)
                map.putBoolean("recorderFirstFrameReceived", false)
                map.putString("recordingFilePath", "")
                map.putBoolean("recordingFileExists", false)
                map.putDouble("recordingFileSize", 0.0)
                map.putDouble("recorderEncodedFrameCount", 0.0)
                map.putInt("viewWidth", 0)
                map.putInt("viewHeight", 0)
                map.putInt("previewWidth", 0)
                map.putInt("previewHeight", 0)
                promise.resolve(map)
                return
            }

            val status = view.getPreviewStatus()
            map.putBoolean("activeView", status.activeView)
            map.putBoolean("cameraOpened", status.cameraOpened)
            map.putBoolean("previewStarted", status.previewStarted)
            map.putBoolean("surfaceReady", status.surfaceReady)
            map.putBoolean("isRecording", status.isRecording)
            map.putBoolean("hasFrameCallback", status.hasFrameCallback)
            map.putDouble("lastFrameTimestampMs", status.lastFrameTimestampMs.toDouble())
            map.putDouble("lastFrameAgeMs", status.lastFrameAgeMs.toDouble())
            map.putBoolean("previewFirstFrameReceived", status.previewFirstFrameReceived)
            map.putBoolean("recorderFirstFrameReceived", status.recorderFirstFrameReceived)
            map.putString("recordingFilePath", status.recordingFilePath ?: "")
            map.putBoolean("recordingFileExists", status.recordingFileExists)
            map.putDouble("recordingFileSize", status.recordingFileSize.toDouble())
            map.putDouble("recorderEncodedFrameCount", status.recorderEncodedFrameCount.toDouble())
            map.putInt("viewWidth", status.viewWidth)
            map.putInt("viewHeight", status.viewHeight)
            map.putInt("previewWidth", status.previewWidth)
            map.putInt("previewHeight", status.previewHeight)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("UVC_PREVIEW_STATUS_ERROR", e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String?) {
        // Required for NativeEventEmitter compatibility on RN Android
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter compatibility on RN Android
    }

    private fun looksLikeVideoDevice(device: UsbDevice): Boolean {
        if (device.deviceClass == UsbConstants.USB_CLASS_VIDEO) return true

        for (i in 0 until device.interfaceCount) {
            val intf = device.getInterface(i)
            if (intf.interfaceClass == UsbConstants.USB_CLASS_VIDEO) {
                return true
            }
        }

        return false
    }
}
