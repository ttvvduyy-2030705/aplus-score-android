package com.billiards_management.RemoteControl;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class RemoteControlModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RemoteControlModule";
    private static ReactApplicationContext reactContext;
    private static volatile boolean inputEnabled = true;
    private static volatile boolean newGameHoldRequired = true;
    private static volatile String currentScreen = "app";

    public RemoteControlModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "RemoteControl";
    }

    // Required for NativeEventEmitter on Android.
    @ReactMethod
    public void addListener(String eventName) {
        Log.d(TAG, "JS listener added event=" + eventName + " screen=" + currentScreen);
    }

    // Required for NativeEventEmitter on Android.
    @ReactMethod
    public void removeListeners(Integer count) {
        Log.d(TAG, "JS listener removed count=" + count + " screen=" + currentScreen);
    }

    @ReactMethod
    public void ping(Promise promise) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("ready", true);
        map.putBoolean("inputEnabled", inputEnabled);
        map.putBoolean("newGameHoldRequired", newGameHoldRequired);
        map.putString("currentScreen", currentScreen);
        map.putString("transport", "hid-keyevent");
        promise.resolve(map);
    }

    @ReactMethod
    public void startListening(Promise promise) {
        // HID remotes are paired/connected by Android. The app only receives KeyEvent/media-button events.
        Log.d(TAG, "Remote listen start transport=hid-keyevent appManagedConnection=false screen=" + currentScreen);
        promise.resolve(true);
    }

    @ReactMethod
    public void setEnabled(Boolean enabled, Promise promise) {
        inputEnabled = enabled == null || enabled;
        Log.d(TAG, "Remote input gate setEnabled=" + inputEnabled + " appCalledDisconnect=false screen=" + currentScreen);
        promise.resolve(inputEnabled);
    }

    @ReactMethod
    public void setCurrentScreen(String screen, Promise promise) {
        currentScreen = screen == null || screen.trim().isEmpty() ? "unknown" : screen.trim();
        Log.d(TAG, "Remote current screen=" + currentScreen);
        promise.resolve(currentScreen);
    }

    @ReactMethod
    public void setNewGameHoldRequired(Boolean required, Promise promise) {
        newGameHoldRequired = required == null || required;
        Log.d(TAG, "Remote newGameHoldRequired=" + newGameHoldRequired + " screen=" + currentScreen);
        promise.resolve(newGameHoldRequired);
    }

    @ReactMethod
    public void scanAndConnect(Promise promise) {
        // Important: do not BLE-scan/GATT-connect HID remotes from the app. That can fight Android's HID link.
        Log.w(TAG, "Remote scanAndConnect skipped: HID remote is managed by Android Bluetooth settings. appManagedConnection=false screen=" + currentScreen);
        promise.resolve(false);
    }

    @ReactMethod
    public void disconnect(Promise promise) {
        // Important: this only disables app input handling; it must never disconnect the Android Bluetooth HID link.
        inputEnabled = false;
        Log.w(TAG, "Remote disconnect skipped: app will not disconnect HID Bluetooth. inputEnabled=false screen=" + currentScreen);
        promise.resolve(false);
    }

    public static boolean isReady() {
        return reactContext != null
                && reactContext.hasActiveReactInstance()
                && reactContext.getCatalystInstance() != null;
    }

    public static boolean isInputEnabled() {
        return inputEnabled;
    }

    public static boolean isNewGameHoldRequired() {
        return newGameHoldRequired;
    }

    public static String getCurrentScreen() {
        return currentScreen;
    }

    public static void sendEvent(String eventName, @Nullable WritableMap params) {
        if (!inputEnabled) {
            Log.d(TAG, "sendEvent skipped: remote input disabled. event=" + eventName + " screen=" + currentScreen);
            return;
        }

        if (!isReady()) {
            Log.w(TAG, "sendEvent skipped: React context not ready. event=" + eventName + " screen=" + currentScreen);
            return;
        }

        try {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params != null ? params : Arguments.createMap());
        } catch (Exception e) {
            Log.e(TAG, "sendEvent failed for event=" + eventName + " screen=" + currentScreen, e);
        }
    }
}
