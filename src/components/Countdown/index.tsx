import React, {memo, useEffect, useMemo, useState} from 'react';
import View from 'components/View';
import colors from 'configuration/colors';
import styles from './styles';

interface Props {
  originalCountdownTime: number;
  currentCountdownTime: number;
  countdownWidth: number;
  heightItem?: number;
  marginHorizontal?: number;
  direction?: 'left-to-right' | 'right-to-left';
  colorMode?: 'gradient' | 'threshold';
  yellowThreshold?: number;
  redThreshold?: number;
}

const Countdown = (props: Props) => {
  const originalCountdownTime = Math.max(
    0,
    Number(props.originalCountdownTime || 0),
  );

  const currentCountdownTime = Math.max(
    0,
    Math.min(originalCountdownTime, Number(props.currentCountdownTime || 0)),
  );

  const [itemWidth, setItemWidth] = useState(0);

  useEffect(() => {
    if (!originalCountdownTime) {
      setItemWidth(0);
      return;
    }

    setItemWidth(
      Number((props.countdownWidth / originalCountdownTime).toFixed(2)) -
        (props.marginHorizontal ? props.marginHorizontal * 2 : 10),
    );
  }, [props.countdownWidth, props.marginHorizontal, originalCountdownTime]);

  const ITEM_HEIGHT = useMemo(
    () => (props.heightItem ? props.heightItem : '100%'),
    [props.heightItem],
  );

  const MARGIN_HORIZONTAL = useMemo(
    () => (props.marginHorizontal ? props.marginHorizontal : 5),
    [props.marginHorizontal],
  );

  const direction = props.direction || 'left-to-right';
  const colorMode = props.colorMode || 'gradient';
  const yellowThreshold = props.yellowThreshold ?? 10;
  const redThreshold = props.redThreshold ?? 5;

  const getGradientColor = (index: number) => {
    if (!originalCountdownTime) {
      return colors.primary;
    }

    const section = originalCountdownTime / 4;

    switch (true) {
      case index > section * 3:
        return colors.green;
      case index > section * 2:
        return colors.primary;
      case index > section * 1:
        return colors.yellow;
      default:
        return colors.red;
    }
  };

  const getThresholdColor = () => {
    if (currentCountdownTime <= redThreshold) {
      return colors.red;
    }

    if (currentCountdownTime <= yellowThreshold) {
      return colors.yellow;
    }

    return colors.green;
  };

  const activeThresholdColor = useMemo(
    () => getThresholdColor(),
    [currentCountdownTime, yellowThreshold, redThreshold],
  );

  const COUNTDOWN = useMemo(() => {
    const items = Array.from({length: originalCountdownTime}, (_, index) => {
      const isVisible = currentCountdownTime > index;

      return (
        <View
          key={`countdown-item-${index}`}
          style={[
            styles.countdownItem,
            {
              height: ITEM_HEIGHT,
              marginHorizontal: MARGIN_HORIZONTAL,
              width: itemWidth,
              backgroundColor: isVisible
                ? colorMode === 'threshold'
                  ? activeThresholdColor
                  : getGradientColor(index)
                : 'transparent',
            },
          ]}
        />
      );
    });

    return direction === 'right-to-left' ? items : items.reverse();
  }, [
    originalCountdownTime,
    currentCountdownTime,
    ITEM_HEIGHT,
    MARGIN_HORIZONTAL,
    itemWidth,
    colorMode,
    direction,
    activeThresholdColor,
  ]);

  return (
    <View
      flex={'1'}
      direction={'row'}
      justify={direction === 'right-to-left' ? 'start' : 'end'}>
      {COUNTDOWN}
    </View>
  );
};

export default memo(Countdown);