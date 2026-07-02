import React, {memo} from 'react';
import {Image as RNImage, StyleSheet, ViewStyle, ImageStyle} from 'react-native';
import Button from 'components/Button';
import View from 'components/View';
import {BallType} from 'types/ball';

const POOL8_BLACK_BALL_IMAGES: Record<string, number> = {
  '1': require('../../../assets/images/pool8-black/ball_01.png'),
  '2': require('../../../assets/images/pool8-black/ball_02.png'),
  '3': require('../../../assets/images/pool8-black/ball_03.png'),
  '4': require('../../../assets/images/pool8-black/ball_04.png'),
  '5': require('../../../assets/images/pool8-black/ball_05.png'),
  '6': require('../../../assets/images/pool8-black/ball_06.png'),
  '7': require('../../../assets/images/pool8-black/ball_07.png'),
  '8': require('../../../assets/images/pool8-black/ball_08.png'),
  '9': require('../../../assets/images/pool8-black/ball_09.png'),
  '10': require('../../../assets/images/pool8-black/ball_10.png'),
  '11': require('../../../assets/images/pool8-black/ball_11.png'),
  '12': require('../../../assets/images/pool8-black/ball_12.png'),
  '13': require('../../../assets/images/pool8-black/ball_13.png'),
  '14': require('../../../assets/images/pool8-black/ball_14.png'),
  '15': require('../../../assets/images/pool8-black/ball_15.png'),
};

export const getPool8BlackBallSource = (ballNumber?: BallType | string | number | null) => {
  const key = String(ballNumber ?? '').trim();
  return POOL8_BLACK_BALL_IMAGES[key];
};

type Props = {
  number: BallType | string | number;
  size?: number;
  onPress?: () => void;
  disable?: boolean;
  style?: ViewStyle | ViewStyle[];
  imageStyle?: ImageStyle | ImageStyle[];
};

const Pool8BlackBall = ({number, size = 44, onPress, disable, style, imageStyle}: Props) => {
  const source = getPool8BlackBallSource(number);
  if (!source) {
    return null;
  }

  const content = (
    <View
      style={[
        styles.glowShell,
        {width: size, height: size, borderRadius: size / 2},
        style,
      ]}
      alignItems={'center'}
      justify={'center'}>
      <RNImage
        source={source}
        resizeMode="contain"
        fadeDuration={0}
        style={[
          styles.image,
          {width: Math.max(0, size - 2), height: Math.max(0, size - 2)},
          imageStyle,
        ]}
      />
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Button onPress={onPress} disable={disable} style={styles.buttonReset}>
      {content}
    </Button>
  );
};

const styles = StyleSheet.create({
  buttonReset: {
    backgroundColor: 'transparent',
  },
  glowShell: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 48, 48, 0.55)',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    shadowColor: '#FF2D2D',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: {width: 0, height: 0},
    elevation: 0,
    overflow: 'hidden',
  },
  image: {
    overflow: 'visible',
  },
});

export default memo(Pool8BlackBall);
