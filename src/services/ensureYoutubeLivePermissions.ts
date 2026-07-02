import {PermissionsAndroid, Platform} from 'react-native';

export async function ensureYouTubeLivePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const toRequest: string[] = [];

  const cameraGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.CAMERA,
  );
  if (!cameraGranted) {
    toRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  }

  const micGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  if (!micGranted) {
    toRequest.push(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  }

  if (toRequest.length === 0) {
    return true;
  }

  const result = await PermissionsAndroid.requestMultiple(toRequest);

  const cameraOk =
    result[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED ||
    cameraGranted;

  const micOk =
    result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED ||
    micGranted;

  return cameraOk && micOk;
}
