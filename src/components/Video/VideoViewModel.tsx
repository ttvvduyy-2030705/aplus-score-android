import type {ReactNode} from 'react';
import {RefObject, useCallback, useEffect, useMemo} from 'react';

import {
  OnBufferData,
  OnLoadData,
  OnSeekData,
  OnVideoErrorData,
  OnVideoTracksData,
  ReactVideoSourceProperties,
} from 'react-native-video';
import {Camera} from 'react-native-vision-camera';

export interface Props {
  gestureDisabled?: boolean;
  loadingDisabled?: boolean;
  source:
    | Readonly<
        Omit<ReactVideoSourceProperties, 'uri'> & {
          uri?: string | NodeRequire;
        }
      >
    | undefined;
  initialScale?: number;
  initialTranslateX?: number;
  initialTranslateY?: number;
  onFullscreenPlayerDidPresent?: (() => void) | undefined;
  onBuffer?: ((e: OnBufferData) => void) | undefined;
  onSeek?: ((e: OnSeekData) => void) | undefined;
  onLoad?: ((e: OnLoadData) => void) | undefined;
  onVideoTracks?: ((e: OnVideoTracksData) => void) | undefined;
  onEnd?: (() => void) | undefined;
  onError?: ((e: OnVideoErrorData) => void) | undefined;
  onPosition?: (scale: number, translateX: number, translateY: number) => void;
  cameraRef?: RefObject<Camera>;
  isStarted: boolean;
  isPaused: boolean;
  isPreview?: boolean;
  videoUri?: string;
  webcamType: string;
  setIsCameraReady: (isReady: boolean) => void;
  overlayContent?: ReactNode;
  cameraScaleMode?: 'contain' | 'cover';
  androidPreviewViewTypeOverride?: 'surface-view' | 'texture-view' | 'default';
  suppressCameraFallbackOverlay?: boolean;
  ignoreNavigationFocusLoss?: boolean;
  fullscreenMode?: boolean;
  cameraLayoutKey?: string | number;
}


const noopGesture = {
  enabled: () => noopGesture,
  onChange: () => noopGesture,
  onFinalize: () => noopGesture,
};

const VideoViewModel = (props: Props) => {
  useEffect(() => {
    return () => {
      props.onPosition?.(1, 0, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFullscreenPlayerDidPresent = useCallback(() => {
    props.onFullscreenPlayerDidPresent?.();
  }, [props.onFullscreenPlayerDidPresent]);

  const onBuffer = useCallback(
    (e: OnBufferData) => {
      props.onBuffer?.(e);
    },
    [props.onBuffer],
  );

  const onSeek = useCallback(
    (e: OnSeekData) => {
      props.onSeek?.(e);
    },
    [props.onSeek],
  );

  const onLoad = useCallback(
    (e: OnLoadData) => {
      props.onLoad?.(e);
    },
    [props.onLoad],
  );

  const onVideoTracks = useCallback(
    (e: OnVideoTracksData) => {
      props.onVideoTracks?.(e);
    },
    [props.onVideoTracks],
  );

  const onEnd = useCallback(() => {
    props.onEnd?.();
  }, [props.onEnd]);

  const onError = useCallback(
    (e: OnVideoErrorData) => {
      props.onError?.(e);
    },
    [props.onError],
  );

  const onReadyForDisplay = useCallback(() => {}, []);

  return useMemo(() => {
    return {
      source: props.source,
      pinch: noopGesture,
      pan: noopGesture,
      gestureComposed: noopGesture,
      animatedStyles: {},
      onReadyForDisplay,
      onFullscreenPlayerDidPresent,
      onBuffer,
      onSeek,
      onLoad,
      onVideoTracks,
      onEnd,
      onError,
      webcamType: props.webcamType,
    };
  }, [
    props.source,
    onReadyForDisplay,
    onFullscreenPlayerDidPresent,
    onBuffer,
    onSeek,
    onLoad,
    onVideoTracks,
    onEnd,
    onError,
    props.webcamType,
  ]);
};

export default VideoViewModel;
