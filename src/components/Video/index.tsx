import React, {
  memo,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  AppStateStatus,
  Platform,
  StyleSheet,
  Text,
  View as RNView,
} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import {Video as RNVideo} from 'react-native-video';
import {Camera, useCameraDevice, useCameraFormat} from 'react-native-vision-camera';

import View from 'components/View';
import VideoViewModel, {Props} from './VideoViewModel';
import {WebcamType} from 'types/webcam';
import {
  getUvcPreviewStatus,
  getUvcZoomInfo,
  listUsbDevices,
  requestUvcLayout,
  restartUvcPreview,
  setUvcZoom,
  startUvcRecording,
  stopUvcRecording,
  UvcZoomInfo,
} from 'services/uvc';
import UvcCameraView from 'components/UvcCameraView';
import styles from './styles';
import {
  CameraSource,
  subscribeCycleCameraSource,
} from 'utils/cameraSourceSwitcher';
import YouTubeAndroidNativePreview from './YouTubeAndroidNativePreview';
import {
  addYouTubeCameraStreamListener,
  getYouTubeNativeZoomInfo,
  isYouTubeNativeCameraEnabled,
  setYouTubeNativeZoom,
  startYouTubeNativeRecord,
  stopYouTubeNativeRecord,
  YouTubeNativeZoomInfo,
} from 'services/youtubeCameraStream';
import i18n from 'i18n';
import {LanguageContext} from 'context/language';
import {recordDebugLog} from 'utils/recordDebugLogger';
import {ensureReplayFolder} from 'services/replay/localReplay';

const DEBUG_VIDEO = true;
const debugVideoLog = (...args: any[]) => {
  if (!DEBUG_VIDEO) {
    return;
  }
  const [first, ...rest] = args;
  const message = typeof first === 'string' ? first : 'video-log';
  const extra = rest.length <= 1 ? rest[0] : rest;
  recordDebugLog('VideoRecording', message, extra);
};

type PermissionState = 'loading' | 'granted' | 'denied';
type BackendType = 'vision' | 'uvc' | 'youtube-native' | null;
type CameraSourceMode = 'phone' | 'usb' | 'ip';
type PhoneCameraConfigMode = 'standard' | 'safe' | 'ultra-safe';
type CameraZoomUnit = 'ratio' | 'percent' | 'absolute';
type ZoomSnapshot = {
  supported: boolean;
  minZoom: number;
  maxZoom: number;
  zoom: number;
  source: CameraSource | 'youtube-native';
  unit: CameraZoomUnit;
  key: string;
};
type PersistedZoomEntry = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  supported: boolean;
  unit?: CameraZoomUnit;
};

const ZOOM_EPSILON = 0.001;
const CAMERA_ZOOM_STORAGE_KEY = '@aplus/camera-zoom-by-device-v2';

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(value, max));
};

const finiteNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const hasUsableZoomRange = (minZoom: number, maxZoom: number) => {
  return Number.isFinite(minZoom) && Number.isFinite(maxZoom) && maxZoom - minZoom > ZOOM_EPSILON;
};

const normalizeZoomUnit = (value?: string): CameraZoomUnit => {
  return value === 'percent' || value === 'absolute' ? value : 'ratio';
};

const getCameraZoomStore = (): Record<string, PersistedZoomEntry> => {
  const current = (globalThis as any).__APLUS_CAMERA_ZOOM_STORE__;
  if (current && typeof current === 'object') {
    return current;
  }

  const next: Record<string, PersistedZoomEntry> = {};
  (globalThis as any).__APLUS_CAMERA_ZOOM_STORE__ = next;
  return next;
};

const normalizeStoredZoomStore = (raw: unknown): Record<string, PersistedZoomEntry> => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const next: Record<string, PersistedZoomEntry> = {};
  Object.entries(raw as Record<string, any>).forEach(([key, value]) => {
    const minZoom = finiteNumber(value?.minZoom, 1);
    const maxZoom = finiteNumber(value?.maxZoom, minZoom);
    const zoom = finiteNumber(value?.zoom, minZoom);
    if (!key || !hasUsableZoomRange(minZoom, maxZoom)) {
      return;
    }

    next[key] = {
      minZoom,
      maxZoom,
      zoom: clamp(zoom, minZoom, maxZoom),
      supported: true,
      unit: normalizeZoomUnit(value?.unit),
    };
  });
  return next;
};

const loadCameraZoomStore = async (): Promise<Record<string, PersistedZoomEntry>> => {
  try {
    const raw = await AsyncStorage.getItem(CAMERA_ZOOM_STORAGE_KEY);
    return normalizeStoredZoomStore(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
};

const persistCameraZoomStore = async (store: Record<string, PersistedZoomEntry>) => {
  try {
    await AsyncStorage.setItem(CAMERA_ZOOM_STORAGE_KEY, JSON.stringify(store));
  } catch {}
};

const RTSP_STREAM_TIMEOUT_MS = 12000;
const RTSP_PROGRESS_WATCHDOG_INTERVAL_MS = 4000;
const RTSP_PROGRESS_FROZEN_MS = 9000;
const RTSP_RECONNECT_THROTTLE_MS = 7000;
const UVC_PREVIEW_WATCHDOG_INTERVAL_MS = 5000;
const UVC_PREVIEW_FROZEN_MS = 9000;
const UVC_RESTART_THROTTLE_MS = 10000;
const USB_CAMERA_PREPARING_MESSAGE = 'Đang chuẩn bị webcam USB...';
const USB_CAMERA_DISCONNECTED_MESSAGE = 'Camera USB bị ngắt kết nối. Vui lòng kiểm tra dây USB / quyền truy cập USB / nguồn cấp camera.';
const IP_CAMERA_ERROR_MESSAGE = 'Không mở được camera IP. Kiểm tra đúng IP của camera, Safety Code/mật khẩu, và bật RTSP/ONVIF trên camera.';

const normalizeStreamUri = (value?: string | NodeRequire | null): string =>
  typeof value === 'string' ? value.trim() : '';

const maskStreamUri = (value?: string | NodeRequire | null): string => {
  const uri = normalizeStreamUri(value);
  return uri.replace(/rtsp:\/\/([^:]+):([^@]+)@/i, 'rtsp://$1:***@');
};

const getExternalStreamCandidates = (source: any): string[] => {
  const fromCandidates = Array.isArray(source?.rtspCandidates)
    ? source.rtspCandidates.filter((item: any) => typeof item === 'string' && item.trim())
    : [];
  const uri = normalizeStreamUri(source?.uri);
  return Array.from(new Set([uri, ...fromCandidates].filter(Boolean)));
};

const assignRef = (target: any, value: any) => {
  if (!target) {
    return;
  }

  if (typeof target === 'function') {
    target(value);
    return;
  }

  try {
    target.current = value;
  } catch {}
};

const DEFAULT_UVC_ZOOM: UvcZoomInfo = {
  supported: false,
  minZoom: 1,
  maxZoom: 1,
  zoom: 1,
  source: 'external',
  unit: 'ratio',
};

const DEFAULT_YOUTUBE_NATIVE_ZOOM: YouTubeNativeZoomInfo = {
  zoom: 1,
  minZoom: 1,
  maxZoom: 1,
  source: 'youtube-native',
};

const USB_RESCAN_INTERVAL_MS = 4000;
const UVC_PRESENCE_GRACE_MS = 3000;
const UVC_ZOOM_REFRESH_INTERVAL_MS = 2500;
const UVC_RECORDING_START_TIMEOUT_MS = 12000;
const USB_RECORDING_FILE_POLL_INTERVAL_MS = 1500;

// A real recorded clip is always well above this. We use it to reject empty /
// truncated / "never actually recorded" files instead of faking a finished
// recording with a stale temp path.
const MIN_VALID_VIDEO_BYTES = 128 * 1024;
const MIN_USB_SHORT_REPLAY_BYTES = 8 * 1024;

const isUsableVideoFile = async (path?: string | null, minBytes = MIN_VALID_VIDEO_BYTES): Promise<boolean> => {
  if (!path) {
    return false;
  }
  try {
    if (!(await RNFS.exists(path))) {
      return false;
    }
    const stat = await RNFS.stat(path);
    return Number(stat.size || 0) >= minBytes;
  } catch {
    return false;
  }
};


const buildUsbRecordingOutputPath = async (options: any) => {
  const rawFolderName = String(options?.webcamFolderName || '').trim();
  const folderName = rawFolderName || `usb_${Date.now()}`;
  const rawSegmentIndex = Number(options?.segmentIndex ?? 0);
  const segmentIndex = Number.isFinite(rawSegmentIndex) && rawSegmentIndex >= 0
    ? Math.floor(rawSegmentIndex)
    : 0;
  const replayFolderPath = await ensureReplayFolder(folderName);
  return `${replayFolderPath}/usb_raw_${String(segmentIndex + 1).padStart(4, '0')}_${Date.now()}.mp4`;
};

const inspectVideoFile = async (path?: string | null, minBytes = MIN_VALID_VIDEO_BYTES) => {
  const target = String(path || '').trim();
  if (!target) {
    return {exists: false, size: 0, usable: false};
  }

  try {
    const exists = await RNFS.exists(target);
    const size = exists ? Number((await RNFS.stat(target)).size || 0) : 0;
    return {exists, size, usable: exists && size >= minBytes};
  } catch {
    return {exists: false, size: 0, usable: false};
  }
};

const isUvcPreviewStatusGameplayReady = (status?: any) => {
  if (!status || status.activeView !== true) {
    return false;
  }

  const lastFrameAgeMs = Number(status.lastFrameAgeMs ?? -1);
  return (
    status.previewStarted === true ||
    lastFrameAgeMs >= 0 ||
    (status.cameraOpened === true && status.surfaceReady === true)
  );
};

const setUsbGameplayReadySnapshot = (ready: boolean, status?: any) => {
  (globalThis as any).__APLUS_USB_GAMEPLAY_READY__ = ready;
  if (ready) {
    (globalThis as any).__APLUS_UVC_PRESENT__ = true;
    (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ = 'usb';
    (globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ = 'usb';
    (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'uvc';
    (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ = 'external';
    (globalThis as any).__APLUS_AVAILABLE_CAMERA_SOURCES__ = ['external'];
    (globalThis as any).__APLUS_USB_PREVIEW_STATUS__ = status || null;
    return;
  }

  // A USB device can remain physically plugged in while the active gameplay
  // source is RTSP. Clear only the gameplay-ready/session markers; keep
  // __APLUS_UVC_PRESENT__ as device-presence information.
  if ((globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ === 'usb') {
    (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ = '';
  }
  (globalThis as any).__APLUS_USB_PREVIEW_STATUS__ = status || null;
};

const setRtspGameplaySnapshot = (rtspUrl?: string | null, candidates?: string[]) => {
  const cleanUrl = String(rtspUrl || '').trim();
  (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ = 'rtsp';
  (globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ = 'ip';
  (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'rtsp';
  (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ = cleanUrl;
  (globalThis as any).__APLUS_RTSP_CANDIDATES__ = Array.isArray(candidates) ? candidates : [];
  (globalThis as any).__APLUS_USB_GAMEPLAY_READY__ = false;
};

const normalizeUvcZoomInfo = (info?: Partial<UvcZoomInfo> | null): UvcZoomInfo => {
  const rawMin = finiteNumber(info?.minZoom, 1);
  const rawMax = finiteNumber(info?.maxZoom, rawMin);
  const supported =
    info?.supported === true &&
    normalizeZoomUnit((info as any)?.unit) === 'ratio' &&
    hasUsableZoomRange(rawMin, rawMax);

  if (!supported) {
    return {
      supported: false,
      minZoom: 1,
      maxZoom: 1,
      zoom: 1,
      source: 'external',
      unit: 'ratio',
    };
  }

  const zoom = clamp(finiteNumber(info?.zoom, rawMin), rawMin, rawMax);
  return {
    supported: true,
    minZoom: rawMin,
    maxZoom: rawMax,
    zoom,
    source: 'external',
    unit: 'ratio',
  };
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeout: any;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


const waitForUsableVideoFile = async (
  path?: string | null,
  timeoutMs = 6000,
  minBytes = MIN_VALID_VIDEO_BYTES,
) => {
  const startedAt = Date.now();
  let info = await inspectVideoFile(path, minBytes);

  while (path && !info.usable && Date.now() - startedAt < timeoutMs) {
    await wait(350);
    info = await inspectVideoFile(path, minBytes);
  }

  return {
    ...info,
    waitedMs: Date.now() - startedAt,
  };
};

const waitForUvcRecordingEvidence = async (
  outputPath: string,
  timeoutMs = 5000,
) => {
  const startedAt = Date.now();
  let lastInfo = await inspectVideoFile(outputPath, MIN_USB_SHORT_REPLAY_BYTES);
  let lastStatus: any = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastInfo = await inspectVideoFile(outputPath, MIN_USB_SHORT_REPLAY_BYTES);
    try {
      lastStatus = await getUvcPreviewStatus();
    } catch {
      lastStatus = null;
    }

    if (lastInfo.size > 0 || lastStatus?.isRecording === true) {
      return {
        started: true,
        fileExists: lastInfo.exists,
        fileSize: lastInfo.size,
        usable: lastInfo.usable,
        nativeIsRecording: lastStatus?.isRecording === true,
        previewFirstFrameReceived: lastStatus?.previewFirstFrameReceived === true,
        recorderFirstFrameReceived: lastStatus?.recorderFirstFrameReceived === true,
        recorderEncodedFrameCount: Number(lastStatus?.recorderEncodedFrameCount || 0),
        recordingFilePath: lastStatus?.recordingFilePath || outputPath,
        recordingFileSize: Number(lastStatus?.recordingFileSize || lastInfo.size || 0),
        waitedMs: Date.now() - startedAt,
      };
    }

    await wait(250);
  }

  return {
    started: false,
    fileExists: lastInfo.exists,
    fileSize: lastInfo.size,
    usable: lastInfo.usable,
    nativeIsRecording: lastStatus?.isRecording === true,
    previewFirstFrameReceived: lastStatus?.previewFirstFrameReceived === true,
    recorderFirstFrameReceived: lastStatus?.recorderFirstFrameReceived === true,
    recorderEncodedFrameCount: Number(lastStatus?.recorderEncodedFrameCount || 0),
    recordingFilePath: lastStatus?.recordingFilePath || outputPath,
    recordingFileSize: Number(lastStatus?.recordingFileSize || lastInfo.size || 0),
    waitedMs: Date.now() - startedAt,
  };
};

const isYouTubeNativeCameraLocked = () => {
  return (globalThis as any).__APLUS_YOUTUBE_NATIVE_LOCK__ === true;
};


const getYouTubeNativeSourceLock = (): CameraSource | null => {
  const value = (globalThis as any).__APLUS_YOUTUBE_SOURCE_LOCK__;
  return value === 'back' || value === 'front' || value === 'external' ? value : null;
};

const setCurrentCameraSourceSnapshot = (source: CameraSource) => {
  (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ = source;
};


const areUsbDevicesEqual = (prev: any[] = [], next: any[] = []) => {
  if (prev === next) {
    return true;
  }

  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index] ?? {};
    const right = next[index] ?? {};

    if (
      left.deviceId !== right.deviceId ||
      left.vendorId !== right.vendorId ||
      left.productId !== right.productId ||
      left.looksLikeVideo !== right.looksLikeVideo ||
      left.deviceName !== right.deviceName
    ) {
      return false;
    }
  }

  return true;
};

const isSameZoomInfo = (left: any, right: any) => {
  return (
    left?.supported === right?.supported &&
    Number(left?.minZoom ?? 1) === Number(right?.minZoom ?? 1) &&
    Number(left?.maxZoom ?? 1) === Number(right?.maxZoom ?? 1) &&
    Number(left?.zoom ?? 1) === Number(right?.zoom ?? 1) &&
    String(left?.source ?? '') === String(right?.source ?? '') &&
    String(left?.unit ?? 'ratio') === String(right?.unit ?? 'ratio')
  );
};

const setUvcPresenceSnapshot = (present: boolean) => {
  (globalThis as any).__APLUS_UVC_PRESENT__ = present;
};

const setAvailableCameraSourcesSnapshot = (sources: CameraSource[]) => {
  (globalThis as any).__APLUS_AVAILABLE_CAMERA_SOURCES__ = [...sources];
};

const getSelectedSourceSnapshot = (): CameraSource => {
  const value = (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__;
  return value === 'front' || value === 'external' ? value : 'back';
};

const SUCCESSFUL_PHONE_MODE_STORAGE_KEY = '@aplus/successful-phone-modes';

const loadSuccessfulPhoneModesFromStorage = async (): Promise<Record<string, PhoneCameraConfigMode>> => {
  try {
    const raw = await AsyncStorage.getItem(SUCCESSFUL_PHONE_MODE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const next: Record<string, PhoneCameraConfigMode> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (value === 'standard' || value === 'safe' || value === 'ultra-safe') {
        next[key] = value;
      }
    });
    return next;
  } catch {
    return {};
  }
};

const persistSuccessfulPhoneModesToStorage = async (
  store: Record<string, PhoneCameraConfigMode>,
) => {
  try {
    await AsyncStorage.setItem(SUCCESSFUL_PHONE_MODE_STORAGE_KEY, JSON.stringify(store));
  } catch {}
};

const getSuccessfulPhoneModeStore = (): Record<string, PhoneCameraConfigMode> => {
  const current = (globalThis as any).__APLUS_SUCCESSFUL_PHONE_MODES__;
  if (current && typeof current === 'object') {
    return current;
  }

  const next: Record<string, PhoneCameraConfigMode> = {};
  (globalThis as any).__APLUS_SUCCESSFUL_PHONE_MODES__ = next;
  return next;
};

const AplusVideo = (props: Props, ref: React.LegacyRef<any>) => {
  const {language} = useContext(LanguageContext);
  void language;
  const cameraScaleMode = props.cameraScaleMode || 'cover';
  const viewModel = VideoViewModel(props);
  const isFocused = useIsFocused();

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [cameraLifecycleActive, setCameraLifecycleActive] = useState(
    () => AppState.currentState === 'active',
  );
  const [permissionState, setPermissionState] = useState<PermissionState>('loading');
  const [microphonePermissionState, setMicrophonePermissionState] =
    useState<PermissionState>('loading');
  const [usbDevices, setUsbDevices] = useState<any[]>([]);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [phoneCameraConfigMode, setPhoneCameraConfigMode] = useState<PhoneCameraConfigMode>('standard');
  const [preferredPhoneMode, setPreferredPhoneMode] = useState<PhoneCameraConfigMode>('standard');
  const [phoneModeHydrated, setPhoneModeHydrated] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CameraSource>(() =>
    getSelectedSourceSnapshot(),
  );
  const [zoom, setZoom] = useState(1);
  const [zoomStoreHydrated, setZoomStoreHydrated] = useState(false);
  const [uvcZoomInfoState, setUvcZoomInfoState] = useState<UvcZoomInfo>(DEFAULT_UVC_ZOOM);
  const [youtubeNativeZoomInfoState, setYoutubeNativeZoomInfoState] =
    useState<YouTubeNativeZoomInfo>(DEFAULT_YOUTUBE_NATIVE_ZOOM);
  const [stableHasUvcWebcam, setStableHasUvcWebcam] = useState(false);
  const [externalStreamReady, setExternalStreamReady] = useState(false);
  const [phonePreviewReady, setPhonePreviewReady] = useState(false);
  const lastSuccessfulPhoneModeRef = useRef<Record<string, PhoneCameraConfigMode>>(getSuccessfulPhoneModeStore());
  const pendingPhoneModeSourceKeyRef = useRef<string | null>(null);
  const lifecycleReleaseTimeoutRef = useRef<any>(null);
  const getPreferredPhoneMode = useCallback((source: CameraSource, deviceId?: string | null) => {
    const directKey = `${source}:${deviceId || 'unknown'}`;
    const sourceKey = `${source}:*`;
    return (
      lastSuccessfulPhoneModeRef.current[directKey] ||
      lastSuccessfulPhoneModeRef.current[sourceKey] ||
      (Platform.OS === 'android' ? 'safe' : 'standard')
    );
  }, []);

  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const externalDevice = useCameraDevice('external');
  const hasBuiltInCamera = !!(backDevice || frontDevice || externalDevice);
  const rawExternalStreamCandidates = useMemo(
    () => getExternalStreamCandidates(viewModel.source),
    [viewModel.source],
  );
  const hasRawExternalStreamSource = rawExternalStreamCandidates.length > 0;
  const selectedCameraModeSnapshot = String(
    (globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ || '',
  );
  const hasUvcWebcam = useMemo(() => {
    return usbDevices.some(d => d.looksLikeVideo);
  }, [usbDevices]);
  const activeSourceKindSnapshot = String(
    (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ || '',
  );
  const rtspSourceTakesPriority =
    hasRawExternalStreamSource ||
    selectedCameraModeSnapshot === 'ip' ||
    activeSourceKindSnapshot === 'rtsp';
  const hasUsbVideoSource =
    hasUvcWebcam ||
    stableHasUvcWebcam ||
    (!rtspSourceTakesPriority &&
      (globalThis as any).__APLUS_UVC_PRESENT__ === true &&
      getSelectedSourceSnapshot() === 'external');
  const ipModeLocked = selectedCameraModeSnapshot === 'ip';
  const usbModeLocked =
    Platform.OS === 'android' &&
    !ipModeLocked &&
    !hasRawExternalStreamSource &&
    (selectedCameraModeSnapshot === 'usb' ||
      activeSourceKindSnapshot === 'usb' ||
      (hasUsbVideoSource &&
        (selectedSource === 'external' ||
          getSelectedSourceSnapshot() === 'external')));
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (!hasRawExternalStreamSource && (hasUsbVideoSource || usbModeLocked)) {
      setUvcPresenceSnapshot(true);
      setAvailableCameraSourcesSnapshot(['external']);
      setCurrentCameraSourceSnapshot('external');
      debugVideoLog('[USBWebcam] source-normalized', {
        hasUsbVideoSource,
        usbModeLocked,
        selectedCameraModeSnapshot,
        selectedSource,
      });
    }
  }, [hasRawExternalStreamSource, hasUsbVideoSource, selectedCameraModeSnapshot, selectedSource, usbModeLocked]);

  const shouldUseIpStream = hasRawExternalStreamSource && !usbModeLocked;
  const externalStreamCandidates = shouldUseIpStream ? rawExternalStreamCandidates : [];
  const hasExternalStreamSource = externalStreamCandidates.length > 0;
  const cameraSourceMode: CameraSourceMode = usbModeLocked
    ? 'usb'
    : hasExternalStreamSource
      ? 'ip'
      : 'phone';
  const [externalStreamIndex, setExternalStreamIndex] = useState(0);
  const [externalStreamErrorMessage, setExternalStreamErrorMessage] = useState('');
  const [externalStreamReloadNonce, setExternalStreamReloadNonce] = useState(0);
  const lastRtspProgressAtRef = useRef(Date.now());
  const lastRtspProgressTimeRef = useRef<number | null>(null);
  const lastRtspReconnectAtRef = useRef(0);
  const lastUvcRestartAtRef = useRef(0);
  const currentExternalStreamUri = externalStreamCandidates[externalStreamIndex] || '';
  const currentExternalSource = useMemo(() => {
    if (!currentExternalStreamUri) {
      return viewModel.source;
    }

    return {
      ...(viewModel.source || {}),
      uri: currentExternalStreamUri,
      type: 'rtsp',
    } as any;
  }, [currentExternalStreamUri, viewModel.source]);
  const effectiveWebcamType = hasExternalStreamSource
    ? WebcamType.webcam
    : viewModel.webcamType !== WebcamType.camera && hasBuiltInCamera
      ? WebcamType.camera
      : WebcamType.camera;
  const isExternalStreamPreview =
    cameraSourceMode === 'ip' &&
    (effectiveWebcamType !== WebcamType.camera || !!currentExternalStreamUri);

  const resolvedRef = (((props as any)?.cameraRef ?? ref) as any) || null;
  const visionCameraRef = useRef<any>(null);
  const controllerRef = useRef<any>(null);
  const uvcCallbacksRef = useRef<any>(null);
  const nativeRecordingCallbacksRef = useRef<any>(null);
  const lastUvcRecordingPathRef = useRef<string | undefined>(undefined);
  const uvcRecordingFilePollRef = useRef<any>(null);
  const activeRecordingBackendRef = useRef<BackendType>(null);
  const recordingStateRef = useRef<'idle' | 'starting' | 'recording' | 'stopping'>('idle');
  const selectedSourceRef = useRef<CameraSource>('back');
  const usingUvcRef = useRef(false);
  const effectiveWebcamTypeRef = useRef<WebcamType>(effectiveWebcamType);
  const isExternalStreamPreviewRef = useRef(isExternalStreamPreview);
  const currentExternalStreamUriRef = useRef(currentExternalStreamUri);
  const deviceRef = useRef<any>(null);
  const zoomSnapshotRef = useRef<ZoomSnapshot>({
    supported: false,
    minZoom: 1,
    maxZoom: 1,
    zoom: 1,
    source: 'back',
    unit: 'ratio',
    key: 'vision:back:unknown',
  });
  const zoomStoreRef = useRef<Record<string, PersistedZoomEntry>>(getCameraZoomStore());
  const activeZoomKeyRef = useRef('vision:back:unknown');
  const restoredZoomKeyRef = useRef('');
  const uvcZoomInfoRef = useRef<UvcZoomInfo>(DEFAULT_UVC_ZOOM);
  const youtubeNativeZoomInfoRef = useRef<YouTubeNativeZoomInfo>(
    DEFAULT_YOUTUBE_NATIVE_ZOOM,
  );
  const refreshMicrophonePermissionRef = useRef<
    (requestIfNeeded?: boolean) => Promise<PermissionState>
  >(async () => 'denied');
  const uvcPresenceTimeoutRef = useRef<any>(null);
  const lastRawUvcPresenceRef = useRef(false);
  const usbDevicesRef = useRef<any[]>([]);

  const updateRecordingInfoSnapshot = useCallback((
    overrides: Partial<{
      state: 'idle' | 'starting' | 'recording' | 'stopping' | string;
      backend: BackendType | string | null;
      source: CameraSource | string;
    }> = {},
  ) => {
    const state = overrides.state ?? recordingStateRef.current;
    const backend = overrides.backend ?? activeRecordingBackendRef.current;
    const source =
      overrides.source ??
      (usingUvcRef.current ? 'external' : selectedSourceRef.current || 'back');

    const snapshot = {
      state,
      backend,
      source,
      isRecording:
        state === 'starting' || state === 'recording' || state === 'stopping',
    };

    (globalThis as any).__APLUS_CAMERA_RECORDING_INFO__ = snapshot;
    return snapshot;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      setAppState(nextState);
    });

    return () => {
      sub.remove();
    };
  }, []);

  const externalStreamSignature = externalStreamCandidates.join('|');

  useEffect(() => {
    debugVideoLog('[CameraSource]', {
      selectedMode: cameraSourceMode,
      selectedDevice:
        cameraSourceMode === 'usb'
          ? usbDevices.find(d => d.looksLikeVideo) || null
          : cameraSourceMode === 'ip'
            ? maskStreamUri(rawExternalStreamCandidates[0])
            : selectedSource,
      sourceUri: cameraSourceMode === 'ip' ? maskStreamUri(rawExternalStreamCandidates[0]) : '',
      lockedMode: cameraSourceMode,
      usbModeLocked,
      selectedCameraModeSnapshot,
      hasUvcWebcam,
      stableHasUvcWebcam,
      rawRtspCandidateCount: rawExternalStreamCandidates.length,
    });

    if (!usbModeLocked && rawExternalStreamCandidates.length) {
      debugVideoLog('[CameraSource] active=rtsp', {
        source: 'rtsp',
        selectedMode: cameraSourceMode,
        candidateCount: rawExternalStreamCandidates.length,
        first: maskStreamUri(rawExternalStreamCandidates[0]),
      });
    }
  }, [
    cameraSourceMode,
    hasUvcWebcam,
    rawExternalStreamCandidates,
    selectedCameraModeSnapshot,
    selectedSource,
    stableHasUvcWebcam,
    usbDevices,
    usbModeLocked,
  ]);

  useEffect(() => {
    setExternalStreamIndex(0);
    setExternalStreamReady(false);
    setExternalStreamErrorMessage('');
    setExternalStreamReloadNonce(prev => prev + 1);
    lastRtspProgressAtRef.current = Date.now();
    lastRtspProgressTimeRef.current = null;
    (globalThis as any).__APLUS_RTSP_CANDIDATES__ = externalStreamCandidates;
    if (externalStreamCandidates.length) {
      debugVideoLog('[IPCamera] rtsp-candidate-list-ready', {
        count: externalStreamCandidates.length,
        first: maskStreamUri(externalStreamCandidates[0]),
      });
    }
  }, [externalStreamSignature]);

  useEffect(() => {
    if (cameraSourceMode !== 'ip' || effectiveWebcamType === WebcamType.camera || !currentExternalStreamUri || externalStreamReady) {
      return;
    }

    const timeout = setTimeout(() => {
      const hasNext = externalStreamIndex + 1 < externalStreamCandidates.length;
      if (hasNext) {
        debugVideoLog('[IPCamera] rtsp-timeout-try-next', {
          failed: maskStreamUri(currentExternalStreamUri),
          next: maskStreamUri(externalStreamCandidates[externalStreamIndex + 1]),
        });
        setExternalStreamIndex(prev => prev + 1);
        setExternalStreamReady(false);
        setExternalStreamErrorMessage('');
        return;
      }

      setExternalStreamErrorMessage(IP_CAMERA_ERROR_MESSAGE);
      debugVideoLog('[IPCamera] rtsp-error', {
        reason: 'timeout-all-candidates',
        url: maskStreamUri(currentExternalStreamUri),
      });
      props.setIsCameraReady(false);
    }, RTSP_STREAM_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    cameraSourceMode,
    currentExternalStreamUri,
    effectiveWebcamType,
    externalStreamCandidates,
    externalStreamIndex,
    externalStreamReady,
    props.setIsCameraReady,
  ]);


  const reconnectRtspPreview = useCallback(
    (reason: string) => {
      if (cameraSourceMode !== 'ip' || !currentExternalStreamUri) {
        return;
      }

      const now = Date.now();
      if (now - lastRtspReconnectAtRef.current < RTSP_RECONNECT_THROTTLE_MS) {
        return;
      }

      lastRtspReconnectAtRef.current = now;
      lastRtspProgressAtRef.current = now;
      lastRtspProgressTimeRef.current = null;
      setExternalStreamReady(false);
      setExternalStreamErrorMessage('');
      debugVideoLog('[CameraWatchdog] rtsp-reconnect', {
        reason,
        uri: maskStreamUri(currentExternalStreamUri),
        reloadNonce: externalStreamReloadNonce + 1,
      });
      setExternalStreamReloadNonce(prev => prev + 1);
    },
    [cameraSourceMode, currentExternalStreamUri, externalStreamReloadNonce],
  );

  useEffect(() => {
    if (cameraSourceMode !== 'ip' || effectiveWebcamType === WebcamType.camera || !currentExternalStreamUri) {
      return;
    }

    lastRtspProgressAtRef.current = Date.now();
    lastRtspProgressTimeRef.current = null;

    const interval = setInterval(() => {
      const lastProgressAgeMs = Date.now() - lastRtspProgressAtRef.current;
      if (externalStreamReady && lastProgressAgeMs > RTSP_PROGRESS_FROZEN_MS) {
        debugVideoLog('[CameraWatchdog] frozen-stream-detected', {
          sourceMode: 'ip',
          lastProgressAgeMs,
          uri: maskStreamUri(currentExternalStreamUri),
        });
        reconnectRtspPreview('progress-watchdog');
      }
    }, RTSP_PROGRESS_WATCHDOG_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [
    cameraSourceMode,
    currentExternalStreamUri,
    effectiveWebcamType,
    externalStreamReady,
    reconnectRtspPreview,
  ]);

  useEffect(() => {
    if (cameraSourceMode !== 'ip' || !currentExternalStreamUri) {
      return;
    }

    if (props.fullscreenMode) {
      debugVideoLog('[CameraWatchdog] fullscreen-enter-reconnect-rtsp', {
        sourceMode: 'ip',
        uri: maskStreamUri(currentExternalStreamUri),
      });
      reconnectRtspPreview('fullscreen-enter');
    }
  }, [cameraSourceMode, currentExternalStreamUri, props.fullscreenMode, reconnectRtspPreview]);

  useEffect(() => {
    const isScreenReady =
      appState === 'active' && (isFocused || props.ignoreNavigationFocusLoss === true);

    if (isScreenReady) {
      if (lifecycleReleaseTimeoutRef.current) {
        clearTimeout(lifecycleReleaseTimeoutRef.current);
        lifecycleReleaseTimeoutRef.current = null;
      }
      setCameraLifecycleActive(true);
      return;
    }

    if (lifecycleReleaseTimeoutRef.current) {
      clearTimeout(lifecycleReleaseTimeoutRef.current);
    }

    lifecycleReleaseTimeoutRef.current = setTimeout(() => {
      setCameraLifecycleActive(false);
      lifecycleReleaseTimeoutRef.current = null;
    }, 1200);

    return () => {
      if (lifecycleReleaseTimeoutRef.current) {
        clearTimeout(lifecycleReleaseTimeoutRef.current);
        lifecycleReleaseTimeoutRef.current = null;
      }
    };
  }, [appState, isFocused]);

  useEffect(() => {
    const devices = Camera.getAvailableCameraDevices();
    debugVideoLog(
      '[Video] available cameras:',
      devices.map(d => ({
        id: d.id,
        name: d.name,
        physicalDevices: d.physicalDevices,
        position: d.position,
      })),
    );
  }, [backDevice?.id, frontDevice?.id, externalDevice?.id]);

  const refreshUsbDevices = useCallback(async (reason: string = 'manual') => {
  try {
    const devices = await listUsbDevices();
    debugVideoLog('[USBCamera] usb-devices', {reason, devices});
    setUsbDevices(prev => (areUsbDevicesEqual(prev as any[], devices as any[]) ? prev : devices));
    return devices;
  } catch (error) {
    debugVideoLog('[USBCamera] reconnect-failed', {reason, error: String((error as any)?.message || error)});
    console.warn('[UVC] usb devices error:', {reason, error});
    setUsbDevices(prev => (Array.isArray(prev) && prev.length === 0 ? prev : []));
    return [] as any[];
  }
}, []);

  useEffect(() => {
    void refreshUsbDevices('mount');
  }, [refreshUsbDevices]);

  useEffect(() => {
  if (
    appState === 'active' &&
    isFocused &&
    effectiveWebcamType === WebcamType.camera &&
    !(recordingStateRef.current !== 'idle' && selectedSourceRef.current !== 'external')
  ) {
    refreshUsbDevices('focus-active');
  }
}, [appState, isFocused, effectiveWebcamType, refreshUsbDevices]);

  useEffect(() => {
  if (effectiveWebcamType !== WebcamType.camera) {
    return;
  }

  const interval = setInterval(() => {
    if (appState !== 'active' || !isFocused) {
      return;
    }

    if (recordingStateRef.current !== 'idle' && selectedSourceRef.current !== 'external') {
      return;
    }

    refreshUsbDevices('interval');
  }, USB_RESCAN_INTERVAL_MS);

  return () => {
    clearInterval(interval);
  };
}, [appState, isFocused, effectiveWebcamType, refreshUsbDevices]);


  const autoSelectedUvcRef = useRef(false);

  useEffect(() => {
    const hadUvcLastTime = lastRawUvcPresenceRef.current;
    lastRawUvcPresenceRef.current = hasUvcWebcam;

    if (hasUvcWebcam) {
      if (!hadUvcLastTime) {
        debugVideoLog('[USBCamera] device-attached', {reconnect: hadUvcLastTime === false});
      }
      if (uvcPresenceTimeoutRef.current) {
        clearTimeout(uvcPresenceTimeoutRef.current);
        uvcPresenceTimeoutRef.current = null;
      }
      setStableHasUvcWebcam(true);
      return;
    }

    if (hadUvcLastTime) {
      debugVideoLog('[USBCamera] disconnected', {reason: 'probe-temporarily-missing'});
      debugVideoLog('[USBCamera] reconnect-scheduled', {delayMs: UVC_PRESENCE_GRACE_MS});
    }

    if (uvcPresenceTimeoutRef.current) {
      clearTimeout(uvcPresenceTimeoutRef.current);
    }

    uvcPresenceTimeoutRef.current = setTimeout(() => {
      debugVideoLog('[USBCamera] reconnect-failed', {reason: 'usb-presence-grace-expired'});
      setStableHasUvcWebcam(false);
      uvcPresenceTimeoutRef.current = null;
    }, UVC_PRESENCE_GRACE_MS);

    return () => {
      if (uvcPresenceTimeoutRef.current) {
        clearTimeout(uvcPresenceTimeoutRef.current);
        uvcPresenceTimeoutRef.current = null;
      }
    };
  }, [hasUvcWebcam]);

  const availableSources = useMemo(() => {
    // Android score app ưu tiên USB webcam tuyệt đối khi đã phát hiện UVC.
    // Không cho nút Đổi cam quay về camera điện thoại nữa, vì người dùng cần webcam USB.
    if (Platform.OS === 'android' && hasUsbVideoSource && !hasExternalStreamSource) {
      return ['external'] as CameraSource[];
    }

    const sources: CameraSource[] = [];
    if (backDevice) sources.push('back');
    if (frontDevice) sources.push('front');

    // Android USB webcam thường không xuất hiện trong VisionCamera,
    // nên vẫn phải cho nguồn external khi UVC probe phát hiện thiết bị video.
    if (externalDevice || hasUsbVideoSource) sources.push('external');

    return sources;
  }, [backDevice, frontDevice, externalDevice, hasUsbVideoSource, hasExternalStreamSource]);

  useEffect(() => {
    setUvcPresenceSnapshot(!!(externalDevice || hasUsbVideoSource));
    setAvailableCameraSourcesSnapshot(availableSources);

    return () => {
      setUvcPresenceSnapshot(false);
      setAvailableCameraSourcesSnapshot([]);
    };
  }, [externalDevice, hasUsbVideoSource, availableSources]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (hasExternalStreamSource) {
      autoSelectedUvcRef.current = false;
      return;
    }

    if (!hasUsbVideoSource) {
      autoSelectedUvcRef.current = false;
      return;
    }

    if (effectiveWebcamType !== WebcamType.camera || appState !== 'active' || !isFocused) {
      return;
    }

    if (recordingStateRef.current !== 'idle') {
      return;
    }

    // Bản Android offline dùng USB webcam làm nguồn chính.
    // Delay nhẹ để màn gameplay mount ổn định rồi mới mount UVC native, tránh crash loading.
    const timeout = setTimeout(() => {
      if (recordingStateRef.current !== 'idle') {
        return;
      }

      autoSelectedUvcRef.current = true;
      debugVideoLog('[USBCamera] reconnect-success', {reason: 'auto-select-external-after-gameplay-ready'});
      setCurrentCameraSourceSnapshot('external');
      setSelectedSource(current => (current === 'external' ? current : 'external'));
    }, autoSelectedUvcRef.current ? 0 : 900);

    return () => {
      clearTimeout(timeout);
    };
  }, [appState, effectiveWebcamType, hasExternalStreamSource, hasUsbVideoSource, isFocused]);

  const youtubeSourceLock = getYouTubeNativeSourceLock();

  const preferredSource = useMemo<CameraSource>(() => {
    const snapshotSource = getSelectedSourceSnapshot();

    if (Platform.OS === 'android' && hasUsbVideoSource && !hasExternalStreamSource && availableSources.includes('external')) {
      return 'external';
    }

    if (youtubeSourceLock === 'external' && availableSources.includes('external')) {
      return 'external';
    }

    if (youtubeSourceLock === 'front' && availableSources.includes('front')) {
      return 'front';
    }

    if (youtubeSourceLock === 'back' && availableSources.includes('back')) {
      return 'back';
    }

    if (availableSources.includes(snapshotSource)) {
      return snapshotSource;
    }

    if (availableSources.includes('back')) return 'back';
    if (availableSources.includes('front')) return 'front';
    return 'external';
  }, [availableSources, hasExternalStreamSource, hasUsbVideoSource, youtubeSourceLock]);

  useEffect(() => {
    if (!availableSources.length) {
      return;
    }

    setSelectedSource(current => {
      if (Platform.OS === 'android' && hasUsbVideoSource && !hasExternalStreamSource && availableSources.includes('external')) {
        if (current !== 'external') {
          debugVideoLog('[CameraSource] selectedMode=usb', {
            lockedMode: 'usb',
            reason: 'usb-present-force-external',
            from: current,
            to: 'external',
          });
        }
        setCurrentCameraSourceSnapshot('external');
        return 'external';
      }

      if (youtubeSourceLock && availableSources.includes(youtubeSourceLock)) {
        if (current !== youtubeSourceLock) {
          debugVideoLog('[Video] force source because youtube lock is active:', {
            from: current,
            to: youtubeSourceLock,
          });
        }
        return youtubeSourceLock;
      }

      const snapshotSource = getSelectedSourceSnapshot();

      if (availableSources.includes(snapshotSource) && current !== snapshotSource) {
        return snapshotSource;
      }

      if (availableSources.includes(current)) {
        return current;
      }
      return preferredSource;
    });
  }, [availableSources, hasExternalStreamSource, hasUsbVideoSource, preferredSource, youtubeSourceLock]);

  const resolveBackendForSource = useCallback(
    (source: CameraSource): BackendType => {
      const sourceUsesUvc =
        effectiveWebcamType === WebcamType.camera &&
        source === 'external' &&
        hasUsbVideoSource &&
        Platform.OS === 'android';
      return sourceUsesUvc ? 'uvc' : 'vision';
    },
    [effectiveWebcamType, hasUsbVideoSource],
  );

  useEffect(() => {
    const unsubscribe = subscribeCycleCameraSource(() => {
      setSelectedSource(current => {
        if (youtubeSourceLock === 'external') {
          debugVideoLog('[Video] block cycle camera source while external live lock is active');
          return 'external';
        }

        if (!availableSources.length) {
          return current;
        }

        const currentIndex = availableSources.indexOf(current);
        const safeIndex = currentIndex >= 0 ? currentIndex : -1;
        const nextIndex = (safeIndex + 1) % availableSources.length;
        const nextSource = availableSources[nextIndex];
        const currentBackend = resolveBackendForSource(current);
        const nextBackend = resolveBackendForSource(nextSource);
        const isCrossBackendSwitch = currentBackend !== nextBackend;
        const isRecordingBusy =
          activeRecordingBackendRef.current !== null ||
          recordingStateRef.current !== 'idle';

        if (isCrossBackendSwitch && isRecordingBusy) {
          debugVideoLog('[Video] block camera source switch during cross-backend recording', {
            from: current,
            to: nextSource,
            currentBackend,
            nextBackend,
            recordingState: recordingStateRef.current,
            activeBackend: activeRecordingBackendRef.current,
          });
          return current;
        }

        debugVideoLog('[Video] cycle camera source:', {
          availableSources,
          from: current,
          to: nextSource,
        });

        setCurrentCameraSourceSnapshot(nextSource);
        return nextSource;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
        return;
      }

      unsubscribe?.remove?.();
    };
  }, [availableSources, resolveBackendForSource, youtubeSourceLock]);

  const resolvedSelectedSource = useMemo<CameraSource>(() => {
    if (!availableSources.length) {
      return selectedSource;
    }

    if (availableSources.includes(selectedSource)) {
      return selectedSource;
    }

    return preferredSource;
  }, [availableSources, preferredSource, selectedSource]);

  const usingUvc =
    effectiveWebcamType === WebcamType.camera &&
    resolvedSelectedSource === 'external' &&
    hasUsbVideoSource &&
    Platform.OS === 'android';

  useEffect(() => {
    if (!usingUvc) {
      return;
    }

    let cancelled = false;
    const inspectFullscreenSurface = async (reason: string) => {
      try {
        await requestUvcLayout(reason);
        const status = await getUvcPreviewStatus();
        if (cancelled) {
          return;
        }
        debugVideoLog('[USBWebcamFullscreen] bind-surface', {
          reason,
          activeView: status.activeView,
          surfaceReady: status.surfaceReady,
          cameraOpened: status.cameraOpened,
          previewStarted: status.previewStarted,
          viewWidth: status.viewWidth,
          viewHeight: status.viewHeight,
          lastFrameAgeMs: status.lastFrameAgeMs,
        });
        if (isUvcPreviewStatusGameplayReady(status)) {
          debugVideoLog('[USBWebcamFullscreen] frame-visible', {
            reason,
            lastFrameAgeMs: status.lastFrameAgeMs,
            viewWidth: status.viewWidth,
            viewHeight: status.viewHeight,
          });
        }
      } catch (error) {
        debugVideoLog('[USBWebcamFullscreen] bind-surface-error', {
          reason,
          exception: String((error as any)?.message || error),
        });
      }
    };

    if (props.fullscreenMode) {
      // Do not restart/detach the UVC camera when entering fullscreen. Most USB
      // cameras expose only one active stream/surface; restarting here often
      // turns fullscreen black. Keep the same native session and only relayout it.
      debugVideoLog('[USBWebcamFullscreen] open', {
        action: 'layout-only-keep-active-preview',
        cameraLayoutKey: props.cameraLayoutKey,
      });
      void inspectFullscreenSurface('video-fullscreen-enter-layout-only');
      const timers = [120, 360, 800].map(delay =>
        setTimeout(() => {
          void inspectFullscreenSurface(`video-fullscreen-rebind-${delay}`);
        }, delay),
      );
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    debugVideoLog('[USBWebcamFullscreen] close', {
      action: 'layout-only-keep-active-preview',
      cameraLayoutKey: props.cameraLayoutKey,
    });
    void inspectFullscreenSurface('video-inline-layout');
    return () => {
      cancelled = true;
    };
  }, [props.fullscreenMode, props.cameraLayoutKey, usingUvc]);

  useEffect(() => {
    if (!usingUvc || appState !== 'active' || !isFocused) {
      return;
    }

    const checkUvcPreview = async () => {
      try {
        const status = await getUvcPreviewStatus();
        await requestUvcLayout('uvc-watchdog-layout');

        if (!status.activeView) {
          return;
        }

        const lastFrameAgeMs = Number(status.lastFrameAgeMs ?? -1);
        const hasFrameCallback = status.hasFrameCallback === true;
        const previewStopped = status.previewStarted === false &&
          status.cameraOpened === true &&
          status.surfaceReady === true;
        const frameFrozen = hasFrameCallback &&
          lastFrameAgeMs >= UVC_PREVIEW_FROZEN_MS;

        if (!previewStopped && !frameFrozen) {
          return;
        }

        debugVideoLog('[USBCamera] preview-frozen detected', {
          lastFrameAgeMs,
          previewStopped,
          hasFrameCallback,
          isRecording: !!status.isRecording,
        });

        if (status.isRecording) {
          debugVideoLog('[USBCamera] restart-preview skipped', {reason: 'recording-active'});
          return;
        }

        const now = Date.now();
        if (now - lastUvcRestartAtRef.current < UVC_RESTART_THROTTLE_MS) {
          return;
        }

        lastUvcRestartAtRef.current = now;
        debugVideoLog('[USBCamera] restart-preview', {
          reason: frameFrozen ? 'frame-watchdog' : 'preview-stopped-watchdog',
        });
        await restartUvcPreview(frameFrozen ? 'frame-watchdog' : 'preview-stopped-watchdog');
      } catch (error) {
        debugVideoLog('[USBCamera] watchdog-status-error', {error: String(error)});
      }
    };

    void checkUvcPreview();
    const interval = setInterval(() => {
      void checkUvcPreview();
    }, UVC_PREVIEW_WATCHDOG_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [appState, isFocused, usingUvc]);

  useEffect(() => {
    if (usingUvc) {
      (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'uvc';
      debugVideoLog('[USBCamera] preview-start', {selectedSource: resolvedSelectedSource});
      (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ = '';
      return;
    }

    if (effectiveWebcamType === WebcamType.camera) {
      (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'vision';
      (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ = '';
    }
  }, [effectiveWebcamType, usingUvc]);

  const device = useMemo(() => {
    if (usingUvc) return null;

    if (resolvedSelectedSource === 'external') {
      return externalDevice ?? backDevice ?? frontDevice ?? null;
    }

    if (resolvedSelectedSource === 'front') {
      return frontDevice ?? backDevice ?? externalDevice ?? null;
    }

    return backDevice ?? frontDevice ?? externalDevice ?? null;
  }, [usingUvc, resolvedSelectedSource, externalDevice, backDevice, frontDevice]);

  const preferredFormat = useCameraFormat(device, [
    {videoResolution: {width: 1920, height: 1080}},
    {fps: 30},
  ]);

  const rawMinZoom = useMemo(() => finiteNumber(device?.minZoom, 1), [device?.id, device?.minZoom]);
  const rawMaxZoom = useMemo(() => finiteNumber(device?.maxZoom, rawMinZoom), [device?.id, device?.maxZoom, rawMinZoom]);
  const visionZoomSupported = !!device && hasUsableZoomRange(rawMinZoom, rawMaxZoom);
  const minZoom = useMemo(() => {
    return visionZoomSupported ? rawMinZoom : 1;
  }, [rawMinZoom, visionZoomSupported]);
  const maxZoom = useMemo(() => {
    return visionZoomSupported ? rawMaxZoom : minZoom;
  }, [rawMaxZoom, minZoom, visionZoomSupported]);
  const neutralZoom = useMemo(() => {
    const neutral = finiteNumber(device?.neutralZoom, minZoom);
    return clamp(neutral, minZoom, maxZoom);
  }, [device?.id, device?.neutralZoom, minZoom, maxZoom]);

  const activeZoomKey = useMemo(() => {
    if (isExternalStreamPreview) {
      return `stream:${currentExternalStreamUri || 'external'}`;
    }

    if (usingUvc) {
      return 'uvc:external';
    }

    if (Platform.OS === 'android' && isYouTubeNativeCameraEnabled()) {
      return `youtube-native:${resolvedSelectedSource}`;
    }

    return `vision:${resolvedSelectedSource}:${device?.id || 'unknown'}`;
  }, [currentExternalStreamUri, device?.id, isExternalStreamPreview, resolvedSelectedSource, usingUvc]);

  const safeZoom = useMemo(() => {
    return clamp(Number.isFinite(zoom) ? zoom : neutralZoom, minZoom, maxZoom);
  }, [zoom, neutralZoom, minZoom, maxZoom]);

  const persistZoomSnapshot = useCallback(
    (key: string, entry: PersistedZoomEntry) => {
      if (!key || !entry.supported || !hasUsableZoomRange(entry.minZoom, entry.maxZoom)) {
        return;
      }

      const normalized: PersistedZoomEntry = {
        ...entry,
        zoom: clamp(entry.zoom, entry.minZoom, entry.maxZoom),
        supported: true,
        unit: normalizeZoomUnit(entry.unit),
      };
      const nextStore = {
        ...zoomStoreRef.current,
        [key]: normalized,
      };
      zoomStoreRef.current = nextStore;
      (globalThis as any).__APLUS_CAMERA_ZOOM_STORE__ = nextStore;
      void persistCameraZoomStore(nextStore);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadCameraZoomStore().then(stored => {
      if (cancelled) {
        return;
      }

      const merged = {
        ...zoomStoreRef.current,
        ...stored,
      };
      zoomStoreRef.current = merged;
      (globalThis as any).__APLUS_CAMERA_ZOOM_STORE__ = merged;
      setZoomStoreHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeZoomKeyRef.current = activeZoomKey;
  }, [activeZoomKey]);

  useEffect(() => {
    selectedSourceRef.current = resolvedSelectedSource;
    usingUvcRef.current = usingUvc;
    effectiveWebcamTypeRef.current = effectiveWebcamType;
    isExternalStreamPreviewRef.current = isExternalStreamPreview;
    currentExternalStreamUriRef.current = currentExternalStreamUri;
    deviceRef.current = device;

    if (isExternalStreamPreview) {
      setRtspGameplaySnapshot(currentExternalStreamUri, externalStreamCandidates);
    } else if (usingUvc) {
      setCurrentCameraSourceSnapshot('external');
      (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ = 'usb';
    } else {
      (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ = 'builtInCamera';
      setCurrentCameraSourceSnapshot(resolvedSelectedSource);
    }

    updateRecordingInfoSnapshot({
      source: usingUvc ? 'external' : resolvedSelectedSource,
      backend: isExternalStreamPreview ? 'rtsp' : usingUvc ? 'uvc' : undefined,
    });
  }, [
    currentExternalStreamUri,
    device,
    effectiveWebcamType,
    externalStreamCandidates,
    isExternalStreamPreview,
    resolvedSelectedSource,
    usingUvc,
    updateRecordingInfoSnapshot,
  ]);

  useEffect(() => {
    if (isExternalStreamPreview) {
      zoomSnapshotRef.current = {
        supported: false,
        minZoom: 1,
        maxZoom: 1,
        zoom: 1,
        source: resolvedSelectedSource,
        unit: 'ratio',
        key: activeZoomKey,
      };
      setZoom(prev => (prev === 1 ? prev : 1));
      return;
    }

    zoomSnapshotRef.current = {
      supported: visionZoomSupported,
      minZoom,
      maxZoom,
      zoom: safeZoom,
      source: resolvedSelectedSource,
      unit: 'ratio',
      key: activeZoomKey,
    };
  }, [
    activeZoomKey,
    isExternalStreamPreview,
    maxZoom,
    minZoom,
    resolvedSelectedSource,
    safeZoom,
    visionZoomSupported,
  ]);

  useEffect(() => {
    if (isExternalStreamPreview || usingUvc || !device || !zoomStoreHydrated) {
      return;
    }

    const stored = zoomStoreRef.current[activeZoomKey];
    const restoredZoom =
      stored?.supported && hasUsableZoomRange(minZoom, maxZoom)
        ? clamp(stored.zoom, minZoom, maxZoom)
        : neutralZoom;

    setZoom(prev => (Math.abs(prev - restoredZoom) <= ZOOM_EPSILON ? prev : restoredZoom));
    restoredZoomKeyRef.current = activeZoomKey;
  }, [
    activeZoomKey,
    device,
    isExternalStreamPreview,
    maxZoom,
    minZoom,
    neutralZoom,
    usingUvc,
    zoomStoreHydrated,
  ]);

  const refreshUvcZoomInfo = useCallback(
    async (reason: string = 'manual') => {
      try {
        const info = await getUvcZoomInfo();
        const normalized = normalizeUvcZoomInfo(info);

        if (!isSameZoomInfo(uvcZoomInfoRef.current, normalized)) {
          uvcZoomInfoRef.current = normalized;
          setUvcZoomInfoState(normalized);
        }

        setZoom(prev => {
          const nextZoom = normalized.zoom ?? 1;
          return Math.abs(prev - nextZoom) <= ZOOM_EPSILON ? prev : nextZoom;
        });
        debugVideoLog('[UVC] getZoomInfo:', {reason, info: normalized});
        debugVideoLog('[CameraCapability] source=usb zoomSupported=' + String(normalized.supported), {
          source: 'usb',
          zoomSupported: normalized.supported,
          minZoom: normalized.minZoom,
          maxZoom: normalized.maxZoom,
          zoom: normalized.zoom,
          unit: normalized.unit,
          reason,
        });
        debugVideoLog('[CameraCapability] source=usb maxZoom=' + String(normalized.maxZoom), {
          source: 'usb',
          maxZoom: normalized.maxZoom,
          zoomSupported: normalized.supported,
          reason,
        });
        return normalized;
      } catch (error) {
        console.warn('[UVC] getZoomInfo error:', {reason, error});
        const fallback = normalizeUvcZoomInfo(uvcZoomInfoRef.current || DEFAULT_UVC_ZOOM);

        if (fallback.supported || selectedSourceRef.current === 'external') {
          if (!isSameZoomInfo(uvcZoomInfoRef.current, fallback)) {
            uvcZoomInfoRef.current = fallback;
            setUvcZoomInfoState(fallback);
          }
          setZoom(prev => {
            const nextZoom = fallback.zoom ?? 1;
            return Math.abs(prev - nextZoom) <= ZOOM_EPSILON ? prev : nextZoom;
          });
          debugVideoLog('[CameraCapability] source=usb zoomSupported=' + String(fallback.supported), {
            source: 'usb',
            zoomSupported: fallback.supported,
            minZoom: fallback.minZoom,
            maxZoom: fallback.maxZoom,
            reason: reason + '-fallback',
          });
          debugVideoLog('[CameraCapability] source=usb maxZoom=' + String(fallback.maxZoom), {
            source: 'usb',
            maxZoom: fallback.maxZoom,
            zoomSupported: fallback.supported,
            reason: reason + '-fallback',
          });
          return fallback;
        }

        uvcZoomInfoRef.current = DEFAULT_UVC_ZOOM;
        setUvcZoomInfoState(DEFAULT_UVC_ZOOM);
        setZoom(prev => (prev === 1 ? prev : 1));
        return DEFAULT_UVC_ZOOM;
      }
    },
    [],
  );

  const refreshYouTubeNativeZoomInfo = useCallback(
    async (reason: string = 'manual') => {
      try {
        const info = await getYouTubeNativeZoomInfo();
        const normalized: YouTubeNativeZoomInfo = {
          ...DEFAULT_YOUTUBE_NATIVE_ZOOM,
          ...info,
          source: info?.source || 'youtube-native',
        };
        if (!isSameZoomInfo(youtubeNativeZoomInfoRef.current, normalized)) {
          youtubeNativeZoomInfoRef.current = normalized;
          setYoutubeNativeZoomInfoState(normalized);
        }
        setZoom(prev => {
          const nextZoom = normalized.zoom ?? 1;
          return prev === nextZoom ? prev : nextZoom;
        });
        debugVideoLog('[YT Native] getZoomInfo:', {reason, info: normalized});
        return normalized;
      } catch (error) {
        debugVideoLog('[YT Native] getZoomInfo error:', {reason, error});
        const fallback =
          youtubeNativeZoomInfoRef.current || DEFAULT_YOUTUBE_NATIVE_ZOOM;
        if (!isSameZoomInfo(youtubeNativeZoomInfoRef.current, fallback)) {
          setYoutubeNativeZoomInfoState(fallback);
        }
        setZoom(prev => {
          const nextZoom = fallback.zoom ?? 1;
          return prev === nextZoom ? prev : nextZoom;
        });
        return fallback;
      }
    },
    [],
  );

  useEffect(() => {
    if (!usingUvc) {
      return;
    }

    refreshUvcZoomInfo('enter-uvc');

    const interval = setInterval(() => {
      if (appState === 'active' && isFocused) {
        refreshUvcZoomInfo('interval');
      }
    }, UVC_ZOOM_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [usingUvc, resolvedSelectedSource, appState, isFocused, refreshUvcZoomInfo]);

  useEffect(() => {
    if (!usingUvc || !zoomStoreHydrated || restoredZoomKeyRef.current === activeZoomKey) {
      return;
    }

    const info = uvcZoomInfoRef.current;
    if (!info?.supported || !hasUsableZoomRange(info.minZoom, info.maxZoom)) {
      return;
    }

    const stored = zoomStoreRef.current[activeZoomKey];
    if (!stored?.supported) {
      restoredZoomKeyRef.current = activeZoomKey;
      return;
    }

    const restoredZoom = clamp(stored.zoom, info.minZoom, info.maxZoom);
    restoredZoomKeyRef.current = activeZoomKey;
    controllerRef.current?.setZoom?.(restoredZoom);
  }, [activeZoomKey, uvcZoomInfoState, usingUvc, zoomStoreHydrated]);

  useEffect(() => {
    debugVideoLog('[Video] selected source:', resolvedSelectedSource);
    if (!device) return;
    debugVideoLog('[Video] selected device:', {
      id: device.id,
      name: device.name,
      physicalDevices: device.physicalDevices,
      position: device.position,
      previewViewType:
        Platform.OS === 'android'
          ? props.androidPreviewViewTypeOverride || 'surface-view'
          : 'default',
    });
  }, [resolvedSelectedSource, device?.id]);

  const refreshCameraPermission = useCallback(async () => {
    if (effectiveWebcamType !== WebcamType.camera || usingUvc) {
      setPermissionState('granted');
      return;
    }

    try {
      const current = await Camera.getCameraPermissionStatus();
      debugVideoLog('[Video] camera permission status:', current);
      if (current === 'granted') {
        setPermissionState('granted');
        return;
      }

      if (current === 'not-determined') {
        const next = await Camera.requestCameraPermission();
        debugVideoLog('[Video] camera permission request result:', next);
        setPermissionState(next === 'granted' ? 'granted' : 'denied');
        return;
      }

      setPermissionState('denied');
    } catch (error) {
      debugVideoLog('[Video] camera permission error:', error);
      setPermissionState('denied');
    }
  }, [effectiveWebcamType, usingUvc]);

  const refreshMicrophonePermission = useCallback(
    async (requestIfNeeded: boolean = true): Promise<PermissionState> => {
      if (effectiveWebcamType !== WebcamType.camera || usingUvc) {
        setMicrophonePermissionState('granted');
        return 'granted';
      }

      try {
        const current = await Camera.getMicrophonePermissionStatus();
        debugVideoLog('[Video] microphone permission status:', current);
        if (current === 'granted') {
          setMicrophonePermissionState('granted');
          return 'granted';
        }

        if (current === 'not-determined' && requestIfNeeded) {
          const next = await Camera.requestMicrophonePermission();
          debugVideoLog('[Video] microphone permission request result:', next);
          const nextState = next === 'granted' ? 'granted' : 'denied';
          setMicrophonePermissionState(nextState);
          return nextState;
        }

        setMicrophonePermissionState('denied');
        return 'denied';
      } catch (error) {
        debugVideoLog('[Video] microphone permission error:', error);
        setMicrophonePermissionState('denied');
        return 'denied';
      }
    },
    [effectiveWebcamType, usingUvc],
  );

  useEffect(() => {
    refreshMicrophonePermissionRef.current = refreshMicrophonePermission;
  }, [refreshMicrophonePermission]);

  useEffect(() => {
    void refreshCameraPermission();
    void refreshMicrophonePermission();
  }, [refreshCameraPermission, refreshMicrophonePermission]);

  useEffect(() => {
    if (appState === 'active' && isFocused) {
      void refreshCameraPermission();
      void refreshMicrophonePermission(false);
    }
  }, [appState, isFocused, refreshCameraPermission, refreshMicrophonePermission]);

  useEffect(() => {
    const sourceKey = `${resolvedSelectedSource}:${device?.id || 'unknown'}`;
    const sourceChanged = lastResolvedPhoneSourceKeyRef.current !== sourceKey;
    let isCancelled = false;

    lastResolvedPhoneSourceKeyRef.current = sourceKey;
    setCameraErrorMessage(null);
    setExternalStreamReady(false);
    setPhoneModeHydrated(false);

    const applyPreferredMode = async () => {
      const persistedModes = await loadSuccessfulPhoneModesFromStorage();
      if (isCancelled) {
        return;
      }

      if (Object.keys(persistedModes).length > 0) {
        lastSuccessfulPhoneModeRef.current = {
          ...persistedModes,
          ...lastSuccessfulPhoneModeRef.current,
        };
        (globalThis as any).__APLUS_SUCCESSFUL_PHONE_MODES__ =
          lastSuccessfulPhoneModeRef.current;
      }

      const nextPreferredMode = getPreferredPhoneMode(resolvedSelectedSource, device?.id);
      setPreferredPhoneMode(nextPreferredMode);
      setPhoneModeHydrated(true);

      if (sourceChanged) {
        pendingPhoneModeSourceKeyRef.current = null;
        setPhoneCameraConfigMode(nextPreferredMode);
        props.setIsCameraReady(false);
      }
    };

    void applyPreferredMode();

    return () => {
      isCancelled = true;
    };
  }, [
    device?.id,
    getPreferredPhoneMode,
    props.setIsCameraReady,
    resolvedSelectedSource,
  ]);

  useEffect(() => {
    if (effectiveWebcamType !== WebcamType.camera) {
      setExternalStreamReady(false);
      props.setIsCameraReady(false);
    }
  }, [effectiveWebcamType, viewModel.source?.uri]);

  useEffect(() => {
    if (!usingUvc) {
      setUsbGameplayReadySnapshot(false);
      return;
    }

    let cancelled = false;
    let markedReady = false;
    setUvcPresenceSnapshot(true);
    setAvailableCameraSourcesSnapshot(['external']);
    setCurrentCameraSourceSnapshot('external');
    setCameraErrorMessage(null);
    (globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ = 'usb';
    (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'uvc';
    (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ = 'external';
    (globalThis as any).__APLUS_AVAILABLE_CAMERA_SOURCES__ = ['external'];

    const markReady = (reason: string, status?: any) => {
      if (cancelled || markedReady) {
        return;
      }
      markedReady = true;
      setUsbGameplayReadySnapshot(true, status);
      props.setIsCameraReady(true);
      debugVideoLog('[USBWebcam] preview-ready', {
        source: 'usb',
        reason,
        selectedSource: resolvedSelectedSource,
        currentSource: getSelectedSourceSnapshot(),
        hasUsbVideoSource,
        status,
      });
      debugVideoLog('[USBWebcam] source-ready-for-gameplay', {
        source: 'usb',
        reason,
        selectedSource: resolvedSelectedSource,
        currentSource: getSelectedSourceSnapshot(),
        cameraReady: true,
      });
      debugVideoLog('[GameplayStart] enabled=true source=usb', {
        source: 'usb',
        reason,
        cameraReady: true,
      });
    };

    debugVideoLog('[USBWebcam] preview-start', {
      source: 'usb',
      selectedSource: resolvedSelectedSource,
      hasUsbVideoSource,
    });

    const attempts = [0, 120, 300, 700, 1200, 2000, 3200];
    const timers = attempts.map(delay =>
      setTimeout(() => {
        void (async () => {
          try {
            await requestUvcLayout(`gameplay-ready-check-${delay}`);
            const status = await getUvcPreviewStatus();
            if (cancelled) {
              return;
            }
            if (isUvcPreviewStatusGameplayReady(status)) {
              markReady(`native-preview-status-${delay}`, status);
            } else {
              debugVideoLog('[USBWebcam] preview-waiting', {
                source: 'usb',
                delay,
                status,
              });
            }
          } catch (error) {
            debugVideoLog('[USBWebcam] preview-status-error', {
              source: 'usb',
              delay,
              exception: String((error as any)?.message || error),
            });
          }
        })();
      }, delay),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [hasUsbVideoSource, props.setIsCameraReady, resolvedSelectedSource, usingUvc]);

  const stopUsbRecordingFilePoll = useCallback(() => {
    if (uvcRecordingFilePollRef.current) {
      clearInterval(uvcRecordingFilePollRef.current);
      uvcRecordingFilePollRef.current = null;
    }
  }, []);

  const startUsbRecordingFilePoll = useCallback((outputPath: string) => {
    stopUsbRecordingFilePoll();
    let loggedCreated = false;
    let lastLoggedSize = 0;
    uvcRecordingFilePollRef.current = setInterval(() => {
      void (async () => {
        const info = await inspectVideoFile(outputPath, MIN_USB_SHORT_REPLAY_BYTES);
        let status: any = null;
        try {
          status = await getUvcPreviewStatus();
        } catch {}
        const encodedCount = Number(status?.recorderEncodedFrameCount || 0);
        debugVideoLog('[USBWebcam] recording-file-check', {
          source: 'usb',
          outputPath,
          fileExists: info.exists,
          fileSize: info.size,
          usable: info.usable,
          previewFirstFrameReceived: status?.previewFirstFrameReceived === true,
          recorderFirstFrameReceived: status?.recorderFirstFrameReceived === true,
          recorderEncodedFrameCount: encodedCount,
        });
        if (info.size > 0 && !loggedCreated) {
          loggedCreated = true;
          debugVideoLog('[USBWebcamRecorder] file-created exists=true', {
            source: 'usb',
            outputPath,
            fileExists: info.exists,
            fileSize: info.size,
          });
        }
        if (encodedCount > 0 && info.size !== lastLoggedSize) {
          lastLoggedSize = info.size;
          debugVideoLog('[USBRecorder] encoded-frame count=' + String(encodedCount), {
            source: 'usb',
            outputPath,
            fileExists: info.exists,
            fileSize: info.size,
            recorderEncodedFrameCount: encodedCount,
          });
        }
      })();
    }, USB_RECORDING_FILE_POLL_INTERVAL_MS);
  }, [stopUsbRecordingFilePoll]);

  useEffect(() => () => {
    stopUsbRecordingFilePoll();
  }, [stopUsbRecordingFilePoll]);

  if (!controllerRef.current) {
    controllerRef.current = {
      __videoController: true,
      startRecording: async (options: any) => {
        const currentUsingUvc = usingUvcRef.current;

        if (recordingStateRef.current === 'recording') {
          debugVideoLog('[Video] startRecording skipped: already recording');
          return true;
        }

        if (recordingStateRef.current === 'starting') {
          debugVideoLog('[Video] startRecording skipped: already starting');
          return false;
        }

        if (recordingStateRef.current === 'stopping') {
          debugVideoLog('[Video] startRecording skipped: stop in progress');
          return false;
        }

        if (
          Platform.OS === 'android' &&
          !currentUsingUvc &&
          effectiveWebcamType === WebcamType.camera &&
          isYouTubeNativeCameraEnabled()
        ) {
          try {
            recordingStateRef.current = 'starting';
            activeRecordingBackendRef.current = 'youtube-native';
            updateRecordingInfoSnapshot({
              state: 'starting',
              backend: 'youtube-native',
            });
            nativeRecordingCallbacksRef.current = {
              onRecordingFinished: options?.onRecordingFinished,
              onRecordingError: options?.onRecordingError,
            };
            await startYouTubeNativeRecord(options?.path ?? '');
            recordingStateRef.current = 'recording';
            updateRecordingInfoSnapshot({
              state: 'recording',
              backend: 'youtube-native',
            });
            debugVideoLog('[RecorderFlow]', {
              event: 'start-success',
              backend: 'youtube-native',
            });
            return true;
          } catch (error) {
            debugVideoLog('[YT Native] startRecording error:', error);
            recordingStateRef.current = 'idle';
            activeRecordingBackendRef.current = null;
            updateRecordingInfoSnapshot({state: 'idle', backend: null});
            nativeRecordingCallbacksRef.current?.onRecordingError?.(error);
            nativeRecordingCallbacksRef.current = null;
            return false;
          }
        }

        if (currentUsingUvc) {
          let outputPath = '';
          try {
            recordingStateRef.current = 'starting';
            activeRecordingBackendRef.current = 'uvc';
            updateRecordingInfoSnapshot({state: 'starting', backend: 'uvc'});

            outputPath = String(options?.outputPath || options?.path || '').trim();
            if (!outputPath) {
              outputPath = await buildUsbRecordingOutputPath(options);
            }
            await RNFS.mkdir(outputPath.split('/').slice(0, -1).join('/'));

            uvcCallbacksRef.current = {
              onRecordingFinished: options?.onRecordingFinished,
              onRecordingError: options?.onRecordingError,
            };
            lastUvcRecordingPathRef.current = outputPath;
            (globalThis as any).__APLUS_USB_RECORDING_OUTPUT_PATH__ = outputPath;

            debugVideoLog('[USBWebcamRecorder] start-request', {
              source: 'usb',
              outputPath,
              webcamFolderName: options?.webcamFolderName,
              segmentIndex: options?.segmentIndex,
            });
            debugVideoLog('[USBWebcamRecorder] source=usb', {
              source: 'usb',
              outputPath,
            });
            debugVideoLog('[USBWebcamRecorder] outputPath=' + outputPath, {
              source: 'usb',
              outputPath,
            });

            await withTimeout(
              startUvcRecording(outputPath),
              UVC_RECORDING_START_TIMEOUT_MS,
              'UVC recording start timeout',
            );
            startUsbRecordingFilePoll(outputPath);
            const startEvidence = await waitForUvcRecordingEvidence(outputPath, 5000);
            debugVideoLog('[RecorderFlow]', {
              event: startEvidence.started ? 'start-success' : 'start-pending-file',
              backend: 'uvc',
              outputPath,
              ...startEvidence,
            });
            debugVideoLog('[USBWebcamRecorder] start-success', {
              source: 'usb',
              outputPath,
              ...startEvidence,
              note: startEvidence.started
                ? 'native recorder active or output file already growing'
                : 'native start returned but output file has not appeared yet; stop will validate file before replay/history',
            });
            debugVideoLog('[UVC] startRecording requested:', outputPath);
            recordingStateRef.current = 'recording';
            updateRecordingInfoSnapshot({state: 'recording', backend: 'uvc'});
            return true;
          } catch (error) {
            stopUsbRecordingFilePoll();
            const info = await inspectVideoFile(outputPath);
            debugVideoLog('[RecorderFlow]', {
              event: 'start-failed',
              backend: 'uvc',
              outputPath,
              fileExists: info.exists,
              fileSize: info.size,
              error: String((error as any)?.message || error),
            });
            debugVideoLog('[USBWebcamRecorder] start-failed', {
              source: 'usb',
              outputPath,
              fileExists: info.exists,
              fileSize: info.size,
              exception: String((error as any)?.message || error),
            });
            debugVideoLog('[UVC] startRecording error:', error);
            recordingStateRef.current = 'idle';
            activeRecordingBackendRef.current = null;
            updateRecordingInfoSnapshot({state: 'idle', backend: null});
            uvcCallbacksRef.current?.onRecordingError?.(error);
            uvcCallbacksRef.current = null;
            lastUvcRecordingPathRef.current = undefined;
            return false;
          }
        }

        const camera = visionCameraRef.current;
        if (!camera?.startRecording) {
          const err = new Error('Vision camera unavailable');
          debugVideoLog('[Video] startRecording error:', err.message);
          options?.onRecordingError?.(err);
          return false;
        }

        try {
          const microphoneStatus = await refreshMicrophonePermissionRef.current(false);
          if (microphoneStatus !== 'granted') {
            debugVideoLog(
              '[Video] startRecording microphone permission denied -> continue without audio',
            );
          }

          recordingStateRef.current = 'starting';
          activeRecordingBackendRef.current = 'vision';
          updateRecordingInfoSnapshot({state: 'starting', backend: 'vision'});

          debugVideoLog('[RecorderFlow]', {
            event: 'start-request',
            backend: 'vision',
            source: resolvedSelectedSource,
            mode: phoneCameraConfigMode,
            videoEnabled: true,
          });

          camera.startRecording({
            ...options,
            onRecordingFinished: (video: any) => {
              recordingStateRef.current = 'idle';
              activeRecordingBackendRef.current = null;
              updateRecordingInfoSnapshot({state: 'idle', backend: null});
              options?.onRecordingFinished?.(video);
            },
            onRecordingError: (error: any) => {
              recordingStateRef.current = 'idle';
              activeRecordingBackendRef.current = null;
              updateRecordingInfoSnapshot({state: 'idle', backend: null});
              options?.onRecordingError?.(error);
            },
          });

          recordingStateRef.current = 'recording';
          updateRecordingInfoSnapshot({state: 'recording', backend: 'vision'});
          debugVideoLog('[RecorderFlow]', {
            event: 'start-success',
            backend: 'vision',
            source: resolvedSelectedSource,
            mode: phoneCameraConfigMode,
          });
          return true;
        } catch (error) {
          debugVideoLog('[Video] startRecording error:', error);
          recordingStateRef.current = 'idle';
          activeRecordingBackendRef.current = null;
          updateRecordingInfoSnapshot({state: 'idle', backend: null});
          options?.onRecordingError?.(error);
          return false;
        }
      },
      stopRecording: async () => {
        const activeBackend = activeRecordingBackendRef.current;

        if (!activeBackend) {
          debugVideoLog('[Video] stopRecording skipped: no active backend');
          return null;
        }

        if (recordingStateRef.current === 'stopping') {
          debugVideoLog('[Video] stopRecording skipped: already stopping');
          return null;
        }

        recordingStateRef.current = 'stopping';
        updateRecordingInfoSnapshot({
          state: 'stopping',
          backend: activeBackend,
        });

        if (activeBackend === 'youtube-native') {
          try {
            const recordedPath = await stopYouTubeNativeRecord();
            if (recordedPath) {
              nativeRecordingCallbacksRef.current?.onRecordingFinished?.({
                path: recordedPath,
              });
            } else {
              const err: any = new Error('YouTube native video unavailable');
              err.message = 'YouTube native video unavailable';
              nativeRecordingCallbacksRef.current?.onRecordingError?.(err);
            }
            return recordedPath ? {path: recordedPath} : null;
          } catch (error) {
            nativeRecordingCallbacksRef.current?.onRecordingError?.(error);
            throw error;
          } finally {
            nativeRecordingCallbacksRef.current = null;
            activeRecordingBackendRef.current = null;
            recordingStateRef.current = 'idle';
            updateRecordingInfoSnapshot({state: 'idle', backend: null});
          }
        }

        if (activeBackend === 'uvc') {
          try {
            debugVideoLog('[USBWebcamRecorder] stop-request', {source: 'usb'});
            const nativeSavedPath = await stopUvcRecording();
            stopUsbRecordingFilePoll();
            const savedPath = nativeSavedPath || lastUvcRecordingPathRef.current;
            const info = await waitForUsableVideoFile(savedPath, 6500, MIN_USB_SHORT_REPLAY_BYTES);

            debugVideoLog('[RecorderFlow]', {
              event: info.usable ? 'native-file-path' : 'stop-failed',
              backend: 'uvc',
              outputPath: savedPath,
              nativeSavedPath,
              expectedPath: lastUvcRecordingPathRef.current,
              fileExists: info.exists,
              fileSize: info.size,
              minValidBytes: MIN_USB_SHORT_REPLAY_BYTES,
              normalMinValidBytes: MIN_VALID_VIDEO_BYTES,
              usable: info.usable,
              shortReplayMinBytes: MIN_USB_SHORT_REPLAY_BYTES,
              waitedMs: info.waitedMs,
            });
            debugVideoLog('[USBWebcamRecorder] segment-finalized exists=' + String(info.exists) + ' size=' + String(info.size), {
              source: 'usb',
              outputPath: savedPath,
              nativeSavedPath,
              expectedPath: lastUvcRecordingPathRef.current,
              fileExists: info.exists,
              fileSize: info.size,
              usable: info.usable,
              shortReplayMinBytes: MIN_USB_SHORT_REPLAY_BYTES,
              waitedMs: info.waitedMs,
            });
            debugVideoLog('[UVC] stopRecording resolved path:', savedPath, {
              exists: info.exists,
              size: info.size,
              usable: info.usable,
              shortReplayMinBytes: MIN_USB_SHORT_REPLAY_BYTES,
              nativeSavedPath,
            });

            if (info.exists && info.size > 0 && savedPath) {
              debugVideoLog('[USBRecorder] first-frame', {
                source: 'usb',
                outputPath: savedPath,
                fileSize: info.size,
                reason: 'stop-recording-file-finalized',
              });
              debugVideoLog('[USBReplay] first-frame', {
                source: 'usb',
                outputPath: savedPath,
                fileSize: info.size,
              });
            }

            if (info.usable && savedPath) {
              uvcCallbacksRef.current?.onRecordingFinished?.({path: savedPath});
              return {path: savedPath};
            }

            const err: any = new Error(
              savedPath
                ? 'UVC video file missing or too small'
                : 'UVC recorder returned no file',
            );
            debugVideoLog('[USBWebcamRecorder] error', {
              source: 'usb',
              outputPath: savedPath,
              fileExists: info.exists,
              fileSize: info.size,
              exception: err.message,
            });
            uvcCallbacksRef.current?.onRecordingError?.(err);
            return null;
          } catch (error) {
            stopUsbRecordingFilePoll();
            debugVideoLog('[USBWebcamRecorder] error', {
              source: 'usb',
              exception: String((error as any)?.message || error),
            });
            debugVideoLog('[UVC] stopRecording error:', error);
            uvcCallbacksRef.current?.onRecordingError?.(error);
            throw error;
          } finally {
            lastUvcRecordingPathRef.current = undefined;
            uvcCallbacksRef.current = null;
            activeRecordingBackendRef.current = null;
            recordingStateRef.current = 'idle';
            updateRecordingInfoSnapshot({state: 'idle', backend: null});
          }
        }

        try {
          debugVideoLog('[RecorderFlow]', {
            event: 'stop-start',
            backend: 'vision',
            source: resolvedSelectedSource,
          });
          return await visionCameraRef.current?.stopRecording?.();
        } finally {
          activeRecordingBackendRef.current = null;
          recordingStateRef.current = 'idle';
          updateRecordingInfoSnapshot({state: 'idle', backend: null});
        }
      },
      setZoom: (value: number) => {
        if (isExternalStreamPreviewRef.current || effectiveWebcamTypeRef.current !== WebcamType.camera) {
          return 1;
        }

        if (
          Platform.OS === 'android' &&
          !usingUvcRef.current &&
          isYouTubeNativeCameraEnabled()
        ) {
          const currentInfo =
            youtubeNativeZoomInfoRef.current || DEFAULT_YOUTUBE_NATIVE_ZOOM;
          const currentMinZoom = finiteNumber(currentInfo.minZoom, 1);
          const currentMaxZoom = finiteNumber(currentInfo.maxZoom, currentMinZoom);
          if (!hasUsableZoomRange(currentMinZoom, currentMaxZoom)) {
            return finiteNumber(currentInfo.zoom, currentMinZoom);
          }
          const nextZoom = clamp(value, currentMinZoom, currentMaxZoom);

          setZoom(nextZoom);
          const optimisticInfo: YouTubeNativeZoomInfo = {
            ...currentInfo,
            zoom: nextZoom,
            source: currentInfo.source || 'youtube-native',
          };
          youtubeNativeZoomInfoRef.current = optimisticInfo;
          setYoutubeNativeZoomInfoState(optimisticInfo);

          persistZoomSnapshot(activeZoomKeyRef.current, {
            zoom: nextZoom,
            minZoom: currentMinZoom,
            maxZoom: currentMaxZoom,
            supported: true,
            unit: 'ratio',
          });

          return setYouTubeNativeZoom(nextZoom)
            .then(async () => {
              const refreshed = await refreshYouTubeNativeZoomInfo('set-zoom');
              return finiteNumber(refreshed?.zoom, nextZoom);
            })
            .catch(error => {
              debugVideoLog('[YT Native] setZoom error:', error);
              const unsupportedInfo: YouTubeNativeZoomInfo = {
                ...currentInfo,
                zoom: finiteNumber(currentInfo.zoom, currentMinZoom),
                minZoom: 1,
                maxZoom: 1,
                source: currentInfo.source || 'youtube-native',
              };
              youtubeNativeZoomInfoRef.current = unsupportedInfo;
              setYoutubeNativeZoomInfoState(unsupportedInfo);
              setZoom(unsupportedInfo.zoom ?? 1);
              throw error;
            });
        }

        if (usingUvcRef.current) {
          const currentInfo = normalizeUvcZoomInfo(uvcZoomInfoRef.current || DEFAULT_UVC_ZOOM);
          const currentMinZoom = currentInfo.minZoom;
          const currentMaxZoom = currentInfo.maxZoom;
          if (!currentInfo.supported || !hasUsableZoomRange(currentMinZoom, currentMaxZoom)) {
            return 1;
          }

          const nextZoom = clamp(value, currentMinZoom, currentMaxZoom);

          setZoom(nextZoom);
          const optimisticInfo = {
            ...currentInfo,
            zoom: nextZoom,
            source: 'external' as const,
          };
          uvcZoomInfoRef.current = optimisticInfo;
          setUvcZoomInfoState(optimisticInfo);

          persistZoomSnapshot(activeZoomKeyRef.current, {
            zoom: nextZoom,
            minZoom: currentMinZoom,
            maxZoom: currentMaxZoom,
            supported: true,
            unit: normalizeZoomUnit((currentInfo as any).unit),
          });

          return setUvcZoom(nextZoom)
            .then(async resolvedZoom => {
              const refreshedRaw = await getUvcZoomInfo().catch(() => ({
                ...optimisticInfo,
                zoom: resolvedZoom,
              }));
              const refreshed = normalizeUvcZoomInfo({
                ...refreshedRaw,
                zoom: finiteNumber(refreshedRaw?.zoom, resolvedZoom ?? nextZoom),
              });
              uvcZoomInfoRef.current = refreshed;
              setUvcZoomInfoState(refreshed);
              setZoom(refreshed.zoom ?? resolvedZoom ?? nextZoom);
              if (refreshed.supported) {
                persistZoomSnapshot(activeZoomKeyRef.current, {
                  zoom: refreshed.zoom,
                  minZoom: refreshed.minZoom,
                  maxZoom: refreshed.maxZoom,
                  supported: true,
                  unit: normalizeZoomUnit((refreshed as any).unit),
                });
              }
              return refreshed.supported ? refreshed.zoom : Promise.reject(new Error('UVC zoom unsupported'));
            })
            .catch(error => {
              debugVideoLog('[UVC] setZoom error:', error);
              const unsupportedInfo: UvcZoomInfo = {
                ...DEFAULT_UVC_ZOOM,
                source: 'external',
                unit: normalizeZoomUnit((currentInfo as any).unit),
              };
              uvcZoomInfoRef.current = unsupportedInfo;
              setUvcZoomInfoState(unsupportedInfo);
              setZoom(unsupportedInfo.zoom);
              throw error;
            });
        }

        const snapshot = zoomSnapshotRef.current;
        if (!snapshot.supported || !hasUsableZoomRange(snapshot.minZoom, snapshot.maxZoom)) {
          return snapshot.zoom;
        }

        const nextZoom = clamp(value, snapshot.minZoom, snapshot.maxZoom);
        setZoom(nextZoom);
        zoomSnapshotRef.current = {...snapshot, zoom: nextZoom};
        persistZoomSnapshot(snapshot.key, {
          zoom: nextZoom,
          minZoom: snapshot.minZoom,
          maxZoom: snapshot.maxZoom,
          supported: true,
          unit: snapshot.unit,
        });
        return nextZoom;
      },
      getRecordingInfo: () => updateRecordingInfoSnapshot(),
      getZoomInfo: () => {
        if (isExternalStreamPreviewRef.current || effectiveWebcamTypeRef.current !== WebcamType.camera) {
          return {
            supported: false,
            minZoom: 1,
            maxZoom: 1,
            zoom: 1,
            source: currentExternalStreamUriRef.current ? 'rtsp' : 'webcam',
            unit: 'ratio',
          };
        }

        if (
          Platform.OS === 'android' &&
          !usingUvcRef.current &&
          isYouTubeNativeCameraEnabled()
        ) {
          const info =
            youtubeNativeZoomInfoRef.current || DEFAULT_YOUTUBE_NATIVE_ZOOM;
          const infoMinZoom = finiteNumber(info.minZoom, 1);
          const infoMaxZoom = finiteNumber(info.maxZoom, infoMinZoom);
          return {
            supported: hasUsableZoomRange(infoMinZoom, infoMaxZoom),
            minZoom: infoMinZoom,
            maxZoom: infoMaxZoom,
            zoom: clamp(finiteNumber(info.zoom, infoMinZoom), infoMinZoom, infoMaxZoom),
            source: info.source || 'youtube-native',
            unit: 'ratio',
          };
        }

        if (usingUvcRef.current) {
          const info = normalizeUvcZoomInfo(uvcZoomInfoRef.current || DEFAULT_UVC_ZOOM);
          return {
            supported: info.supported,
            minZoom: info.minZoom,
            maxZoom: info.maxZoom,
            zoom: info.zoom,
            source: 'external',
            unit: info.unit,
          };
        }

        const snapshot = zoomSnapshotRef.current;
        return {
          supported: snapshot.supported,
          minZoom: snapshot.minZoom,
          maxZoom: snapshot.maxZoom,
          zoom: snapshot.zoom,
          source: snapshot.source,
          unit: snapshot.unit,
        };
      },
    };
  }

  useEffect(() => {
    assignRef(resolvedRef, controllerRef.current);
    updateRecordingInfoSnapshot();
    return () => {
      assignRef(resolvedRef, null);
      (globalThis as any).__APLUS_CAMERA_RECORDING_INFO__ = {
        state: 'idle',
        backend: null,
        source: 'back',
        isRecording: false,
      };
    };
  }, [resolvedRef, updateRecordingInfoSnapshot]);

  const youtubeNativeCameraLocked =
    Platform.OS === 'android' && isYouTubeNativeCameraLocked();
  const externalLiveLocked = youtubeSourceLock === 'external';

  const shouldUsePhoneCamera =
    effectiveWebcamType === WebcamType.camera &&
    !usingUvc &&
    !youtubeNativeCameraLocked &&
    !externalLiveLocked;
  const shouldActivatePhoneCamera =
    shouldUsePhoneCamera &&
    permissionState === 'granted' &&
    !!device &&
    phoneModeHydrated &&
    cameraLifecycleActive;

  const resolvedAndroidPreviewViewType =
    Platform.OS === 'android'
      ? props.androidPreviewViewTypeOverride === 'default'
        ? undefined
        : props.androidPreviewViewTypeOverride || 'surface-view'
      : undefined;

  const isYouTubeNativeActive =
    Platform.OS === 'android' &&
    shouldUsePhoneCamera &&
    isYouTubeNativeCameraEnabled();

  useEffect(() => {
    if (!youtubeNativeCameraLocked) {
      return;
    }

    setCameraErrorMessage(null);
    props.setIsCameraReady(false);
  }, [props.setIsCameraReady, youtubeNativeCameraLocked]);

  useEffect(() => {
    if (
      viewModel.webcamType !== WebcamType.camera &&
      effectiveWebcamType === WebcamType.camera &&
      hasBuiltInCamera
    ) {
      debugVideoLog('[Video] external webcam source missing, fallback to phone camera');
    }
  }, [viewModel.webcamType, effectiveWebcamType, hasBuiltInCamera]);

  const renderFallbackContent = (message?: string) => {
    return (
      <>
        {!!message && <Text style={localStyles.message}>{message}</Text>}
      </>
    );
  };

  const renderFallback = (message?: string) => {
    debugVideoLog('[Video] renderFallback', {
      cameraSourceMode,
      effectiveWebcamType,
      selectedSource,
      usingUvc,
      isYouTubeNativeActive,
      hasSourceUri: !!viewModel.source?.uri,
      message: message ?? '',
    });

    return (
      <RNView collapsable={false} style={[styles.container, localStyles.fallbackContainer, localStyles.fallbackLayer]}>
        {renderFallbackContent(message)}
      </RNView>
    );
  };

  const renderFallbackOverlay = (message?: string) => {
    debugVideoLog('[Video] renderFallbackOverlay', {
      cameraSourceMode,
      effectiveWebcamType,
      selectedSource,
      usingUvc,
      isYouTubeNativeActive,
      hasSourceUri: !!viewModel.source?.uri,
      message: message ?? '',
      phonePreviewReady,
      externalStreamReady,
      suppressCameraFallbackOverlay: !!props.suppressCameraFallbackOverlay,
    });

    return (
      <RNView pointerEvents="none" collapsable={false} style={[localStyles.fallbackOverlay, localStyles.fallbackLayer]}>
        <RNView style={localStyles.fallbackContainer}>
          {props.suppressCameraFallbackOverlay
            ? null
            : renderFallbackContent(message)}
        </RNView>
      </RNView>
    );
  };

  const readySignature = [
    cameraSourceMode,
    effectiveWebcamType,
    selectedSource,
    viewModel.source?.uri || '',
    usingUvc ? 'uvc' : 'standard',
    isYouTubeNativeActive ? 'youtube-native' : 'local',
    youtubeNativeCameraLocked ? 'locked' : 'unlocked',
  ].join(':');

  const lastReadySignatureRef = useRef('');
  const lastResolvedPhoneSourceKeyRef = useRef('');

  useEffect(() => {
    if (lastReadySignatureRef.current === readySignature) {
      return;
    }

    lastReadySignatureRef.current = readySignature;
    setPhonePreviewReady(false);
    setExternalStreamReady(false);

    if (usingUvc) {
      // USB/UVC preview is owned by the native SurfaceView, not by RNVideo/VisionCamera.
      // The old generic reset ran after the UVC-ready effect and forced cameraReady=false,
      // which left the gameplay Start button blocked even though the USB live image was visible.
      setCameraErrorMessage(null);
      setUvcPresenceSnapshot(true);
      setCurrentCameraSourceSnapshot('external');
      (globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ = 'usb';
      (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'uvc';
      setUsbGameplayReadySnapshot(true, {reason: 'ready-signature-reset-bypassed'});
      props.setIsCameraReady(true);
      debugVideoLog('[USBWebcam] preview-ready', {
        source: 'usb',
        reason: 'ready-signature-reset-bypassed',
        readySignature,
        currentSource: getSelectedSourceSnapshot(),
        backend: (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__,
      });
      debugVideoLog('[USBWebcam] source-ready-for-gameplay', {
        source: 'usb',
        reason: 'ready-signature-reset-bypassed',
        currentSource: getSelectedSourceSnapshot(),
        backend: (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__,
      });
      debugVideoLog('[GameplayStart] enabled=true source=usb', {
        source: 'usb',
        reason: 'ready-signature-reset-bypassed',
      });
      return;
    }

    props.setIsCameraReady(false);
    debugVideoLog('[Video] reset ready for signature', {readySignature});
  }, [props.setIsCameraReady, readySignature, usingUvc]);

  useEffect(() => {
    debugVideoLog('[Video] runtime branch snapshot', {
      cameraSourceMode,
      effectiveWebcamType,
      selectedSource,
      shouldUsePhoneCamera,
      shouldActivatePhoneCamera,
      usingUvc,
      isYouTubeNativeActive,
      youtubeNativeCameraLocked,
      externalLiveLocked,
      sourceUri: maskStreamUri(currentExternalStreamUri || viewModel.source?.uri || ''),
      permissionState,
      hasDevice: !!device,
      cameraErrorMessage,
      phoneCameraConfigMode,
      preferredPhoneMode,
      phoneModeHydrated,
      phonePreviewReady,
      externalStreamReady,
      shouldRenderExternalVideo: effectiveWebcamType !== WebcamType.camera && !!viewModel.source?.uri,
      shouldRenderPhoneCamera: effectiveWebcamType === WebcamType.camera && !usingUvc && !isYouTubeNativeActive && permissionState === 'granted' && !!device && !cameraErrorMessage,
      shouldShowPhoneFallback: !phonePreviewReady || !!cameraErrorMessage || permissionState !== 'granted' || !device,
      shouldShowExternalFallback: effectiveWebcamType !== WebcamType.camera ? (!viewModel.source?.uri || !externalStreamReady) : false,
      cameraLifecycleActive,
      visionOutputs: {
        mode: phoneCameraConfigMode,
        video: true,
        photo: false,
        audio: phoneCameraConfigMode === 'standard' && microphonePermissionState === 'granted',
        format: phoneCameraConfigMode === 'standard' && Platform.OS !== 'android' ? 'preferredFormat' : 'default',
        fps: phoneCameraConfigMode === 'standard' && Platform.OS !== 'android' ? 30 : 'default',
        previewViewType:
          Platform.OS === 'android'
            ? resolvedAndroidPreviewViewType || 'surface-view'
            : 'default',
      },
    });
  }, [
    cameraErrorMessage,
    cameraLifecycleActive,
    cameraSourceMode,
    device,
    effectiveWebcamType,
    externalLiveLocked,
    isYouTubeNativeActive,
    permissionState,
    phoneCameraConfigMode,
    preferredPhoneMode,
    phoneModeHydrated,
    phonePreviewReady,
    externalStreamReady,
    selectedSource,
    shouldActivatePhoneCamera,
    shouldUsePhoneCamera,
    resolvedAndroidPreviewViewType,
    usingUvc,
    currentExternalStreamUri,
    viewModel.source?.uri,
    youtubeNativeCameraLocked,
    microphonePermissionState,
  ]);

  useEffect(() => {
    if (!isYouTubeNativeActive) {
      nativeRecordingCallbacksRef.current = null;
      return;
    }

    refreshYouTubeNativeZoomInfo('enter-youtube-native');

    const readySub = addYouTubeCameraStreamListener('preview_ready', () => {
      setCameraErrorMessage(null);
      props.setIsCameraReady(true);
      void refreshYouTubeNativeZoomInfo('preview-ready');
    });

    const errorSub = addYouTubeCameraStreamListener('preview_error', payload => {
      const message = String(payload?.message ?? i18n.t('youtubeLiveErrorTitle'));
      setCameraErrorMessage(message);
      props.setIsCameraReady(false);
    });

    const disabledSub = addYouTubeCameraStreamListener('preview_disabled', () => {
      props.setIsCameraReady(false);
    });

    const streamErrorSub = addYouTubeCameraStreamListener('stream_error', payload => {
      const message = String(payload?.message ?? i18n.t('youtubeLiveErrorTitle'));
      setCameraErrorMessage(message);
    });

    const zoomChangedSub = addYouTubeCameraStreamListener('zoom_changed', payload => {
      const normalized: YouTubeNativeZoomInfo = {
        ...DEFAULT_YOUTUBE_NATIVE_ZOOM,
        zoom: Number(payload?.zoom ?? youtubeNativeZoomInfoRef.current.zoom ?? 1),
        minZoom: Number(payload?.minZoom ?? youtubeNativeZoomInfoRef.current.minZoom ?? 1),
        maxZoom: Number(payload?.maxZoom ?? youtubeNativeZoomInfoRef.current.maxZoom ?? 1),
        source: String(payload?.source ?? 'youtube-native'),
      };
      youtubeNativeZoomInfoRef.current = normalized;
      setYoutubeNativeZoomInfoState(normalized);
      setZoom(normalized.zoom ?? 1);
    });

    return () => {
      readySub.remove();
      errorSub.remove();
      disabledSub.remove();
      streamErrorSub.remove();
      zoomChangedSub.remove();
    };
  }, [
    isYouTubeNativeActive,
    props.setIsCameraReady,
    refreshYouTubeNativeZoomInfo,
    setCameraErrorMessage,
  ]);

  if (youtubeNativeCameraLocked && !externalLiveLocked) {
    return renderFallback();
  }

  if (cameraSourceMode === 'ip' && effectiveWebcamType !== WebcamType.camera) {
    if (currentExternalStreamUri) {
      const preparingMessage = externalStreamErrorMessage ||
        `Đang chuẩn bị stream camera... (${externalStreamIndex + 1}/${Math.max(
          externalStreamCandidates.length,
          1,
        )})`;

      return (
        <View style={[styles.container, localStyles.fullscreenCapableHost]}>
          <RNVideo
            key={`rtsp-${currentExternalStreamUri}-${externalStreamReloadNonce}-${props.fullscreenMode ? 'fullscreen' : 'inline'}`}
            source={currentExternalSource}
            style={localStyles.fullscreenCapableFill}
            resizeMode={cameraScaleMode}
            posterResizeMode={cameraScaleMode}
            paused={false}
            repeat
            onLoad={event => {
              debugVideoLog('[IPCamera] rtsp-open-success', {
                uri: maskStreamUri(currentExternalStreamUri),
              });
              setRtspGameplaySnapshot(currentExternalStreamUri, externalStreamCandidates);
              lastRtspProgressAtRef.current = Date.now();
              setExternalStreamReady(true);
              setExternalStreamErrorMessage('');
              props.setIsCameraReady(true);
              props.onLoad?.(event as any);
            }}
            onReadyForDisplay={() => {
              setRtspGameplaySnapshot(currentExternalStreamUri, externalStreamCandidates);
              lastRtspProgressAtRef.current = Date.now();
              setExternalStreamReady(true);
              props.setIsCameraReady(true);
            }}
            progressUpdateInterval={1000}
            onProgress={progress => {
              const now = Date.now();
              const currentTime = Number((progress as any)?.currentTime ?? 0);
              lastRtspProgressAtRef.current = now;
              lastRtspProgressTimeRef.current = Number.isFinite(currentTime) ? currentTime : null;
            }}
            onBuffer={data => {
              props.onBuffer?.(data as any);
              debugVideoLog('[IPCamera] rtsp-buffer', {
                isBuffering: !!(data as any)?.isBuffering,
                uri: maskStreamUri(currentExternalStreamUri),
              });
            }}
            onError={e => {
              setExternalStreamReady(false);
              const hasNext = externalStreamIndex + 1 < externalStreamCandidates.length;
              debugVideoLog('[IPCamera] rtsp-error', {
                reason: 'player-error',
                uri: maskStreamUri(currentExternalStreamUri),
                hasNext,
                error: String((e as any)?.error?.errorString || (e as any)?.error || e),
              });
              console.error('[Video] RTSP stream error:', {
                uri: maskStreamUri(currentExternalStreamUri),
                hasNext,
                error: e,
              });

              if (hasNext) {
                setExternalStreamIndex(prev => prev + 1);
                return;
              }

              setExternalStreamErrorMessage(IP_CAMERA_ERROR_MESSAGE);
              debugVideoLog('[CameraErrorUI]', {mode: 'ip', message: IP_CAMERA_ERROR_MESSAGE});
              props.setIsCameraReady(false);
              props.onError?.(e as any);
            }}
          />
          {!externalStreamReady ? renderFallbackOverlay(preparingMessage) : null}
          {props.overlayContent}
        </View>
      );
    }

    return renderFallback(externalStreamReady ? undefined : IP_CAMERA_ERROR_MESSAGE);
  }

  if (cameraSourceMode === 'usb' && !hasUsbVideoSource) {
    debugVideoLog('[CameraErrorUI]', {mode: 'usb', message: USB_CAMERA_DISCONNECTED_MESSAGE});
    return renderFallback(USB_CAMERA_DISCONNECTED_MESSAGE);
  }

  if (usingUvc) {
    debugVideoLog('[USBWebcam] preview-start', {
      source: 'usb',
      mode: 'usb',
      hasUvcWebcam,
      stableHasUvcWebcam,
      selectedSource: resolvedSelectedSource,
    });
    return (
      <RNView
        style={localStyles.uvcHost}
        collapsable={false}
        pointerEvents="none"
        onLayout={event => {
          const {width, height} = event.nativeEvent.layout;
          debugVideoLog('[USBWebcam] preview-layout', {
            width: Math.round(width),
            height: Math.round(height),
            pointerEvents: 'none-pass-through',
          });
        }}>
        <UvcCameraView
          style={localStyles.uvcFill}
          fullscreenMode={!!props.fullscreenMode}
          sourceMode="usb"
          layoutKey={props.cameraLayoutKey}
        />
        {props.overlayContent ? (
          <RNView pointerEvents="none" style={localStyles.cameraOverlayLayer}>
            {props.overlayContent}
          </RNView>
        ) : null}
      </RNView>
    );
  }

  if (permissionState === 'loading') {
    return renderFallback(i18n.t('cameraCheckingPermission'));
  }

  if (permissionState === 'denied') {
    return renderFallback(i18n.t('cameraPermissionDenied'));
  }

  if (isYouTubeNativeActive) {
    if (cameraErrorMessage) {
      return renderFallback(cameraErrorMessage);
    }

    return (
      <YouTubeAndroidNativePreview
        style={localStyles.uvcFill}
        active={appState === 'active' && isFocused}
        onReady={() => {
          setCameraErrorMessage(null);
          props.setIsCameraReady(true);
          void refreshYouTubeNativeZoomInfo('on-ready-prop');
        }}
        onError={message => {
          setCameraErrorMessage(message);
          props.setIsCameraReady(false);
        }}
      />
    );
  }

  if (availableSources.length > 0 && !availableSources.includes(selectedSource)) {
    return renderFallback(i18n.t('cameraPreparing'));
  }

  if (!device) {
    return renderFallback(i18n.t('cameraNoUsable'));
  }

  if (cameraErrorMessage) {
    return renderFallback(cameraErrorMessage);
  }

  const usePreferredVisionFormat =
    phoneCameraConfigMode === 'standard' && Platform.OS !== 'android';
  const resolvedVisionFormat = usePreferredVisionFormat ? preferredFormat : undefined;
  const resolvedVisionFps = usePreferredVisionFormat ? 30 : undefined;
  const resolvedVisionBitRate = usePreferredVisionFormat ? 10_000_000 : undefined;

  return (
    <View style={styles.container} collapsable={false}>
      <RNView style={localStyles.cameraSurfaceHost} collapsable={false}>
        <Camera
          key={`vision-${device.id}-${phoneCameraConfigMode}`}
          ref={visionCameraRef}
          style={localStyles.cameraRoot}
          device={device}
          isActive={shouldActivatePhoneCamera}
          video={true}
          photo={false}
          audio={phoneCameraConfigMode === 'standard' && microphonePermissionState === 'granted'}
          format={resolvedVisionFormat}
          fps={resolvedVisionFps}
          videoBitRate={resolvedVisionBitRate}
          zoom={safeZoom}
          resizeMode={cameraScaleMode}
          androidPreviewViewType={resolvedAndroidPreviewViewType}
          onInitialized={() => {
            debugVideoLog('[Video] camera initialized');
            setPhonePreviewReady(false);
          }}
          onStarted={() => {
            debugVideoLog('[Video] camera started');
            setCameraErrorMessage(null);
            setPhonePreviewReady(false);
          }}
          onStopped={() => {
            debugVideoLog('[Video] camera stopped');
            setPhonePreviewReady(false);
            props.setIsCameraReady(false);
          }}
          onPreviewStarted={() => {
            debugVideoLog('[Video] preview started');
            setCameraErrorMessage(null);
            setPhonePreviewReady(true);
            const successSourceKey = `${selectedSource}:${device?.id || 'unknown'}`;
            lastSuccessfulPhoneModeRef.current[successSourceKey] = phoneCameraConfigMode;
            lastSuccessfulPhoneModeRef.current[`${selectedSource}:*`] = phoneCameraConfigMode;
            (globalThis as any).__APLUS_SUCCESSFUL_PHONE_MODES__ =
              lastSuccessfulPhoneModeRef.current;
            setPreferredPhoneMode(phoneCameraConfigMode);
            setPhoneModeHydrated(true);
            pendingPhoneModeSourceKeyRef.current = null;
            void persistSuccessfulPhoneModesToStorage(lastSuccessfulPhoneModeRef.current);
            debugVideoLog('[Video] remember successful phone camera config', {
              selectedSource,
              deviceId: device?.id || 'unknown',
              phoneCameraConfigMode,
            });
            props.setIsCameraReady(true);
          }}
          onPreviewStopped={() => {
            debugVideoLog('[Video] preview stopped');
            setPhonePreviewReady(false);
            props.setIsCameraReady(false);
          }}
          onError={error => {
            setPhonePreviewReady(false);
            props.setIsCameraReady(false);

            const code = String((error as any)?.code || '');
            const message = String((error as any)?.message || '');

            if (code === 'session/invalid-output-configuration') {
              console.warn('[Video] VisionCamera invalid output configuration:', {
                code,
                message,
                phoneCameraConfigMode,
              });

              if (phoneCameraConfigMode === 'standard') {
                debugVideoLog('[Video] retry with safe phone camera config');
                setCameraErrorMessage(null);
                pendingPhoneModeSourceKeyRef.current = `${selectedSource}:${device?.id || 'unknown'}`;
                setPhoneCameraConfigMode('safe');
                return;
              }

              if (phoneCameraConfigMode === 'safe') {
                debugVideoLog('[Video] retry with ultra-safe phone camera config');
                setCameraErrorMessage(null);
                pendingPhoneModeSourceKeyRef.current = `${selectedSource}:${device?.id || 'unknown'}`;
                setPhoneCameraConfigMode('ultra-safe');
                return;
              }

              setCameraErrorMessage(i18n.t('cameraConfigFailedFallback'));
              return;
            }

            console.error('[Video] VisionCamera error:', error);
            setCameraErrorMessage(
              message || i18n.t('cameraOpenFailed'),
            );
          }}
        />
      </RNView>
      {!phonePreviewReady ? renderFallbackOverlay(cameraErrorMessage || i18n.t('cameraPreparing')) : null}
    </View>
  );
};

const localStyles = StyleSheet.create({
  fullscreenCapableHost: {
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  fullscreenCapableFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#000',
  },
  uvcHost: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  uvcFill: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  cameraOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  cameraSurfaceHost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  cameraRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1,
    elevation: 1,
  },
  fallbackOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  fallbackLayer: {
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#000',
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '78%',
    height: '78%',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  message: {
    color: '#bbb',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});

export default memo(forwardRef(AplusVideo));
