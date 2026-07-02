import React, {ReactNode, useMemo, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type Props = {
  children: ReactNode;
  designHeight: number;
  designWidth?: number;
  disabled?: boolean;
};

const AutoFitStage = ({
  children,
  designHeight,
  designWidth,
  disabled = false,
}: Props) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setContainerWidth(width);
    setContainerHeight(height);
  };

  const {scale, translateY, stageStyle} = useMemo(() => {
    if (disabled || containerHeight <= 0 || designHeight <= 0) {
      return {
        scale: 1,
        translateY: 0,
        stageStyle: undefined,
      };
    }

    const heightScale = containerHeight / designHeight;
    const widthScale = designWidth && designWidth > 0 ? containerWidth / designWidth : 1;
    const nextScale = clamp(Math.min(1, heightScale, widthScale), 0.56, 1);
    const shrinkOffsetY = designHeight * (1 - nextScale) * 0.5;

    return {
      scale: nextScale,
      translateY: nextScale < 1 ? -shrinkOffsetY : 0,
      stageStyle: {
        width: '100%' as const,
        height: designHeight,
        transform: [{translateY: nextScale < 1 ? -shrinkOffsetY : 0}, {scale: nextScale}],
      },
    };
  }, [containerHeight, containerWidth, designHeight, designWidth, disabled]);

  return (
    <View style={styles.host} onLayout={onLayout}>
      <View style={styles.topAnchor}>
        <View style={[styles.stage, stageStyle]}>{children}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    flex: 1,
    overflow: 'hidden',
  },
  topAnchor: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  stage: {
    width: '100%',
  },
});

export default AutoFitStage;
