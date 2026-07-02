// android/app/src/main/java/com/billiards_management/aplus/score/MainActivity.kt

package com.aplusscore.android

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import com.billiards_management.RemoteControl.RemoteControlModule
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  companion object {
    private const val NEW_GAME_HOLD_DURATION_MS = 2_000L
    private const val REMOTE_TAG = "REMOTE_KEY"
    private const val BT_TAG = "REMOTE_BT"
  }

  private var mediaSession: MediaSession? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var pendingNewGameHoldRunnable: Runnable? = null
  private var heldNewGameKeyCode: Int? = null
  private var newGameHoldTriggered = false
  private var bluetoothReceiverRegistered = false

  private val bluetoothConnectionReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        val action = intent?.action ?: return
        logBluetoothSystemEvent(action, intent)
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    Log.d(REMOTE_TAG, "MainActivity onCreate screen=${RemoteControlModule.getCurrentScreen()}")
    setupRemoteMediaSession()
    registerBluetoothDiagnosticsReceiver()
  }

  override fun onResume() {
    super.onResume()
    mediaSession?.isActive = true
    Log.d(REMOTE_TAG, "MainActivity onResume inputEnabled=${RemoteControlModule.isInputEnabled()} screen=${RemoteControlModule.getCurrentScreen()}")
  }

  override fun onPause() {
    Log.d(REMOTE_TAG, "MainActivity onPause inputEnabled=${RemoteControlModule.isInputEnabled()} screen=${RemoteControlModule.getCurrentScreen()}")
    super.onPause()
  }

  override fun onDestroy() {
    Log.d(REMOTE_TAG, "MainActivity onDestroy screen=${RemoteControlModule.getCurrentScreen()}")
    clearPendingNewGameHold(resetTriggered = true)
    unregisterBluetoothDiagnosticsReceiver()
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "billiards_management"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  private fun registerBluetoothDiagnosticsReceiver() {
    if (bluetoothReceiverRegistered) {
      return
    }

    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECT_REQUESTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
      addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(bluetoothConnectionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        registerReceiver(bluetoothConnectionReceiver, filter)
      }
      bluetoothReceiverRegistered = true
      Log.d(BT_TAG, "Bluetooth diagnostics receiver registered. App will only log system HID connect/disconnect events.")
    } catch (error: Exception) {
      Log.w(BT_TAG, "Bluetooth diagnostics receiver register failed: ${error.message}")
    }
  }

  private fun unregisterBluetoothDiagnosticsReceiver() {
    if (!bluetoothReceiverRegistered) {
      return
    }

    try {
      unregisterReceiver(bluetoothConnectionReceiver)
      Log.d(BT_TAG, "Bluetooth diagnostics receiver unregistered")
    } catch (error: Exception) {
      Log.w(BT_TAG, "Bluetooth diagnostics receiver unregister failed: ${error.message}")
    } finally {
      bluetoothReceiverRegistered = false
    }
  }

  private fun bluetoothActionName(action: String): String =
    when (action) {
      BluetoothDevice.ACTION_ACL_CONNECTED -> "system-connected"
      BluetoothDevice.ACTION_ACL_DISCONNECT_REQUESTED -> "system-disconnect-requested"
      BluetoothDevice.ACTION_ACL_DISCONNECTED -> "system-disconnected"
      BluetoothDevice.ACTION_BOND_STATE_CHANGED -> "bond-state-changed"
      else -> action
    }

  private fun bondStateName(state: Int): String =
    when (state) {
      BluetoothDevice.BOND_NONE -> "none"
      BluetoothDevice.BOND_BONDING -> "bonding"
      BluetoothDevice.BOND_BONDED -> "bonded"
      else -> state.toString()
    }

  private fun getBluetoothDevice(intent: Intent): BluetoothDevice? =
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
      }
    } catch (error: Exception) {
      Log.w(BT_TAG, "Could not read Bluetooth device from system broadcast: ${error.message}")
      null
    }

  private fun logBluetoothSystemEvent(action: String, intent: Intent) {
    val device = getBluetoothDevice(intent)
    val deviceInfo =
      try {
        val name = device?.name ?: "unknown"
        val address = device?.address ?: "unknown"
        val bondState = device?.bondState ?: -1
        "name=$name address=$address bond=${bondStateName(bondState)}"
      } catch (error: SecurityException) {
        "device-info-hidden missing BLUETOOTH_CONNECT permission"
      }

    Log.w(
      BT_TAG,
      "${bluetoothActionName(action)} $deviceInfo appCalledDisconnect=false screen=${RemoteControlModule.getCurrentScreen()}",
    )
  }

  private fun keyActionName(action: Int): String =
    when (action) {
      KeyEvent.ACTION_DOWN -> "ACTION_DOWN"
      KeyEvent.ACTION_UP -> "ACTION_UP"
      KeyEvent.ACTION_MULTIPLE -> "ACTION_MULTIPLE"
      else -> action.toString()
    }

  private fun keyDeviceName(event: KeyEvent): String =
    try {
      event.device?.name ?: "unknown"
    } catch (_: Exception) {
      "unknown"
    }

  private fun keyDeviceDescriptor(event: KeyEvent): String =
    try {
      event.device?.descriptor ?: "unknown"
    } catch (_: Exception) {
      "unknown"
    }

  private fun addCommonRemoteEventFields(map: com.facebook.react.bridge.WritableMap, event: KeyEvent) {
    map.putString("source", "hid-keyevent")
    map.putString("transport", "hid")
    map.putBoolean("appManagedConnection", false)
    map.putString("currentScreen", RemoteControlModule.getCurrentScreen())
    map.putString("actionName", keyActionName(event.action))
    map.putString("deviceName", keyDeviceName(event))
    map.putString("deviceDescriptor", keyDeviceDescriptor(event))
    map.putInt("deviceId", event.deviceId)
    map.putInt("inputSource", event.source)
  }

  private fun emitRemoteEvent(eventName: String, keyCodeValue: String, event: KeyEvent) {
    Log.d(
      REMOTE_TAG,
      "event=$eventName logical=$keyCodeValue keyCode=${event.keyCode} action=${keyActionName(event.action)} scanCode=${event.scanCode} device=${keyDeviceName(event)} screen=${RemoteControlModule.getCurrentScreen()}",
    )

    val map = Arguments.createMap()
    map.putString("keyCode", keyCodeValue)
    map.putInt("keyCodeInt", event.keyCode)
    map.putInt("scanCode", event.scanCode)
    map.putInt("action", event.action)
    map.putInt("repeatCount", event.repeatCount)
    addCommonRemoteEventFields(map, event)
    RemoteControlModule.sendEvent(eventName, map)
  }

  private fun emitRawRemoteEvent(eventName: String, event: KeyEvent): Boolean {
    Log.d(
      REMOTE_TAG,
      "raw event=$eventName keyCode=${event.keyCode} action=${keyActionName(event.action)} scanCode=${event.scanCode} repeat=${event.repeatCount} device=${keyDeviceName(event)} screen=${RemoteControlModule.getCurrentScreen()}",
    )

    val map = Arguments.createMap()
    map.putString("keyCode", event.keyCode.toString())
    map.putInt("keyCodeInt", event.keyCode)
    map.putInt("scanCode", event.scanCode)
    map.putInt("action", event.action)
    map.putInt("repeatCount", event.repeatCount)
    addCommonRemoteEventFields(map, event)
    RemoteControlModule.sendEvent(eventName, map)
    return true
  }

  private fun isNewGameHoldKey(keyCode: Int): Boolean {
    if (!RemoteControlModule.isNewGameHoldRequired()) {
      return false
    }

    return keyCode == KeyEvent.KEYCODE_ENTER ||
      keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
      keyCode == KeyEvent.KEYCODE_DPAD_CENTER
  }

  private fun clearPendingNewGameHold(resetTriggered: Boolean) {
    pendingNewGameHoldRunnable?.let { mainHandler.removeCallbacks(it) }
    pendingNewGameHoldRunnable = null
    heldNewGameKeyCode = null

    if (resetTriggered) {
      newGameHoldTriggered = false
    }
  }

  private fun emitHeldNewGameEvent() {
    val syntheticEvent = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER)
    emitRawRemoteEvent("onRemoteKeyDown", syntheticEvent)
  }

  private fun handleNewGameHold(event: KeyEvent): Boolean {
    when (event.action) {
      KeyEvent.ACTION_DOWN -> {
        if (event.repeatCount > 0) {
          return true
        }

        if (pendingNewGameHoldRunnable != null || newGameHoldTriggered) {
          return true
        }

        heldNewGameKeyCode = event.keyCode
        newGameHoldTriggered = false

        val holdRunnable = Runnable {
          if (heldNewGameKeyCode != event.keyCode) {
            return@Runnable
          }

          pendingNewGameHoldRunnable = null
          newGameHoldTriggered = true

          Log.d(REMOTE_TAG, "new game hold completed keyCode=${event.keyCode} screen=${RemoteControlModule.getCurrentScreen()}")
          emitHeldNewGameEvent()
        }

        pendingNewGameHoldRunnable = holdRunnable
        mainHandler.postDelayed(holdRunnable, NEW_GAME_HOLD_DURATION_MS)

        Log.d(
          REMOTE_TAG,
          "new game hold started keyCode=${event.keyCode} duration=$NEW_GAME_HOLD_DURATION_MS screen=${RemoteControlModule.getCurrentScreen()}",
        )
        return true
      }

      KeyEvent.ACTION_UP -> {
        if (!newGameHoldTriggered) {
          Log.d(REMOTE_TAG, "new game hold cancelled keyCode=${event.keyCode} screen=${RemoteControlModule.getCurrentScreen()}")
        }

        clearPendingNewGameHold(resetTriggered = true)
        return true
      }
    }

    return true
  }

  private fun setupRemoteMediaSession() {
    val session = MediaSession(this, "AplusRemoteSession")
    session.setCallback(
      object : MediaSession.Callback() {
        override fun onMediaButtonEvent(mediaButtonIntent: Intent): Boolean {
          if (!RemoteControlModule.isInputEnabled()) {
            Log.d(REMOTE_TAG, "media key ignored: remote input disabled screen=${RemoteControlModule.getCurrentScreen()}")
            return super.onMediaButtonEvent(mediaButtonIntent)
          }

          val keyEvent: KeyEvent? =
            mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)

          if (keyEvent == null) {
            return super.onMediaButtonEvent(mediaButtonIntent)
          }

          val logicalKey =
            when (keyEvent.keyCode) {
              KeyEvent.KEYCODE_MEDIA_PLAY,
              KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
              KeyEvent.KEYCODE_MEDIA_PAUSE -> "START"

              KeyEvent.KEYCODE_MEDIA_STOP -> "STOP"

              KeyEvent.KEYCODE_MEDIA_NEXT,
              KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "BREAK"

              KeyEvent.KEYCODE_MEDIA_PREVIOUS,
              KeyEvent.KEYCODE_MEDIA_REWIND -> "WARM_UP"

              else -> null
            }

          if (logicalKey != null) {
            when (keyEvent.action) {
              KeyEvent.ACTION_DOWN -> emitRemoteEvent("onRemoteKeyDown", logicalKey, keyEvent)
              KeyEvent.ACTION_UP -> emitRemoteEvent("onRemoteKeyUp", logicalKey, keyEvent)
            }
            return true
          }

          return super.onMediaButtonEvent(mediaButtonIntent)
        }
      },
    )

    val playbackState =
      PlaybackState.Builder()
        .setActions(
          PlaybackState.ACTION_PLAY or
            PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_PLAY_PAUSE or
            PlaybackState.ACTION_STOP or
            PlaybackState.ACTION_SKIP_TO_NEXT or
            PlaybackState.ACTION_SKIP_TO_PREVIOUS or
            PlaybackState.ACTION_FAST_FORWARD or
            PlaybackState.ACTION_REWIND,
        )
        .setState(PlaybackState.STATE_PAUSED, 0L, 1.0f)
        .build()

    session.setPlaybackState(playbackState)
    session.isActive = true
    mediaSession = session
    Log.d(REMOTE_TAG, "media session active transport=hid-keyevent appManagedConnection=false")
  }

  private fun isTextInputFocused(): Boolean {
    val focusedView = currentFocus ?: return false
    val className = focusedView.javaClass.name

    return focusedView.onCheckIsTextEditor() ||
      className.contains("EditText", ignoreCase = true) ||
      className.contains("ReactEditText", ignoreCase = true)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    // Khi đang focus ô nhập tên, trả toàn bộ key event lại cho TextInput,
    // để xóa từng chữ / sửa giữa chuỗi / gõ tiếp như nhập văn bản bình thường.
    if (isTextInputFocused()) {
      return super.dispatchKeyEvent(event)
    }

    if (!RemoteControlModule.isInputEnabled()) {
      Log.d(REMOTE_TAG, "dispatch ignored: remote input disabled keyCode=${event.keyCode} action=${keyActionName(event.action)} screen=${RemoteControlModule.getCurrentScreen()}")
      return super.dispatchKeyEvent(event)
    }

    if (isNewGameHoldKey(event.keyCode)) {
      return handleNewGameHold(event)
    }

    Log.d(
      REMOTE_TAG,
      "dispatch keyCode=${event.keyCode} action=${keyActionName(event.action)} scanCode=${event.scanCode} device=${keyDeviceName(event)} screen=${RemoteControlModule.getCurrentScreen()}",
    )

    return when (event.action) {
      KeyEvent.ACTION_DOWN -> emitRawRemoteEvent("onRemoteKeyDown", event)
      KeyEvent.ACTION_UP -> emitRawRemoteEvent("onRemoteKeyUp", event)
      else -> super.dispatchKeyEvent(event)
    }
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    return super.onKeyDown(keyCode, event)
  }

  override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
    return super.onKeyUp(keyCode, event)
  }
}
