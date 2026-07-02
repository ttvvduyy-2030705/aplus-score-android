import React, {memo} from 'react';
import Button from 'components/Button';
import Text from 'components/Text';
import View from 'components/View';
import BluetoothViewModel from './BluetoothViewModel';
import styles from './styles';

const BluetoothConfig = () => {
  const viewModel = BluetoothViewModel();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bluetooth Remote</Text>
      <Text style={styles.message}>
        Remote của app đang chạy theo chế độ HID / bàn phím Bluetooth. Hãy ghép đôi remote trong phần Bluetooth của Android. App chỉ nhận phím KeyEvent, không scan, không tự connect và không tự disconnect Bluetooth.
      </Text>
      <Text style={styles.message}>
        Nếu remote bị ngắt, xem logcat tag REMOTE_BT để biết ngắt ở cấp hệ thống hay không.
      </Text>

      <Button
        style={[styles.button]}
        onPress={viewModel.startScan}
        disable={viewModel.isScanning}>
        <Text>Kiểm tra chế độ HID</Text>
      </Button>

      {viewModel.connectedDevice ? (
        <View style={styles.info}>
          <Text>Trạng thái: {viewModel.connectedDevice.status}</Text>
          <Text>{viewModel.connectedDevice.name || 'Bluetooth remote do Android quản lý'}</Text>
        </View>
      ) : (
        <View style={styles.info}>
          <Text>Trạng thái: Android quản lý kết nối HID</Text>
        </View>
      )}
    </View>
  );
};

export default memo(BluetoothConfig);
