import React, {useEffect, useRef} from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  View,
  requireNativeComponent,
} from 'react-native';
import {requestUvcLayout} from 'services/uvc';

const DEBUG_UVC_LAYOUT = true;
const debugUvcLayoutLog = (message: string, extra?: Record<string, any>) => {
  if (!DEBUG_UVC_LAYOUT) {
    return;
  }

  if (extra) {
    console.log(message, extra);
    return;
  }

  console.log(message);
};

type Props = {
  style?: any;
  // Không truyền overlay làm child vào native UVC view nữa.
  // Overlay được render ở JS sibling để tránh crash ViewGroupManager trên Android.
  children?: never;
  sourceAspectRatio?: number;
  fullscreenMode?: boolean;
  sourceMode?: 'usb' | 'ip' | 'phone' | string;
  layoutKey?: string | number;
};

const NativeUvcCameraView = requireNativeComponent<any>('UvcCameraView');

const UvcCameraView = ({style, fullscreenMode, sourceMode = 'usb', layoutKey}: Props) => {
  const lastLayoutRef = useRef({width: 0, height: 0});
  useEffect(() => {
    if (!fullscreenMode) {
      return;
    }

    debugUvcLayoutLog('[USBWebcamFullscreen] open', {
      sourceMode,
      layoutKey,
    });
    void requestUvcLayout('fullscreen-enter');

    const timers = [80, 220, 500].map(delay =>
      setTimeout(() => {
        void requestUvcLayout(`fullscreen-enter-${delay}`);
      }, delay),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [fullscreenMode, layoutKey, sourceMode]);

  const onWrapperLayout = (event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    const last = lastLayoutRef.current;
    if (last.width === width && last.height === height) {
      return;
    }

    lastLayoutRef.current = {width, height};
    debugUvcLayoutLog('[USBWebcamFullscreen] bind-surface width=' + Math.round(width) + ' height=' + Math.round(height), {
      sourceMode,
      fullscreenMode: !!fullscreenMode,
    });
    void requestUvcLayout(fullscreenMode ? 'fullscreen-layout' : 'inline-layout');
  };

  return (
    <View style={[styles.wrapper, style]} collapsable={false} onLayout={onWrapperLayout}>
      <NativeUvcCameraView
        style={styles.nativeFill}
        pointerEvents="none"
        fullscreenMode={!!fullscreenMode}
        sourceMode={String(sourceMode || 'usb')}
        layoutKey={String(layoutKey ?? '')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  nativeFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
  },
});

export default UvcCameraView;
