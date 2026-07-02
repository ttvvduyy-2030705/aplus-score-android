import React, {useEffect, useMemo, useState} from 'react';
import {
  LayoutChangeEvent,
  Platform,
  requireNativeComponent,
  StyleSheet,
  View as RNView,
} from 'react-native';

import {
  getYouTubeNativeZoomInfo,
  isYouTubeNativePreviewViewAvailable,
  prepareYouTubeNativePreview,
  setYouTubeNativeZoom,
  startYouTubeNativeRecord,
  stopYouTubeNativeRecord,
  switchYouTubeNativeCamera,
} from 'services/youtubeNativeLive';

const getNativePreviewComponent = () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  if (!isYouTubeNativePreviewViewAvailable()) {
    console.log('[YouTube Live] fallback reason=native preview view manager missing');
    return null;
  }

  try {
    return requireNativeComponent<any>('YouTubeLivePreviewView');
  } catch (error) {
    console.log('[YouTube Live] fallback reason=requireNativeComponent failed', error);
    return null;
  }
};

const NativePreview = getNativePreviewComponent();

const DEFAULT_CAMERA_ASPECT_RATIO = 16 / 9;

type PreviewLayout = {
  width: number;
  height: number;
};

type Props = {
  controllerRef?: React.MutableRefObject<any>;
  mirrorControllerRef?: React.MutableRefObject<any>;
  setIsCameraReady: (isReady: boolean) => void;
  sourceType?: 'phone' | 'webcam';
  cameraFacing?: 'front' | 'back';
  sourceAspectRatio?: number;
  rotatePreview?: boolean;
};

const getCoverVisualSize = (layout: PreviewLayout, sourceAspectRatio: number) => {
  const safeAspectRatio =
    Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0
      ? sourceAspectRatio
      : DEFAULT_CAMERA_ASPECT_RATIO;
  const containerAspectRatio = layout.width / layout.height;

  if (containerAspectRatio > safeAspectRatio) {
    return {
      width: layout.width,
      height: layout.width / safeAspectRatio,
    };
  }

  return {
    width: layout.height * safeAspectRatio,
    height: layout.height,
  };
};

const buildCoverStyle = (
  layout: PreviewLayout,
  sourceAspectRatio: number,
  rotatePreview: boolean,
) => {
  if (layout.width <= 0 || layout.height <= 0) {
    return styles.coverFill;
  }

  const visualSize = getCoverVisualSize(layout, sourceAspectRatio);

  if (rotatePreview) {
    const nativeWidth = visualSize.height;
    const nativeHeight = visualSize.width;

    return {
      position: 'absolute' as const,
      left: (layout.width - nativeWidth) / 2,
      top: (layout.height - nativeHeight) / 2,
      width: nativeWidth,
      height: nativeHeight,
      transform: [{rotate: '90deg'}],
    };
  }

  return {
    position: 'absolute' as const,
    left: (layout.width - visualSize.width) / 2,
    top: (layout.height - visualSize.height) / 2,
    width: visualSize.width,
    height: visualSize.height,
  };
};

const YouTubeAndroidLivePreview = ({
  controllerRef,
  mirrorControllerRef,
  setIsCameraReady,
  sourceType = 'phone',
  cameraFacing = 'back',
  sourceAspectRatio = DEFAULT_CAMERA_ASPECT_RATIO,
  rotatePreview = sourceType === 'phone',
}: Props) => {
  const [layout, setLayout] = useState<PreviewLayout>({width: 0, height: 0});
  const nativeRecordingRef = React.useRef<{
    path: string;
    callbacks?: {
      onRecordingFinished?: (video: {path?: string}) => void;
      onRecordingError?: (error: unknown) => void;
    };
    recording: boolean;
  }>({path: '', callbacks: undefined, recording: false});

  const coverStyle = useMemo(
    () => buildCoverStyle(layout, sourceAspectRatio, rotatePreview),
    [layout.height, layout.width, rotatePreview, sourceAspectRatio],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setLayout(previous => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }

      return {width, height};
    });
  };

  useEffect(() => {
    console.log('[YouTube Live] native preview mount requested', {
      sourceType,
      cameraFacing,
      rotatePreview,
    });
    let mounted = true;
    const timer = setTimeout(() => {
      prepareYouTubeNativePreview(cameraFacing, sourceType)
        .then(async () => {
          console.log('[YouTube Live] native preview prepared', {
            sourceType,
            cameraFacing,
            rotatePreview,
          });
          if (mounted) {
            setIsCameraReady(true);
          }
          if (controllerRef?.current?.refreshZoomInfo) {
            await controllerRef.current.refreshZoomInfo();
          }
        })
        .catch(error => {
          console.log('[YouTube Live] fallback reason=native preview prepare failed', error);
          console.log('[YouTubeNativePreview] prepare failed:', error);
          if (mounted) {
            setIsCameraReady(false);
          }
        });
    }, 250);

    if (controllerRef) {
      const controller = {
        zoomInfo: {
          supported: false,
          minZoom: 1,
          maxZoom: 1,
          zoom: 1,
          source: 'back',
        },
        refreshZoomInfo: async () => {
          controller.zoomInfo = await getYouTubeNativeZoomInfo();
          return controller.zoomInfo;
        },
        setZoom: async (value: number) => {
          const applied = await setYouTubeNativeZoom(value);
          controller.zoomInfo = {
            ...(await getYouTubeNativeZoomInfo()),
            zoom: typeof applied === 'number' ? applied : value,
          };
          return typeof applied === 'number' ? applied : value;
        },
        getZoomInfo: () => {
          return controller.zoomInfo;
        },
        switchCamera: async () => {
          await switchYouTubeNativeCamera();
          controller.zoomInfo = await getYouTubeNativeZoomInfo();
          return true;
        },
        startRecording: async (options: any = {}) => {
          const path = String(options?.path || '');
          nativeRecordingRef.current = {
            path,
            callbacks: {
              onRecordingFinished: options?.onRecordingFinished,
              onRecordingError: options?.onRecordingError,
            },
            recording: true,
          };

          try {
            await startYouTubeNativeRecord(path);
          } catch (error) {
            nativeRecordingRef.current.recording = false;
            nativeRecordingRef.current.callbacks?.onRecordingError?.(error);
          }
        },
        stopRecording: async () => {
          const snapshot = nativeRecordingRef.current;
          try {
            const recordedPath = await stopYouTubeNativeRecord();
            snapshot.recording = false;
            snapshot.callbacks?.onRecordingFinished?.({
              path: recordedPath || snapshot.path,
            });
            nativeRecordingRef.current = {path: '', callbacks: undefined, recording: false};
            return recordedPath || snapshot.path;
          } catch (error) {
            snapshot.recording = false;
            snapshot.callbacks?.onRecordingError?.(error);
            nativeRecordingRef.current = {path: '', callbacks: undefined, recording: false};
            throw error;
          }
        },
      };
      controllerRef.current = controller;
      if (mirrorControllerRef) {
        mirrorControllerRef.current = controller;
      }
    }

    return () => {
      console.log('[YouTube Live] native preview unmount');
      mounted = false;
      clearTimeout(timer);
      const activeController = controllerRef?.current;
      if (mirrorControllerRef && mirrorControllerRef.current === activeController) {
        mirrorControllerRef.current = null;
      }
      if (controllerRef) {
        controllerRef.current = null;
      }
      setIsCameraReady(false);
    };
  }, [cameraFacing, controllerRef, mirrorControllerRef, rotatePreview, setIsCameraReady, sourceType]);

  if (!NativePreview) {
    console.log('[YouTube Live] fallback reason=native preview view is not mounted');
    return <RNView style={styles.fallback} />;
  }

  const hasMeasuredLayout = layout.width > 1 && layout.height > 1;

  return (
    <RNView style={styles.wrapper} onLayout={onLayout} collapsable={false}>
      {hasMeasuredLayout ? <NativePreview style={coverStyle} /> : null}
    </RNView>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  coverFill: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
});

export default YouTubeAndroidLivePreview;
