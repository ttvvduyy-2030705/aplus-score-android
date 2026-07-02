/**
 * Bluetooth remote policy for Android:
 *
 * The supported remote path in this app is HID / keyboard / media-button input.
 * Android owns pairing and the Bluetooth link. The app must not scan, GATT-connect,
 * disconnect, or write BLE characteristics to HID remotes, because doing that can
 * fight the system HID connection and make cheap remotes reconnect repeatedly.
 */

type Listener = (data: any) => void;

type ListenerSubscription = {remove: () => void};

const TAG = '[Remote][BLE-HID]';

class BLEServiceInstance {
  [x: string]: any;
  isPermissionsGranted: boolean = true;
  private statusListeners = new Set<Listener>();
  private notificationListeners = new Set<Listener>();

  private emitStatus = (payload: Record<string, any>) => {
    const data = {
      transport: 'hid',
      appManagedConnection: false,
      ...payload,
    };

    console.log(TAG, data);
    this.statusListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.log(TAG, 'status listener failed', error);
      }
    });
  };

  addStatusListener = (listener: Listener): ListenerSubscription => {
    this.statusListeners.add(listener);
    listener({
      status: 'hid-managed-by-android',
      transport: 'hid',
      appManagedConnection: false,
      message: 'Bluetooth remote uses Android HID/KeyEvent. App will not scan/connect/disconnect Bluetooth.',
    });

    return {
      remove: () => {
        this.statusListeners.delete(listener);
      },
    };
  };

  addNotificationListener = (listener: Listener): ListenerSubscription => {
    this.notificationListeners.add(listener);

    return {
      remove: () => {
        this.notificationListeners.delete(listener);
      },
    };
  };

  requestBluetoothPermissions = async () => {
    this.isPermissionsGranted = true;
    this.emitStatus({
      status: 'permission-not-required',
      message: 'HID remote input does not require BLE scan/connect runtime permission.',
    });
    return true;
  };

  scanAndConnect = async () => {
    this.emitStatus({
      status: 'scan-skipped-hid-mode',
      reason: 'App does not BLE-scan or GATT-connect HID remotes. Pair the remote in Android Bluetooth settings.',
    });
    return null;
  };

  connectRemoteDevice = async (_device: any) => {
    this.emitStatus({
      status: 'connect-skipped-hid-mode',
      reason: 'Android system owns the HID Bluetooth connection.',
    });
    return null;
  };

  disconnect = async () => {
    this.emitStatus({
      status: 'disconnect-skipped-hid-mode',
      reason: 'App will not disconnect a HID remote from Bluetooth.',
    });
    return null;
  };
}

export const BLEService = new BLEServiceInstance();
