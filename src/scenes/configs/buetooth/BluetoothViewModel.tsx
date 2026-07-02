import { useBlueContext } from 'context/bluetooth';
import {useMemo, useState} from 'react';

const BluetoothViewModel = () => {
  const { isBluetoothEnabled, scannedDevices, isScanning, startScan, connectToDevice, connectedDevice, notifications } = useBlueContext();

  return useMemo(() => {
    return {
      isBluetoothEnabled,
       scannedDevices,
      isScanning,
      startScan,
      connectToDevice,
      connectedDevice,
     notifications 
    };
  }, [ isBluetoothEnabled, scannedDevices, isScanning, startScan, connectToDevice, connectedDevice, notifications ]);
};

export default BluetoothViewModel;
