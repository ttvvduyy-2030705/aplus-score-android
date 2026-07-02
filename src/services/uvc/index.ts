import {NativeModules} from 'react-native';

const {UvcProbe} = NativeModules;

export type UsbProbeItem = {
  deviceName: string;
  vendorId: number;
  productId: number;
  deviceClass: number;
  deviceSubclass: number;
  looksLikeVideo: boolean;
};

export type UvcZoomInfo = {
  supported: boolean;
  minZoom: number;
  maxZoom: number;
  zoom: number;
  source?: string;
  unit?: 'ratio' | 'percent' | 'absolute';
};

export type UvcPreviewStatus = {
  activeView: boolean;
  cameraOpened: boolean;
  previewStarted: boolean;
  surfaceReady: boolean;
  isRecording: boolean;
  hasFrameCallback: boolean;
  lastFrameTimestampMs: number;
  lastFrameAgeMs: number;
  previewFirstFrameReceived?: boolean;
  recorderFirstFrameReceived?: boolean;
  recordingFilePath?: string;
  recordingFileExists?: boolean;
  recordingFileSize?: number;
  recorderEncodedFrameCount?: number;
  viewWidth: number;
  viewHeight: number;
  previewWidth: number;
  previewHeight: number;
};

export async function listUsbDevices(): Promise<UsbProbeItem[]> {
  if (!UvcProbe?.listUsbDevices) {
    return [];
  }

  return UvcProbe.listUsbDevices();
}

export async function startUvcRecording(outputPath: string): Promise<string> {
  if (!UvcProbe?.startRecording) {
    throw new Error('UVC recorder unavailable');
  }

  return UvcProbe.startRecording(outputPath);
}

export async function stopUvcRecording(): Promise<string | null> {
  if (!UvcProbe?.stopRecording) {
    return null;
  }

  return UvcProbe.stopRecording();
}

export async function setUvcZoom(zoom: number): Promise<number> {
  if (!UvcProbe?.setZoom) {
    return 1;
  }

  return UvcProbe.setZoom(zoom);
}

export async function getUvcZoomInfo(): Promise<UvcZoomInfo> {
  if (!UvcProbe?.getZoomInfo) {
    return {
      supported: false,
      minZoom: 1,
      maxZoom: 1,
      zoom: 1,
      source: 'external',
      unit: 'ratio',
    };
  }

  return UvcProbe.getZoomInfo();
}

export async function restartUvcPreview(reason: string = 'manual'): Promise<boolean> {
  if (!UvcProbe?.restartPreview) {
    return false;
  }

  return UvcProbe.restartPreview(reason);
}

export async function requestUvcLayout(reason: string = 'manual'): Promise<boolean> {
  if (!UvcProbe?.requestLayout) {
    return false;
  }

  return UvcProbe.requestLayout(reason);
}

export async function getUvcPreviewStatus(): Promise<UvcPreviewStatus> {
  if (!UvcProbe?.getPreviewStatus) {
    return {
      activeView: false,
      cameraOpened: false,
      previewStarted: false,
      surfaceReady: false,
      isRecording: false,
      hasFrameCallback: false,
      lastFrameTimestampMs: 0,
      lastFrameAgeMs: -1,
      previewFirstFrameReceived: false,
      recorderFirstFrameReceived: false,
      recordingFilePath: '',
      recordingFileExists: false,
      recordingFileSize: 0,
      recorderEncodedFrameCount: 0,
      viewWidth: 0,
      viewHeight: 0,
      previewWidth: 0,
      previewHeight: 0,
    };
  }

  return UvcProbe.getPreviewStatus();
}
