import React, {memo, useCallback, useMemo} from 'react';
import Text from 'components/Text';
import View from 'components/View';
import {PoolBallType} from 'types/ball';
import {ViewStyle} from 'react-native';
import Button from 'components/Button';
import useAdaptiveLayout from 'scenes/game/useAdaptiveLayout';

interface Props {
  data: PoolBallType;
  onPress?: (ball: PoolBallType) => void;
  size?: 'large' | 'small';
}

const Ball = (props: Props) => {
  const isSmall = props.size === 'small';
  const adaptive = useAdaptiveLayout();

  const _onPress = useCallback(() => {
    if (!props.onPress) {
      return;
    }

    props.onPress(props.data);
  }, [props]);

  const sizeStyles = useMemo(() => {
    const containerSize = adaptive.s(isSmall ? 32.5 : 65);
    const ballSize = adaptive.s(isSmall ? 19 : 38);
    const cutHeight = adaptive.s(isSmall ? 3.2 : 6.4);

    return {
      container: {
        width: containerSize,
        height: containerSize,
        borderRadius: containerSize / 2,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        overflow: 'hidden' as const,
        elevation: 5,
      },
      ball: {
        backgroundColor: '#FFFFFF',
        width: ballSize,
        height: ballSize,
        borderRadius: ballSize / 2,
      },
      cut: {
        backgroundColor: '#FFFFFF',
        height: cutHeight,
        width: '100%' as const,
      },
      textSize: isSmall ? adaptive.fs(12, 0.82, 1.02) : adaptive.fs(24, 0.82, 1.04),
    };
  }, [adaptive, isSmall]);

  const style: ViewStyle = useMemo(() => {
    return {
      backgroundColor: props.data.color,
    };
  }, [props.data.color]);

  return (
    <Button
      style={[sizeStyles.container, style]}
      onPress={_onPress}>
      {props.data.cut ? (
        <View style={sizeStyles.cut} />
      ) : (
        <View />
      )}
      <View
        style={sizeStyles.ball}
        alignItems={'center'}
        justify={'center'}>
        <Text fontWeight={'bold'} fontSize={sizeStyles.textSize}>
          {props.data.number}
        </Text>
      </View>
      {props.data.cut ? (
        <View style={sizeStyles.cut} />
      ) : (
        <View />
      )}
    </Button>
  );
};

export default memo(Ball);
