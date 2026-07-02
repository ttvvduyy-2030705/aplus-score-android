package com.aplusscore.android.uvc

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Log
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.herohan.uvcapp.CameraException
import com.herohan.uvcapp.CameraHelper
import com.herohan.uvcapp.ICameraHelper
import com.herohan.uvcapp.VideoCapture
import com.serenegiant.usb.Size
import java.io.File
import java.lang.reflect.Proxy
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object UvcCameraRegistry {
    @Volatile
    var activeView: UvcCameraView? = null
}

class UvcCameraView(context: Context) : FrameLayout(context), TextureView.SurfaceTextureListener {
    companion object {
        private const val TAG = "UVC_VIEW"
        private const val DEFAULT_ZOOM = 1.0
        private const val PERCENT_MIN_ZOOM = 0.0
        private const val PERCENT_MAX_ZOOM = 100.0
        private const val RECORDING_START_TIMEOUT_MS = 12000L
        // Reject empty / truncated clips so the JS layer never receives a path
        // that points at a file the camera never actually finished writing.
        private const val MIN_VALID_RECORDING_BYTES = 128L * 1024L
        private const val MIN_USB_SHORT_REPLAY_BYTES = 8L * 1024L
        private const val FRAME_LOG_INTERVAL_MS = 2000L
        private const val PREVIEW_HEALTH_INTERVAL_MS = 3000L
        private const val PREVIEW_FROZEN_MS = 10000L
        private const val PREVIEW_RESTART_THROTTLE_MS = 8000L
        private const val MAX_USB_RECORD_WIDTH = 1280
        private const val MAX_USB_RECORD_HEIGHT = 720
        private const val USB_RECORD_BIT_RATE = 2 * 1024 * 1024
        private const val USB_RECORD_FRAME_RATE = 24
    }

    data class ZoomInfo(
        val supported: Boolean,
        val minZoom: Double,
        val maxZoom: Double,
        val zoom: Double,
        val unit: String,
    )

    data class PreviewStatus(
        val activeView: Boolean,
        val cameraOpened: Boolean,
        val previewStarted: Boolean,
        val surfaceReady: Boolean,
        val isRecording: Boolean,
        val hasFrameCallback: Boolean,
        val lastFrameTimestampMs: Long,
        val lastFrameAgeMs: Long,
        val previewFirstFrameReceived: Boolean,
        val recorderFirstFrameReceived: Boolean,
        val recordingFilePath: String?,
        val recordingFileExists: Boolean,
        val recordingFileSize: Long,
        val recorderEncodedFrameCount: Long,
        val viewWidth: Int,
        val viewHeight: Int,
        val previewWidth: Int,
        val previewHeight: Int,
    )

    private val previewView = TextureView(context)
    private val overlayContainer = FrameLayout(context)

    private var cameraHelper: ICameraHelper? = null
    private var isReleased = false
    private var isTextureReady = false
    private var isCameraOpened = false
    private var previewStarted = false
    private var currentSurface: Surface? = null
    private var currentSurfaceTexture: SurfaceTexture? = null
    private var selectedDeviceName: String? = null
    private var isRecording = false
    private var isRecordingStarting = false
    private var currentRecordingPath: String? = null
    private var lastSavedPath: String? = null
    private val pendingStopCallbacks = mutableListOf<(String?) -> Unit>()
    private var reconnectAttempts = 0
    private var reconnectRunnable: Runnable? = null
    private var healthRunnable: Runnable? = null
    private var recordingEvidenceRunnable: Runnable? = null
    private var lastRecordingEvidenceSize = 0L

    private var lastFrameTimestampMs = 0L
    private var lastFrameLogAtMs = 0L
    private var previewFirstFrameReceived = false
    private var recorderFirstFrameReceived = false
    private var recorderEncodedFrameCount = 0L
    private var lastPreviewStartMs = 0L
    private var lastPreviewRestartAtMs = 0L
    private var hasPreviewFrameCallback = false

    private var previewWidth = 16
    private var previewHeight = 9
    private var lastFixedSurfaceWidth = 0
    private var lastFixedSurfaceHeight = 0
    private var fullscreenMode = false
    private var sourceMode = "usb"
    private var layoutKey = ""
    private var fullscreenFrameLogged = false

    private var zoomSupported = false
    private var zoomMin = DEFAULT_ZOOM
    private var zoomMax = DEFAULT_ZOOM
    private var currentZoom = DEFAULT_ZOOM
    private var zoomUnit = "ratio"

    private val stateCallback = object : ICameraHelper.StateCallback {
        override fun onAttach(device: UsbDevice) {
            Log.e(TAG, "onAttach: ${device.deviceName}")
            Log.e(TAG, "[USBWebcam] device-detected source=usb device=${device.deviceName} vendorId=${device.vendorId} productId=${device.productId}")
            selectDeviceOnce(device)
        }

        override fun onDeviceOpen(device: UsbDevice, isFirstOpen: Boolean) {
            Log.e(TAG, "onDeviceOpen: ${device.deviceName}, first=$isFirstOpen")
            Log.e(TAG, "[USBWebcam] permission-granted source=usb device=${device.deviceName} first=$isFirstOpen")
            openCameraWithSafeRecordingSize(device)
        }

        override fun onCameraOpen(device: UsbDevice) {
            Log.e(TAG, "onCameraOpen: ${device.deviceName}")
            isCameraOpened = true
            reconnectAttempts = 0
            reconnectRunnable?.let { removeCallbacks(it) }
            reconnectRunnable = null
            lastFrameTimestampMs = 0L
            previewFirstFrameReceived = false
            recorderFirstFrameReceived = false
            recorderEncodedFrameCount = 0L
            hasPreviewFrameCallback = false

            try {
                // Some UVC devices expose 2K/4K as the default mode. UVCAndroid only knows the
                // real supported list after the camera is opened, so openCamera(safeSize) can be
                // ignored on a few devices. Force the active preview size down here, before
                // startPreview/startRecording, otherwise VideoCapture configures MediaCodec with
                // 2560x1440 and fails before the recorder ever receives a frame.
                ensureEncoderSafeActivePreviewSize("camera-open-before-preview")

                val size = cameraHelper?.previewSize
                if (size != null && size.width > 0 && size.height > 0) {
                    setPreviewSizeCandidate(size.width, size.height)
                    Log.e(
                        TAG,
                        "previewSize(raw) = ${size.width}x${size.height}, normalized=${previewWidth}x${previewHeight}",
                    )
                    Log.e(TAG, "[USBRecorder] encoder-active-size source=usb previewSize=${size.width}x${size.height} normalized=${previewWidth}x${previewHeight} maxSafe=${MAX_USB_RECORD_WIDTH}x${MAX_USB_RECORD_HEIGHT}")
                    post { updatePreviewLayoutAndTransform(width, height) }
                }
            } catch (t: Throwable) {
                Log.e(TAG, "read previewSize failed", t)
            }

            refreshZoomInfo()
            installPreviewFrameCallbackIfAvailable()
            maybeStartPreview()
            startPreviewHealthWatch()
        }

        override fun onCameraClose(device: UsbDevice) {
            Log.e(TAG, "onCameraClose: ${device.deviceName}")
            previewStarted = false
            isCameraOpened = false
            isRecording = false
            isRecordingStarting = false
            recorderFirstFrameReceived = false
            recorderEncodedFrameCount = 0L
            resetZoomState()
            flushPendingStopCallbacks(null)
            detachCurrentSurfaceFromHelper()
            scheduleReconnect("camera-close")
        }

        override fun onDeviceClose(device: UsbDevice) {
            Log.e(TAG, "onDeviceClose: ${device.deviceName}")
        }

        override fun onDetach(device: UsbDevice) {
            Log.e(TAG, "onDetach: ${device.deviceName}")
            previewStarted = false
            isCameraOpened = false
            isRecording = false
            isRecordingStarting = false
            recorderFirstFrameReceived = false
            recorderEncodedFrameCount = 0L
            resetZoomState()
            if (selectedDeviceName == device.deviceName) {
                selectedDeviceName = null
            }
            flushPendingStopCallbacks(null)
            detachCurrentSurfaceFromHelper()
            scheduleReconnect("device-detach")
        }

        override fun onCancel(device: UsbDevice) {
            Log.e(TAG, "onCancel: ${device.deviceName}")
        }

        override fun onError(device: UsbDevice, e: CameraException) {
            Log.e(TAG, "onError: ${device.deviceName}", e)
            if (selectedDeviceName == device.deviceName) {
                selectedDeviceName = null
            }
            previewStarted = false
            isCameraOpened = false
            detachCurrentSurfaceFromHelper()
            scheduleReconnect("camera-error")
        }
    }

    init {
        clipChildren = false
        clipToPadding = false
        isClickable = false
        isFocusable = false
        isFocusableInTouchMode = false

        previewView.isClickable = false
        previewView.isFocusable = false
        previewView.isFocusableInTouchMode = false
        previewView.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT,
        )
        previewView.surfaceTextureListener = this

        overlayContainer.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT,
        )
        overlayContainer.clipChildren = false
        overlayContainer.clipToPadding = false
        overlayContainer.isClickable = false
        overlayContainer.isFocusable = false
        overlayContainer.translationZ = 1000f

        addView(previewView)
        addView(overlayContainer)

        initCameraHelper()
    }

    fun setFullscreenMode(enabled: Boolean) {
        if (fullscreenMode == enabled) {
            return
        }

        fullscreenMode = enabled
        fullscreenFrameLogged = false
        if (enabled) {
            Log.e(TAG, "[USBWebcamFullscreen] open source=$sourceMode layoutKey=$layoutKey width=$width height=$height")
        } else {
            Log.e(TAG, "[USBWebcamFullscreen] close source=$sourceMode layoutKey=$layoutKey width=$width height=$height")
        }
        requestNativeLayout(if (enabled) "native-prop-fullscreen-open" else "native-prop-fullscreen-close")
        post { maybeStartPreview() }
    }

    fun setSourceMode(nextSourceMode: String) {
        sourceMode = nextSourceMode.ifBlank { "usb" }
    }

    fun setLayoutKey(nextLayoutKey: String) {
        if (layoutKey == nextLayoutKey) {
            return
        }
        layoutKey = nextLayoutKey
        requestNativeLayout("native-prop-layout-key-$nextLayoutKey")
    }

    fun addOverlayView(child: View, index: Int) {
        if (child.parent === overlayContainer) {
            return
        }

        (child.parent as? ViewGroup)?.removeView(child)
        overlayContainer.addView(child, index)
        child.bringToFront()
        overlayContainer.bringToFront()
        invalidate()
        requestLayout()
    }

    fun getOverlayChildCount(): Int = overlayContainer.childCount

    fun getOverlayChildAt(index: Int): View? = overlayContainer.getChildAt(index)

    fun removeOverlayChildAt(index: Int) {
        overlayContainer.removeViewAt(index)
    }

    fun removeAllOverlayViews() {
        overlayContainer.removeAllViews()
    }

    private fun initCameraHelper() {
        if (cameraHelper != null || isReleased) return

        try {
            Log.e(TAG, "initCameraHelper")
            val helper = CameraHelper()
            cameraHelper = helper
            helper.setStateCallback(stateCallback)

            try {
                val config = helper.videoCaptureConfig
                    .setAudioCaptureEnable(false)
                    .setBitRate(USB_RECORD_BIT_RATE)
                    .setVideoFrameRate(USB_RECORD_FRAME_RATE)
                    .setIFrameInterval(1)
                helper.setVideoCaptureConfig(config)
            } catch (t: Throwable) {
                Log.e(TAG, "setVideoCaptureConfig failed", t)
            }
        } catch (t: Throwable) {
            // Không để lỗi native UVC làm sập app khi vừa vào gameplay.
            Log.e(TAG, "initCameraHelper failed; UVC disabled for this view", t)
            cameraHelper = null
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        UvcCameraRegistry.activeView = this
        Log.e(TAG, "onAttachedToWindow")
        Log.e(TAG, "[USBPreview] mount source=usb")
        Log.e(TAG, "[USBSession] reuse source=usb activeView=${UvcCameraRegistry.activeView === this} helper=${cameraHelper != null}")

        // TextureView participates in the normal RN view hierarchy, so the USB preview
        // no longer floats above gameplay buttons or turns black when the layout changes.
        requestNativeLayout("attached")
        startPreviewHealthWatch()
        postDelayed({
            if (selectedDeviceName == null) {
                selectExistingVideoDevice()
            }
        }, 500)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updatePreviewLayoutAndTransform(w, h)
    }
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val measuredWidth = MeasureSpec.getSize(widthMeasureSpec)
        val measuredHeight = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(measuredWidth, measuredHeight)

        val childWidthSpec = MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY)
        val childHeightSpec = MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY)
        previewView.measure(childWidthSpec, childHeightSpec)
        overlayContainer.measure(childWidthSpec, childHeightSpec)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val viewWidth = right - left
        val viewHeight = bottom - top
        previewView.layout(0, 0, viewWidth, viewHeight)
        overlayContainer.layout(0, 0, viewWidth, viewHeight)
        updatePreviewLayoutAndTransform(viewWidth, viewHeight)
    }


    private fun selectExistingVideoDevice() {
        try {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            val device = usbManager.deviceList.values.firstOrNull { looksLikeVideoDevice(it) }
            if (device != null) {
                Log.e(TAG, "selectExistingVideoDevice: ${device.deviceName}")
                Log.e(TAG, "[USBWebcam] device-detected source=usb device=${device.deviceName} vendorId=${device.vendorId} productId=${device.productId} reason=existing-device")
                selectDeviceOnce(device)
            } else {
                Log.e(TAG, "selectExistingVideoDevice: none")
            }
        } catch (t: Throwable) {
            Log.e(TAG, "selectExistingVideoDevice failed", t)
        }
    }

    private fun selectDeviceOnce(device: UsbDevice) {
        if (selectedDeviceName == device.deviceName) {
            Log.e(TAG, "selectDeviceOnce skipped: already selected ${device.deviceName}")
            return
        }

        selectedDeviceName = device.deviceName
        try {
            cameraHelper?.selectDevice(device)
        } catch (t: Throwable) {
            Log.e(TAG, "selectDevice failed", t)
        }
    }


    private fun openCameraWithSafeRecordingSize(device: UsbDevice) {
        val helper = cameraHelper ?: return
        val safeSize = chooseSafeRecordingPreviewSize()

        try {
            if (safeSize != null) {
                Log.e(
                    TAG,
                    "[USBRecorder] encoder-config source=usb targetPreviewSize=${safeSize.width}x${safeSize.height}@${safeSize.fps} type=${safeSize.type} device=${device.deviceName} vendorId=${device.vendorId} productId=${device.productId}",
                )
                helper.openCamera(safeSize)
            } else {
                Log.e(
                    TAG,
                    "[USBRecorder] encoder-config source=usb targetPreviewSize=default reason=no-supported-size-list device=${device.deviceName} vendorId=${device.vendorId} productId=${device.productId}",
                )
                helper.openCamera()
            }
        } catch (t: Throwable) {
            Log.e(TAG, "openCamera failed", t)
        }
    }

    private fun ensureEncoderSafeActivePreviewSize(reason: String): Boolean {
        val helper = cameraHelper ?: return false
        val active = try { helper.previewSize } catch (t: Throwable) {
            Log.e(TAG, "[USBRecorder] active-preview-size read-failed source=usb reason=$reason", t)
            null
        }
        val activeWidth = active?.width ?: 0
        val activeHeight = active?.height ?: 0
        val activeTooLarge = activeWidth > 0 && activeHeight > 0 &&
            (max(activeWidth, activeHeight) > MAX_USB_RECORD_WIDTH || min(activeWidth, activeHeight) > MAX_USB_RECORD_HEIGHT)

        val safeSize = chooseSafeRecordingPreviewSize()
        if (safeSize == null) {
            Log.e(TAG, "[USBRecorder] encoder-safe-size source=usb unavailable reason=$reason active=${activeWidth}x${activeHeight}")
            return false
        }

        val alreadySafe = activeWidth == safeSize.width && activeHeight == safeSize.height
        if (!activeTooLarge && alreadySafe) {
            Log.e(TAG, "[USBRecorder] encoder-safe-size source=usb already-active=${activeWidth}x${activeHeight} reason=$reason")
            return true
        }

        return try {
            Log.e(
                TAG,
                "[USBRecorder] force-preview-size source=usb reason=$reason from=${activeWidth}x${activeHeight} to=${safeSize.width}x${safeSize.height}@${safeSize.fps} type=${safeSize.type}",
            )
            if (previewStarted) {
                try {
                    invokeNoArg(helper, "stopPreview")
                    Log.e(TAG, "[USBPreview] stop source=usb reason=force-preview-size-$reason")
                } catch (t: Throwable) {
                    Log.e(TAG, "[USBPreview] stop failed before force-preview-size reason=$reason", t)
                }
                previewStarted = false
            }
            helper.setPreviewSize(safeSize)
            setPreviewSizeCandidate(safeSize.width, safeSize.height)
            Log.e(TAG, "[USBRecorder] encoder-safe-size-applied source=usb size=${safeSize.width}x${safeSize.height}@${safeSize.fps} reason=$reason")
            true
        } catch (t: Throwable) {
            Log.e(TAG, "[USBRecorder] encoder-safe-size-apply-failed source=usb reason=$reason target=${safeSize.width}x${safeSize.height}", t)
            false
        }
    }

    private fun chooseSafeRecordingPreviewSize(): Size? {
        val helper = cameraHelper ?: return null
        val sizes = try {
            helper.supportedSizeList?.filterIsInstance<Size>() ?: emptyList()
        } catch (t: Throwable) {
            Log.e(TAG, "[USBRecorder] supported-sizes read-failed source=usb", t)
            emptyList()
        }

        val validSizes = sizes.filter { it.width > 0 && it.height > 0 }
        if (validSizes.isEmpty()) {
            Log.e(TAG, "[USBRecorder] supported-sizes empty source=usb")
            return null
        }

        val previewList = validSizes
            .take(30)
            .joinToString(separator = ",") { "${it.width}x${it.height}@${it.fps}/type=${it.type}" }
        Log.e(TAG, "[USBRecorder] supported-sizes source=usb $previewList")

        val preferred = listOf(
            1280 to 720,
            960 to 540,
            854 to 480,
            800 to 600,
            640 to 480,
            640 to 360,
        )

        preferred.forEach { (targetWidth, targetHeight) ->
            val exact = validSizes.firstOrNull { matchesSize(it, targetWidth, targetHeight) }
            if (exact != null) {
                Log.e(TAG, "[USBRecorder] encoder-safe-size source=usb selected=${exact.width}x${exact.height}@${exact.fps} reason=preferred-${targetWidth}x${targetHeight}")
                return exact
            }
        }

        val safe = validSizes
            .filter { max(it.width, it.height) <= MAX_USB_RECORD_WIDTH && min(it.width, it.height) <= MAX_USB_RECORD_HEIGHT }
            .sortedWith(
                compareByDescending<Size> { it.width * it.height }
                    .thenBy { fpsDistance(it) }
                    .thenBy { it.type }
            )
            .firstOrNull()

        if (safe != null) {
            Log.e(TAG, "[USBRecorder] encoder-safe-size source=usb selected=${safe.width}x${safe.height}@${safe.fps} reason=max-under-${MAX_USB_RECORD_WIDTH}x${MAX_USB_RECORD_HEIGHT}")
            return safe
        }

        val smallest = validSizes
            .sortedWith(
                compareBy<Size> { it.width * it.height }
                    .thenBy { fpsDistance(it) }
                    .thenBy { it.type }
            )
            .firstOrNull()

        if (smallest != null) {
            Log.e(TAG, "[USBRecorder] encoder-safe-size source=usb selected=${smallest.width}x${smallest.height}@${smallest.fps} reason=fallback-smallest")
        }
        return smallest
    }

    private fun matchesSize(size: Size, width: Int, height: Int): Boolean {
        return (size.width == width && size.height == height) ||
            (size.width == height && size.height == width)
    }

    private fun fpsDistance(size: Size): Int {
        val fps = if (size.fps > 0) size.fps else USB_RECORD_FRAME_RATE
        return kotlin.math.abs(fps - USB_RECORD_FRAME_RATE)
    }


    private fun maybeStartPreview() {
        val helper = cameraHelper
        val surfaceTexture = currentSurfaceTexture

        Log.e(
            TAG,
            "maybeStartPreview textureReady=$isTextureReady cameraOpened=$isCameraOpened previewStarted=$previewStarted surfaceTexture=${surfaceTexture != null}",
        )

        if (helper == null || surfaceTexture == null) return
        if (!isTextureReady || !isCameraOpened || previewStarted) return

        try {
            updatePreviewLayoutAndTransform(width, height)
            Log.e(TAG, "[USBPreview] start source=usb reason=maybeStartPreview")
            Log.e(TAG, "[USBWebcam] preview-start source=usb surfaceReady=true cameraOpened=$isCameraOpened fullscreen=$fullscreenMode width=$width height=$height")
            if (fullscreenMode) {
                Log.e(TAG, "[USBWebcamFullscreen] bind-surface source=usb reason=maybeStartPreview width=$width height=$height surfaceReady=true")
            }
            // UVCAndroid sample binds the TextureView SurfaceTexture to preview with addSurface(surfaceTexture, false).
            // Recording is started by CameraHelper.startRecording(); it must not be faked by marking the
            // preview surface as recorder-ready. Keeping the official preview surface binding avoids
            // splitting preview and recorder paths and also reduces rebind flicker.
            helper.addSurface(surfaceTexture, false)
            Log.e(TAG, "[USBWebcam] preview-surface-attached source=usb reason=preview-start mode=uvc-official-preview-surface")
            helper.startPreview()
            previewStarted = true
            lastPreviewStartMs = System.currentTimeMillis()
            startPreviewHealthWatch()
            Log.e(TAG, "[USBCamera] preview-success reason=preview-start")
            Log.e(TAG, "[USBWebcam] preview-ready source=usb touchPassThrough=true previewStarted=true cameraOpened=$isCameraOpened surfaceReady=$isTextureReady")
            Log.e(TAG, "[USBWebcam] source-ready-for-gameplay source=usb backend=uvc currentSource=external")
            Log.e(TAG, "[USBCamera] reconnect-success reason=preview-start")
            post { updatePreviewLayoutAndTransform(width, height) }
        } catch (t: Throwable) {
            Log.e(TAG, "startPreview failed", t)
        }
    }

    private fun detachCurrentSurfaceFromHelper() {
        val helper = cameraHelper ?: return
        val surfaceTexture = currentSurfaceTexture ?: return

        try {
            helper.removeSurface(surfaceTexture)
            Log.e(TAG, "surfaceTexture detached from helper")
        } catch (t: Throwable) {
            Log.e(TAG, "detachSurfaceTexture failed", t)
        }

        // Keep currentSurface/currentSurfaceTexture while TextureView is alive. Reconnect can reuse the
        // same SurfaceTexture without waiting for a new texture.
    }

    private fun scheduleReconnect(reason: String) {
        if (isReleased) return

        reconnectRunnable?.let { removeCallbacks(it) }
        val delays = longArrayOf(1000L, 2000L, 5000L)
        val delayMs = delays[reconnectAttempts.coerceAtMost(delays.lastIndex)]
        reconnectAttempts = (reconnectAttempts + 1).coerceAtMost(delays.lastIndex)

        Log.e(TAG, "reconnect scheduled reason=$reason delayMs=$delayMs")
        val task = Runnable {
            if (isReleased) return@Runnable
            try {
                if (cameraHelper == null) {
                    initCameraHelper()
                }
                selectedDeviceName = null
                selectExistingVideoDevice()
                maybeStartPreview()
            } catch (t: Throwable) {
                Log.e(TAG, "reconnect failed reason=$reason", t)
                scheduleReconnect("$reason-retry")
            }
        }
        reconnectRunnable = task
        postDelayed(task, delayMs)
    }

    private fun removeCurrentSurface() {
        val helper = cameraHelper
        val surfaceTexture = currentSurfaceTexture
        val surface = currentSurface

        if (helper != null && surfaceTexture != null) {
            try {
                helper.removeSurface(surfaceTexture)
                Log.e(TAG, "surfaceTexture removed")
            } catch (t: Throwable) {
                Log.e(TAG, "removeSurfaceTexture failed", t)
            }
        }

        try {
            surface?.release()
        } catch (_: Throwable) {
        }
        currentSurface = null
        currentSurfaceTexture = null
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

    private fun setPreviewSizeCandidate(rawWidth: Int, rawHeight: Int) {
        if (rawWidth <= 0 || rawHeight <= 0) return

        if (rawWidth >= rawHeight) {
            previewWidth = rawWidth
            previewHeight = rawHeight
        } else {
            previewWidth = rawHeight
            previewHeight = rawWidth
        }
    }

    fun requestNativeLayout(reason: String = "manual") {
        val params = layoutParams
        if (params != null && (params.width != LayoutParams.MATCH_PARENT || params.height != LayoutParams.MATCH_PARENT)) {
            params.width = LayoutParams.MATCH_PARENT
            params.height = LayoutParams.MATCH_PARENT
            layoutParams = params
        }

        val previewParams = previewView.layoutParams
        if (previewParams.width != LayoutParams.MATCH_PARENT || previewParams.height != LayoutParams.MATCH_PARENT) {
            previewParams.width = LayoutParams.MATCH_PARENT
            previewParams.height = LayoutParams.MATCH_PARENT
            previewView.layoutParams = previewParams
        }

        val overlayParams = overlayContainer.layoutParams
        if (overlayParams.width != LayoutParams.MATCH_PARENT || overlayParams.height != LayoutParams.MATCH_PARENT) {
            overlayParams.width = LayoutParams.MATCH_PARENT
            overlayParams.height = LayoutParams.MATCH_PARENT
            overlayContainer.layoutParams = overlayParams
        }

        if (!reason.startsWith("native-health-layout")) {
            Log.e(TAG, "[FullscreenCamera] native-request-layout reason=$reason width=$width height=$height")
            if (fullscreenMode || reason.contains("fullscreen")) {
                Log.e(TAG, "[USBWebcamFullscreen] bind-surface source=usb reason=$reason width=$width height=$height surfaceReady=${isTextureReady && currentSurface != null} previewStarted=$previewStarted")
            }
        }
        requestLayout()
        invalidate()
        previewView.requestLayout()
        previewView.invalidate()
        overlayContainer.requestLayout()
        overlayContainer.invalidate()
        post { updatePreviewLayoutAndTransform(width, height) }
    }

    fun restartPreview(reason: String = "manual"): Boolean {
        if (isReleased) return false
        if (isRecording) {
            Log.e(TAG, "[USBCamera] restart-preview skipped reason=$reason recording=true")
            return false
        }

        val helper = cameraHelper
        val surfaceTexture = currentSurfaceTexture
        if (helper == null || surfaceTexture == null) {
            Log.e(TAG, "[USBCamera] restart-preview skipped reason=$reason helper=${helper != null} surfaceTexture=${surfaceTexture != null}")
            if (helper == null) initCameraHelper()
            if (selectedDeviceName == null) selectExistingVideoDevice()
            return false
        }

        val now = System.currentTimeMillis()
        if (now - lastPreviewRestartAtMs < PREVIEW_RESTART_THROTTLE_MS) {
            Log.e(TAG, "[USBCamera] restart-preview throttled reason=$reason")
            requestNativeLayout("restart-throttled-$reason")
            return false
        }

        lastPreviewRestartAtMs = now
        Log.e(TAG, "[USBSession] restart reason=$reason source=usb")
        Log.e(TAG, "[USBCamera] restart-preview reason=$reason")

        return try {
            requestNativeLayout("restart-$reason")
            if (previewStarted) {
                try {
                    invokeNoArg(helper, "stopPreview")
                } catch (t: Throwable) {
                    Log.e(TAG, "stopPreview before restart failed", t)
                }
                try {
                    helper.removeSurface(surfaceTexture)
                } catch (t: Throwable) {
                    Log.e(TAG, "removeSurface before restart failed", t)
                }
            }

            previewStarted = false
            Log.e(TAG, "[USBPreview] stop source=usb reason=restart-$reason")
            Log.e(TAG, "[USBPreview] start source=usb reason=$reason")
            Log.e(TAG, "[USBWebcam] preview-start source=usb reason=$reason surfaceReady=true cameraOpened=$isCameraOpened fullscreen=$fullscreenMode")
            if (fullscreenMode) {
                Log.e(TAG, "[USBWebcamFullscreen] bind-surface source=usb reason=restart-$reason width=$width height=$height surfaceReady=true")
            }
            helper.addSurface(surfaceTexture, false)
            Log.e(TAG, "[USBWebcam] preview-surface-attached source=usb reason=restart-$reason mode=uvc-official-preview-surface")
            helper.startPreview()
            previewStarted = true
            lastPreviewStartMs = System.currentTimeMillis()
            Log.e(TAG, "[USBWebcam] preview-ready source=usb reason=$reason previewStarted=true")
            Log.e(TAG, "[USBCamera] preview-success reason=$reason")
            Log.e(TAG, "[USBCamera] reconnect-success reason=$reason")
            post { updatePreviewLayoutAndTransform(width, height) }
            true
        } catch (t: Throwable) {
            previewStarted = false
            Log.e(TAG, "[USBCamera] restart-preview failed reason=$reason", t)
            scheduleReconnect("restart-preview-$reason")
            false
        }
    }

    fun getPreviewStatus(): PreviewStatus {
        val now = System.currentTimeMillis()
        val lastFrameAge = if (lastFrameTimestampMs > 0L) now - lastFrameTimestampMs else -1L
        val recordingPath = currentRecordingPath ?: lastSavedPath
        val recordingFile = if (recordingPath.isNullOrBlank()) null else File(recordingPath)
        val recordingFileExists = try { recordingFile?.exists() == true } catch (_: Throwable) { false }
        val recordingFileSize = if (recordingFileExists) try { recordingFile?.length() ?: 0L } catch (_: Throwable) { 0L } else 0L
        if ((isRecording || isRecordingStarting) && recordingFileSize > 0L && !recorderFirstFrameReceived) {
            markRecorderFrameReceived("file-growth", recordingFileSize)
        }
        return PreviewStatus(
            activeView = UvcCameraRegistry.activeView === this,
            cameraOpened = isCameraOpened,
            previewStarted = previewStarted,
            surfaceReady = isTextureReady && currentSurface != null,
            isRecording = isRecording,
            hasFrameCallback = hasPreviewFrameCallback,
            lastFrameTimestampMs = lastFrameTimestampMs,
            lastFrameAgeMs = lastFrameAge,
            previewFirstFrameReceived = previewFirstFrameReceived,
            recorderFirstFrameReceived = recorderFirstFrameReceived,
            recordingFilePath = recordingPath,
            recordingFileExists = recordingFileExists,
            recordingFileSize = recordingFileSize,
            recorderEncodedFrameCount = recorderEncodedFrameCount,
            viewWidth = width,
            viewHeight = height,
            previewWidth = previewWidth,
            previewHeight = previewHeight,
        )
    }

    private fun updatePreviewLayoutAndTransform(viewWidth: Int = width, viewHeight: Int = height) {
        val actualViewWidth = if (viewWidth > 0) viewWidth else width
        val actualViewHeight = if (viewHeight > 0) viewHeight else height

        if (actualViewWidth <= 0 || actualViewHeight <= 0) {
            return
        }

        // TextureView phải dùng đúng kích thước khung RN cấp. Nó nằm trong view
        // hierarchy bình thường nên không che nút Bắt đầu, và fullscreen chỉ cần relayout.
        val previewParams = previewView.layoutParams
        if (previewParams.width != LayoutParams.MATCH_PARENT || previewParams.height != LayoutParams.MATCH_PARENT) {
            previewParams.width = LayoutParams.MATCH_PARENT
            previewParams.height = LayoutParams.MATCH_PARENT
            previewView.layoutParams = previewParams
        }

        val overlayParams = overlayContainer.layoutParams
        if (overlayParams.width != LayoutParams.MATCH_PARENT || overlayParams.height != LayoutParams.MATCH_PARENT) {
            overlayParams.width = LayoutParams.MATCH_PARENT
            overlayParams.height = LayoutParams.MATCH_PARENT
            overlayContainer.layoutParams = overlayParams
        }

        if (lastFixedSurfaceWidth != actualViewWidth || lastFixedSurfaceHeight != actualViewHeight) {
            lastFixedSurfaceWidth = actualViewWidth
            lastFixedSurfaceHeight = actualViewHeight
            Log.e(TAG, "[USBWebcam] preview-layout-fixed width=$actualViewWidth height=$actualViewHeight viewType=TextureView")
        }

        overlayContainer.bringToFront()
        previewView.requestLayout()
        overlayContainer.requestLayout()
        invalidate()
    }

    private fun markFrameReceived(reason: String) {
        val now = System.currentTimeMillis()
        val wasPreviewFirstFrameReceived = previewFirstFrameReceived
        lastFrameTimestampMs = now
        previewFirstFrameReceived = true
        if (!wasPreviewFirstFrameReceived) {
            Log.e(TAG, "[USBWebcam] preview-first-frame source=usb timestamp=$now reason=$reason")
        }
        if ((isRecording || isRecordingStarting) && !recorderFirstFrameReceived) {
            val path = currentRecordingPath
            val file = if (path.isNullOrBlank()) null else File(path)
            val exists = try { file?.exists() == true } catch (_: Throwable) { false }
            val size = if (exists) try { file?.length() ?: 0L } catch (_: Throwable) { 0L } else 0L
            if (size > 0L) {
                markRecorderFrameReceived("preview-frame-with-recording-file", size)
            } else {
                Log.e(TAG, "[USBReplay] not-ready reason=preview-has-frame-but-recorder-has-no-frame source=usb recording=true outputPath=$path fileExists=$exists fileSize=$size")
            }
        }
        if (now - lastFrameLogAtMs >= FRAME_LOG_INTERVAL_MS || reason != "preview-frame") {
            lastFrameLogAtMs = now
            Log.e(TAG, "[USBCamera] frame-received timestamp=$now reason=$reason")
        }
    }

    private fun markRecorderFrameReceived(reason: String, fileSize: Long) {
        if (!recorderFirstFrameReceived) {
            recorderFirstFrameReceived = true
            recorderEncodedFrameCount = 1L
            Log.e(TAG, "[USBRecorder] first-frame source=usb reason=$reason outputPath=$currentRecordingPath fileSize=$fileSize")
            Log.e(TAG, "[USBReplay] first-frame source=usb outputPath=$currentRecordingPath fileSize=$fileSize")
        } else {
            recorderEncodedFrameCount += 1L
        }
        Log.e(TAG, "[USBRecorder] encoded-frame count=$recorderEncodedFrameCount source=usb outputPath=$currentRecordingPath fileSize=$fileSize")
    }

    private fun ensureRecordablePreviewSurfaceForRecording(reason: String): Boolean {
        val helper = cameraHelper ?: return false
        val surfaceTexture = currentSurfaceTexture ?: return false

        // UVCAndroid records through CameraHelper.startRecording(). The preview SurfaceTexture
        // must stay bound exactly once like the official sample; repeatedly remove/add it when
        // starting the recorder causes visible flicker and can detach the active UVC stream.
        if (previewStarted) {
            Log.e(TAG, "[USBRecorder] attach-output success=true source=usb reason=$reason mode=reuse-uvc-official-preview-surface")
            return true
        }

        return try {
            helper.addSurface(surfaceTexture, false)
            Log.e(TAG, "[USBRecorder] attach-output success=true source=usb reason=$reason mode=initial-uvc-official-preview-surface")
            true
        } catch (t: Throwable) {
            Log.e(TAG, "[USBRecorder] attach-output success=false source=usb reason=$reason", t)
            false
        }
    }

    private fun startRecordingEvidenceWatch(reason: String) {
        stopRecordingEvidenceWatch()
        lastRecordingEvidenceSize = 0L
        val task = object : Runnable {
            override fun run() {
                if (isReleased || (!isRecording && !isRecordingStarting)) {
                    recordingEvidenceRunnable = null
                    return
                }

                val path = currentRecordingPath
                val file = if (path.isNullOrBlank()) null else File(path)
                val exists = try { file?.exists() == true } catch (_: Throwable) { false }
                val size = if (exists) try { file?.length() ?: 0L } catch (_: Throwable) { 0L } else 0L
                if (size > 0L) {
                    if (!recorderFirstFrameReceived || size != lastRecordingEvidenceSize) {
                        lastRecordingEvidenceSize = size
                        markRecorderFrameReceived("recording-file-growth-$reason", size)
                    }
                } else if (previewFirstFrameReceived) {
                    Log.e(TAG, "[USBReplay] not-ready reason=preview-has-frame-but-recorder-has-no-frame source=usb outputPath=$path fileExists=$exists fileSize=$size")
                }

                postDelayed(this, 300L)
            }
        }
        recordingEvidenceRunnable = task
        postDelayed(task, 300L)
    }

    private fun stopRecordingEvidenceWatch() {
        recordingEvidenceRunnable?.let { removeCallbacks(it) }
        recordingEvidenceRunnable = null
    }

    private fun startPreviewHealthWatch() {
        if (healthRunnable != null || isReleased) return

        val task = object : Runnable {
            override fun run() {
                if (isReleased) {
                    healthRunnable = null
                    return
                }

                val now = System.currentTimeMillis()
                val lastFrameAgeMs = if (lastFrameTimestampMs > 0L) now - lastFrameTimestampMs else -1L
                val surfaceReady = isTextureReady && currentSurface != null
                val shouldRestartStoppedPreview = !isRecording && isCameraOpened && surfaceReady && !previewStarted
                val shouldRestartFrozenPreview = !isRecording && previewStarted && hasPreviewFrameCallback && lastFrameAgeMs > PREVIEW_FROZEN_MS

                if (shouldRestartStoppedPreview || shouldRestartFrozenPreview) {
                    Log.e(TAG, "[USBCamera] preview-frozen detected lastFrameAgeMs=$lastFrameAgeMs previewStarted=$previewStarted hasFrameCallback=$hasPreviewFrameCallback")
                    restartPreview(if (shouldRestartFrozenPreview) "native-frame-watchdog" else "native-preview-stopped")
                } else {
                    requestNativeLayout("native-health-layout")
                }

                postDelayed(this, PREVIEW_HEALTH_INTERVAL_MS)
            }
        }

        healthRunnable = task
        postDelayed(task, PREVIEW_HEALTH_INTERVAL_MS)
    }

    private fun stopPreviewHealthWatch() {
        healthRunnable?.let { removeCallbacks(it) }
        healthRunnable = null
    }

    private fun installPreviewFrameCallbackIfAvailable() {
        val helper = cameraHelper ?: return
        if (hasPreviewFrameCallback) return

        val callbackMethodNames = setOf(
            "setPreviewDataCallBack",
            "setPreviewDataCallback",
            "addPreviewDataCallback",
            "setFrameCallback",
            "setFrameListener",
            "setPreviewFrameCallback",
        )

        val method = helper.javaClass.methods.firstOrNull { method ->
            callbackMethodNames.contains(method.name) &&
                method.parameterTypes.size == 1 &&
                method.parameterTypes[0].isInterface
        } ?: return

        val callbackType = method.parameterTypes[0]
        val proxy = Proxy.newProxyInstance(
            callbackType.classLoader,
            arrayOf(callbackType),
        ) { _, invokedMethod, args ->
            when (invokedMethod.name) {
                "toString" -> "AplusUvcPreviewFrameCallback"
                "hashCode" -> System.identityHashCode(this)
                "equals" -> args?.firstOrNull() === this
                else -> {
                    markFrameReceived("preview-frame")
                    defaultReturnValue(invokedMethod.returnType)
                }
            }
        }

        try {
            method.invoke(helper, proxy)
            hasPreviewFrameCallback = true
            Log.e(TAG, "[USBCamera] preview-frame-callback-installed method=${method.name}")
        } catch (t: Throwable) {
            hasPreviewFrameCallback = false
            Log.e(TAG, "[USBCamera] preview-frame-callback-install-failed method=${method.name}", t)
        }
    }

    private fun defaultReturnValue(type: Class<*>): Any? {
        return when (type) {
            java.lang.Boolean.TYPE -> false
            java.lang.Byte.TYPE -> 0.toByte()
            java.lang.Short.TYPE -> 0.toShort()
            java.lang.Integer.TYPE -> 0
            java.lang.Long.TYPE -> 0L
            java.lang.Float.TYPE -> 0f
            java.lang.Double.TYPE -> 0.0
            java.lang.Character.TYPE -> 0.toChar()
            java.lang.Void.TYPE -> null
            Void.TYPE -> null
            else -> null
        }
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        Log.e(TAG, "surfaceTextureAvailable: ${width}x${height}")
        if (fullscreenMode) {
            Log.e(TAG, "[USBWebcamFullscreen] bind-surface source=usb reason=surface-available width=$width height=$height")
        }
        currentSurfaceTexture = surface
        currentSurface = Surface(surface)
        isTextureReady = true
        updatePreviewLayoutAndTransform(width, height)
        maybeStartPreview()
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
        Log.e(TAG, "surfaceTextureSizeChanged: ${width}x${height}")
        if (fullscreenMode) {
            Log.e(TAG, "[USBWebcamFullscreen] bind-surface source=usb reason=surface-size-changed width=$width height=$height")
        }
        updatePreviewLayoutAndTransform(width, height)
        maybeStartPreview()
    }

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        Log.e(TAG, "surfaceTextureDestroyed")
        isTextureReady = false
        previewStarted = false
        removeCurrentSurface()
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {
        markFrameReceived("preview-frame")
        if (fullscreenMode && !fullscreenFrameLogged) {
            fullscreenFrameLogged = true
            Log.e(TAG, "[USBWebcamFullscreen] frame-visible source=usb width=$width height=$height lastFrameAgeMs=0")
        }
    }

    fun startRecording(outputPath: String, callback: (Boolean, String?) -> Unit) {
        startRecordingWhenReady(outputPath, callback, System.currentTimeMillis() + RECORDING_START_TIMEOUT_MS)
    }

    private fun startRecordingWhenReady(outputPath: String, callback: (Boolean, String?) -> Unit, deadlineMs: Long) {
        Log.e(TAG, "[USBWebcamRecorder] start-request source=usb outputPath=$outputPath")
        Log.e(TAG, "[USBWebcamRecorder] outputPath=$outputPath")
        val helper = cameraHelper
        if (helper == null) {
            Log.e(TAG, "[USBWebcam] recording-start-failed reason=camera-helper-null outputPath=$outputPath")
            callback(false, "camera-helper-null")
            return
        }

        if (isRecording || isRecordingStarting) {
            Log.e(TAG, "[USBWebcamRecorder] start-success source=usb reason=already-active outputPath=${currentRecordingPath ?: outputPath}")
            callback(true, null)
            return
        }

        if (!isCameraOpened || !previewStarted) {
            val now = System.currentTimeMillis()
            if (now >= deadlineMs) {
                Log.e(TAG, "[USBWebcam] recording-start-failed reason=camera-not-ready-timeout opened=$isCameraOpened previewStarted=$previewStarted outputPath=$outputPath")
                callback(false, "camera-not-ready-timeout")
                return
            }
            Log.e(
                TAG,
                "[USBWebcam] recording-wait-preview opened=$isCameraOpened previewStarted=$previewStarted outputPath=$outputPath remainingMs=${deadlineMs - now}",
            )
            maybeStartPreview()
            postDelayed({
                if (!isRecording && !isRecordingStarting) {
                    startRecordingWhenReady(outputPath, callback, deadlineMs)
                }
            }, 650)
            return
        }

        try {
            val file = File(outputPath)
            file.parentFile?.mkdirs()
            currentRecordingPath = file.absolutePath
            lastSavedPath = null
            recorderFirstFrameReceived = false
            recorderEncodedFrameCount = 0L
            isRecordingStarting = true

            installPreviewFrameCallbackIfAvailable()
            ensureEncoderSafeActivePreviewSize("recording-start")
            val attached = ensureRecordablePreviewSurfaceForRecording("recording-start")
            Log.e(TAG, "[USBRecorder] frame-callback-enabled success=$hasPreviewFrameCallback source=usb")
            if (!attached) {
                Log.e(TAG, "[USBRecorder] attach-surface warning source=usb reason=recording-start-no-current-surface")
            }

            val options = VideoCapture.OutputFileOptions.Builder(file).build()
            var startNotified = false
            val startTimeout = Runnable {
                if (!startNotified) {
                    startNotified = true
                    isRecording = false
                    isRecordingStarting = false
                    Log.e(TAG, "[USBWebcam] recording-start-failed reason=recording-start-timeout outputPath=$outputPath")
                    try {
                        helper.stopRecording()
                    } catch (t: Throwable) {
                        Log.e(TAG, "UVC_VIEW stop after start-timeout failed", t)
                    }
                    callback(false, "recording-start-timeout")
                }
            }
            postDelayed(startTimeout, RECORDING_START_TIMEOUT_MS)

            helper.startRecording(options, object : VideoCapture.OnVideoCaptureCallback {
                override fun onStart() {
                    removeCallbacks(startTimeout)
                    Log.e(TAG, "[USBWebcamRecorder] start-success source=usb outputPath=$outputPath")
                    Log.e(TAG, "[USBRecorder] start-success source=usb outputPath=$outputPath previewFirstFrame=$previewFirstFrameReceived recorderFirstFrame=$recorderFirstFrameReceived")
                    isRecording = true
                    isRecordingStarting = false
                    startRecordingEvidenceWatch("onStart")
                    if (!startNotified) {
                        startNotified = true
                        callback(true, null)
                    }
                }

                override fun onVideoSaved(outputFileResults: VideoCapture.OutputFileResults) {
                    removeCallbacks(startTimeout)
                    val savedPath = currentRecordingPath ?: outputPath
                    val fileSize = try { File(savedPath).length() } catch (_: Throwable) { 0L }
                    val exists = try { File(savedPath).exists() } catch (_: Throwable) { false }
                    if (exists && fileSize > 0L) {
                        markRecorderFrameReceived("video-saved", fileSize)
                    }
                    Log.e(TAG, "[USBWebcamRecorder] segment-finalized exists=$exists size=$fileSize outputPath=$savedPath usable=${exists && fileSize >= MIN_USB_SHORT_REPLAY_BYTES} shortReplayMinBytes=$MIN_USB_SHORT_REPLAY_BYTES")
                    stopRecordingEvidenceWatch()
                    isRecording = false
                    isRecordingStarting = false
                    lastSavedPath = savedPath
                    flushPendingStopCallbacks(savedPath)
                }

                override fun onError(
                    videoCaptureError: Int,
                    message: String,
                    cause: Throwable?,
                ) {
                    removeCallbacks(startTimeout)
                    Log.e(TAG, "[USBWebcamRecorder] error code=$videoCaptureError message=$message outputPath=$outputPath", cause)
                    stopRecordingEvidenceWatch()
                    isRecording = false
                    isRecordingStarting = false
                    if (!startNotified) {
                        startNotified = true
                        callback(false, message)
                    }
                    flushPendingStopCallbacks(null)
                }
            })
        } catch (t: Throwable) {
            Log.e(TAG, "[USBWebcam] recording-start-failed outputPath=$outputPath", t)
            stopRecordingEvidenceWatch()
            isRecording = false
            isRecordingStarting = false
            callback(false, t.message ?: "start-recording-failed")
        }
    }

    fun stopRecording(callback: (String?) -> Unit) {
        Log.e(TAG, "[USBWebcamRecorder] stop-request source=usb")
        val helper = cameraHelper
        if (helper == null) {
            Log.e(TAG, "[USBWebcam] recording-stop failed reason=camera-helper-null")
            stopRecordingEvidenceWatch()
            callback(resolveStopResultPath(lastSavedPath))
            return
        }

        if (!isRecording && !isRecordingStarting) {
            stopRecordingEvidenceWatch()
            val resolved = resolveStopResultPath(lastSavedPath)
            Log.e(TAG, "[USBWebcam] recording-stop not-active resolved=$resolved")
            callback(resolved)
            return
        }

        pendingStopCallbacks.add(callback)
        try {
            helper.stopRecording()
        } catch (t: Throwable) {
            Log.e(TAG, "[USBWebcam] recording-stop failed", t)
            stopRecordingEvidenceWatch()
            isRecording = false
            isRecordingStarting = false
            flushPendingStopCallbacks(null)
        }
    }

    fun getZoomInfo(): ZoomInfo {
        return refreshZoomInfo()
    }

    fun setZoom(zoom: Double): Double {
        val control = getUvcControl()
        if (control == null) {
            resetZoomState()
            return currentZoom
        }

        val latest = refreshZoomInfo()
        if (!latest.supported || latest.maxZoom <= latest.minZoom) {
            return currentZoom
        }

        val requestedZoom = zoom.coerceIn(latest.minZoom, latest.maxZoom)

        try {
            val absoluteSetter = findSingleArgMethod(control, "setZoomAbsolute")
            val percentSetter = findSingleArgMethod(control, "setZoomAbsolutePercent")

            if (latest.unit == "absolute" && absoluteSetter != null) {
                invokeIntMethod(control, absoluteSetter, requestedZoom.roundToInt().coerceIn(
                    latest.minZoom.roundToInt(),
                    latest.maxZoom.roundToInt(),
                ))
                currentZoom = requestedZoom
                return refreshZoomInfo().zoom
            }

            if (percentSetter != null) {
                val percentValue = when (latest.unit) {
                    "absolute" -> absoluteToPercent(requestedZoom, latest.minZoom, latest.maxZoom)
                    else -> requestedZoom.roundToInt().coerceIn(
                        PERCENT_MIN_ZOOM.roundToInt(),
                        PERCENT_MAX_ZOOM.roundToInt(),
                    )
                }
                invokeIntMethod(control, percentSetter, percentValue)
                currentZoom = requestedZoom
                return refreshZoomInfo().zoom
            }

            return currentZoom
        } catch (t: Throwable) {
            Log.e(TAG, "setZoom failed", t)
            return currentZoom
        }
    }

    private fun refreshZoomInfo(): ZoomInfo {
        val control = getUvcControl()
        if (control == null) {
            resetZoomState()
            Log.e(TAG, "[CameraCapability] source=usb zoomSupported=false")
            Log.e(TAG, "[CameraCapability] source=usb maxZoom=1")
            return unsupportedZoomInfo()
        }

        return try {
            val enabled = readBoolean(control, "isZoomAbsoluteEnable")
            if (!enabled) {
                resetZoomState()
                Log.e(TAG, "[CameraCapability] source=usb zoomSupported=false")
                Log.e(TAG, "[CameraCapability] source=usb maxZoom=1")
                return unsupportedZoomInfo()
            }

            val limits = readZoomLimits(control)
            val absolute = readInt(control, "getZoomAbsolute")
            val percent = readInt(control, "getZoomAbsolutePercent")
            val canSetAbsolute = findSingleArgMethod(control, "setZoomAbsolute") != null
            val canSetPercent = findSingleArgMethod(control, "setZoomAbsolutePercent") != null

            if (limits != null && limits.second > limits.first && canSetAbsolute) {
                val minValue = limits.first.toDouble()
                val maxValue = limits.second.toDouble()

                // Many low-cost USB webcams expose UVC zoom controls in raw hardware
                // units (for example 0..200 or 0..100 percent) even when optical zoom
                // is not actually supported. Showing those raw values as x200 is wrong.
                // Only accept a sane ratio-like absolute range. Everything else is
                // treated as unsupported so the UI hides/disables zoom instead of
                // presenting fake x50/x100/x200 controls.
                val saneRatioRange = minValue >= 1.0 && maxValue <= 20.0
                if (saneRatioRange) {
                    zoomSupported = true
                    zoomMin = minValue
                    zoomMax = maxValue
                    zoomUnit = "ratio"
                    currentZoom = when {
                        absolute != null -> absolute.toDouble().coerceIn(zoomMin, zoomMax)
                        else -> currentZoom.coerceIn(zoomMin, zoomMax)
                    }
                    Log.e(TAG, "[USBWebcam] zoom-capability supported=true min=$zoomMin max=$zoomMax current=$currentZoom unit=$zoomUnit")
                    Log.e(TAG, "[CameraCapability] source=usb zoomSupported=true")
                    Log.e(TAG, "[CameraCapability] source=usb maxZoom=$zoomMax")
                    return ZoomInfo(true, zoomMin, zoomMax, currentZoom, zoomUnit)
                }

                Log.e(TAG, "[USBWebcam] zoom-capability supported=false reason=raw-uvc-range-not-ratio min=$minValue max=$maxValue absolute=$absolute percent=$percent")
            }

            if (canSetPercent && percent != null) {
                Log.e(TAG, "[USBWebcam] zoom-capability supported=false reason=percent-control-is-not-real-ratio percent=$percent")
            }

            resetZoomState()
            Log.e(TAG, "[USBWebcam] zoom-capability supported=false min=$zoomMin max=$zoomMax current=$currentZoom unit=$zoomUnit")
            Log.e(TAG, "[CameraCapability] source=usb zoomSupported=false")
            Log.e(TAG, "[CameraCapability] source=usb maxZoom=1")
            unsupportedZoomInfo()
        } catch (t: Throwable) {
            Log.e(TAG, "refreshZoomInfo failed", t)
            resetZoomState()
            Log.e(TAG, "[CameraCapability] source=usb zoomSupported=false")
            Log.e(TAG, "[CameraCapability] source=usb maxZoom=1")
            unsupportedZoomInfo()
        }
    }

    private fun unsupportedZoomInfo(): ZoomInfo = ZoomInfo(false, DEFAULT_ZOOM, DEFAULT_ZOOM, DEFAULT_ZOOM, "ratio")

    private fun absoluteToPercent(value: Double, min: Double, max: Double): Int {
        if (max <= min) return PERCENT_MIN_ZOOM.roundToInt()
        return (((value.coerceIn(min, max) - min) / (max - min)) * 100.0)
            .roundToInt()
            .coerceIn(PERCENT_MIN_ZOOM.roundToInt(), PERCENT_MAX_ZOOM.roundToInt())
    }

    private fun percentToAbsolute(percent: Int, min: Double, max: Double): Double {
        if (max <= min) return min
        val ratio = (percent.coerceIn(0, 100) / 100.0).coerceIn(0.0, 1.0)
        return (min + ratio * (max - min)).coerceIn(min, max)
    }

    private fun readZoomLimits(control: Any): Pair<Int, Int>? {
        val raw = invokeNoArg(control, "updateZoomAbsoluteLimit") ?: return null
        val values = when (raw) {
            is IntArray -> raw.toList()
            is Array<*> -> raw.filterIsInstance<Number>().map { it.toInt() }
            is List<*> -> raw.filterIsInstance<Number>().map { it.toInt() }
            else -> emptyList()
        }

        if (values.size < 2) {
            return null
        }

        val min = values[0]
        val max = values[1]
        val ordered = if (max >= min) min to max else max to min
        return if (ordered.second > ordered.first) ordered else null
    }

    private fun getUvcControl(): Any? {
        val helper = cameraHelper ?: return null
        return try {
            invokeNoArg(helper, "getUVCControl")
        } catch (t: Throwable) {
            Log.e(TAG, "getUVCControl failed", t)
            null
        }
    }

    private fun invokeNoArg(target: Any, methodName: String): Any? {
        val method = target.javaClass.methods.firstOrNull {
            it.name == methodName && it.parameterTypes.isEmpty()
        } ?: return null
        return method.invoke(target)
    }

    private fun invokeSingleArg(target: Any, methodName: String, arg: Any): Any? {
        val method = target.javaClass.methods.firstOrNull {
            it.name == methodName && it.parameterTypes.size == 1
        } ?: return null
        return method.invoke(target, arg)
    }

    private fun findSingleArgMethod(target: Any, methodName: String) =
        target.javaClass.methods.firstOrNull {
            it.name == methodName && it.parameterTypes.size == 1
        }

    private fun invokeIntMethod(target: Any, method: java.lang.reflect.Method, value: Int): Any? {
        val parameterType = method.parameterTypes.firstOrNull()
        val arg: Any = when (parameterType) {
            java.lang.Short.TYPE,
            java.lang.Short::class.java -> value.toShort()
            java.lang.Long.TYPE,
            java.lang.Long::class.java -> value.toLong()
            else -> value
        }
        return method.invoke(target, arg)
    }

    private fun readBoolean(target: Any, methodName: String): Boolean {
        return (invokeNoArg(target, methodName) as? Boolean) ?: false
    }

    private fun readInt(target: Any, methodName: String): Int? {
        return (invokeNoArg(target, methodName) as? Number)?.toInt()
    }

    private fun resetZoomState() {
        zoomSupported = false
        zoomMin = DEFAULT_ZOOM
        zoomMax = DEFAULT_ZOOM
        currentZoom = DEFAULT_ZOOM
        zoomUnit = "ratio"
    }

    // Returns the path only when it points at a real, large-enough video file.
    // Otherwise returns null so the JS layer never receives a fake/empty path.
    private fun resolveStopResultPath(rawPath: String?): String? {
        if (rawPath.isNullOrBlank()) {
            Log.e(TAG, "UVC_STOP_RESULT path=null exists=false size=0")
            return null
        }

        val file = File(rawPath)
        val exists = try { file.exists() } catch (_: Throwable) { false }
        val size = if (exists) try { file.length() } catch (_: Throwable) { 0L } else 0L
        val usable = exists && size >= MIN_USB_SHORT_REPLAY_BYTES

        if (exists && size > 0L) {
            markRecorderFrameReceived("stop-result", size)
        }

        Log.e(TAG, "UVC_STOP_RESULT path=$rawPath exists=$exists size=$size usable=$usable shortReplayMinBytes=$MIN_USB_SHORT_REPLAY_BYTES")

        return if (usable) rawPath else null
    }

    private fun flushPendingStopCallbacks(path: String?) {
        if (pendingStopCallbacks.isEmpty()) return

        val resolved = resolveStopResultPath(path)
        val callbacks = pendingStopCallbacks.toList()
        pendingStopCallbacks.clear()
        callbacks.forEach { cb ->
            try {
                cb(resolved)
            } catch (_: Exception) {
            }
        }
    }

    fun releaseCamera() {
        if (isReleased) return
        isReleased = true

        Log.e(TAG, "releaseCamera")
        Log.e(TAG, "[USBPreview] unmount source=usb")
        stopPreviewHealthWatch()
        stopRecordingEvidenceWatch()
        reconnectRunnable?.let { removeCallbacks(it) }
        reconnectRunnable = null
        try {
            removeCurrentSurface()
        } catch (_: Exception) {
        }

        try {
            cameraHelper?.release()
        } catch (t: Throwable) {
            Log.e(TAG, "release failed", t)
        } finally {
            cameraHelper = null
            isRecording = false
            isRecordingStarting = false
            recorderFirstFrameReceived = false
            recorderEncodedFrameCount = 0L
            resetZoomState()
            flushPendingStopCallbacks(null)
        }
    }

    override fun onDetachedFromWindow() {
        Log.e(TAG, "onDetachedFromWindow")
        if (UvcCameraRegistry.activeView === this) {
            UvcCameraRegistry.activeView = null
        }
        releaseCamera()
        super.onDetachedFromWindow()
    }
}
