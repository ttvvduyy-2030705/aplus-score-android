package com.aplusscore.android.uvc

import android.view.View
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class UvcCameraViewManager : ViewGroupManager<UvcCameraView>() {
    override fun getName(): String = "UvcCameraView"

    override fun createViewInstance(reactContext: ThemedReactContext): UvcCameraView {
        return UvcCameraView(reactContext)
    }

    @ReactProp(name = "fullscreenMode", defaultBoolean = false)
    fun setFullscreenMode(view: UvcCameraView, fullscreenMode: Boolean) {
        view.setFullscreenMode(fullscreenMode)
    }

    @ReactProp(name = "sourceMode")
    fun setSourceMode(view: UvcCameraView, sourceMode: String?) {
        view.setSourceMode(sourceMode ?: "usb")
    }

    @ReactProp(name = "layoutKey")
    fun setLayoutKey(view: UvcCameraView, layoutKey: String?) {
        view.setLayoutKey(layoutKey ?: "")
    }

    override fun addView(parent: UvcCameraView, child: View, index: Int) {
        parent.addOverlayView(child, index)
    }

    override fun getChildCount(parent: UvcCameraView): Int {
        return parent.getOverlayChildCount()
    }

    override fun getChildAt(parent: UvcCameraView, index: Int): View? {
        return parent.getOverlayChildAt(index)
    }

    override fun removeViewAt(parent: UvcCameraView, index: Int) {
        parent.removeOverlayChildAt(index)
    }

    override fun removeAllViews(parent: UvcCameraView) {
        parent.removeAllOverlayViews()
    }

    override fun needsCustomLayoutForChildren(): Boolean = false

    override fun onDropViewInstance(view: UvcCameraView) {
        view.releaseCamera()
        super.onDropViewInstance(view)
    }
}
