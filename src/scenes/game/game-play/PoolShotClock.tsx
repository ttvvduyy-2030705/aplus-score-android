import React, {memo, useMemo} from 'react';

import Button from 'components/Button';
import Text from 'components/Text';
import View from 'components/View';

import useDesignSystem from 'theme/useDesignSystem';
import {createGameplayLayoutRules} from './layoutRules';

interface Props {
  originalCountdownTime?: number;
  currentCountdownTime: number;
  onPress?: () => void;
}

const SEGMENTS = 34;

const PoolShotClock = ({
  originalCountdownTime = 40,
  currentCountdownTime,
  onPress,
}: Props) => {
  const {adaptive, design} = useDesignSystem();
  const layoutRules = useMemo(() => createGameplayLayoutRules(adaptive, design), [adaptive.styleKey]);
  const isHandheldLandscape =
    adaptive.isLandscape &&
    (adaptive.systemMetrics.smallestScreenWidthDp < 600 || adaptive.isConstrainedLandscape);

  const segmentHeight = isHandheldLandscape
    ? adaptive.s(16)
    : adaptive.layoutPreset === 'tv'
      ? layoutRules.controlHeights.regular
      : adaptive.s(28);

  const segmentWrapMinHeight = segmentHeight + adaptive.s(4);

  const secondsFontSize = isHandheldLandscape
    ? adaptive.fs(15, 0.7, 0.9)
    : adaptive.layoutPreset === 'tv'
      ? adaptive.fs(48, 0.86, 1.04)
      : adaptive.fs(20, 0.86, 1.02);

  const secondsMarginLeft = isHandheldLandscape ? adaptive.s(6) : adaptive.s(10);

  // Đẩy cả thanh đếm ngược lên trên để tránh bị viền trắng che
  const clockBottomOffset = isHandheldLandscape ? adaptive.s(12) : adaptive.s(14);

  const safeOriginal = Math.max(1, originalCountdownTime || 40);
  const safeCurrent = Math.max(0, currentCountdownTime);
  const progressMax = Math.max(safeOriginal, safeCurrent);

  const activeColor =
    safeCurrent <= 5 ? '#FF2D22' : safeCurrent <= 10 ? '#FFBE2F' : '#20E247';

  const litCount = useMemo(() => {
    return Math.max(0, Math.ceil((safeCurrent / progressMax) * SEGMENTS));
  }, [safeCurrent, progressMax]);

  return (
    <Button
      onPress={onPress}
      style={{
        width: '100%',
        paddingTop: 0,
        paddingBottom: 0,
        marginBottom: clockBottomOffset,
      }}>
      <View
        style={{width: '100%'}}
        direction={'row'}
        alignItems={'center'}
        justify={'between'}>
        <View
          flex={'1'}
          direction={'row'}
          justify={'between'}
          alignItems={'center'}
          style={{minHeight: segmentWrapMinHeight}}>
          {Array.from({length: SEGMENTS}, (_, index) => {
            const isLit = index < litCount;
            return (
              <View
                key={`clock-segment-${index}`}
                style={{
                  flex: 1,
                  height: segmentHeight,
                  marginHorizontal: adaptive.s(1),
                  borderRadius: isHandheldLandscape ? adaptive.s(3) : adaptive.s(4),
                  backgroundColor: isLit ? activeColor : '#2A2B31',
                  opacity: isLit ? 1 : 0.98,
                }}
              />
            );
          })}
        </View>

        <Text
          color={activeColor}
          fontSize={secondsFontSize}
          fontWeight={'bold'}
          marginLeft={String(secondsMarginLeft)}>
          {`${safeCurrent}s`}
        </Text>
      </View>
    </Button>
  );
};

export default memo(PoolShotClock);