import {PermissionsAndroid} from 'react-native';

const requestReadWriteStorage = async (): Promise<boolean> => {
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    ]);

    if (
      granted['android.permission.READ_EXTERNAL_STORAGE'] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      granted['android.permission.WRITE_EXTERNAL_STORAGE'] ===
        PermissionsAndroid.RESULTS.GRANTED
    ) {
      console.log('We can now read files');
      return true;
    }
  } catch (err) {
    console.log(err);
  }

  return false;
};

export {requestReadWriteStorage};
