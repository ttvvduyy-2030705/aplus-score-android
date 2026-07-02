import React, {memo, ReactElement, useMemo} from 'react';
import {
  Pressable,
  ViewStyle,
  GestureResponderEvent,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import colors from 'configuration/colors';
import View from '../View';

import {START_LINEAR, END_LINEAR} from './constants';
import styles from './styles';

interface ButtonProps {
  children?: ReactElement | ReactElement[] | boolean;
  onPress: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: ViewStyle | ViewStyle[];
  disable?: boolean;
  isLoading?: boolean;
  showGradientColors?: boolean;
  centerChildren?: boolean;
  loadingColor?: string;
  gradientColors?: Array<string>;
  gradientStyle?: ViewStyle;
  disableStyle?: ViewStyle | ViewStyle[];
}

const Button = (props: ButtonProps) => {
  const {
    children,
    onPress,
    onLongPress,
    style,
    disable,
    isLoading,
    showGradientColors,
    centerChildren,
    loadingColor,
    gradientColors,
    gradientStyle,
    disableStyle,
  } = props;

  const _disableStyle = useMemo(() => {
    if (disable) {
      return disableStyle ? [styles.disable, disableStyle] : styles.disable;
    }

    return null;
  }, [disable, disableStyle]);

  const centerStyle = useMemo(() => {
    if (centerChildren) {
      return styles.center;
    }

    return undefined;
  }, [centerChildren]);

  const Component = useMemo(() => {
    if (isLoading) {
      return (
        <View
          style={[styles.fullWidth, styles.disable, centerStyle, gradientStyle]}
          alignItems={'center'}
          justify={'center'}
          paddingVertical={'15'}>
          <ActivityIndicator size={10} color={loadingColor || colors.white} />
        </View>
      );
    }

    if (disable) {
      return children;
    }

    if (showGradientColors || gradientColors) {
      return (
        <LinearGradient
          colors={
            gradientColors || [
              colors.primary,
              colors.lightPrimary1,
              colors.lightPrimary2,
            ]
          }
          style={[styles.fullWidth, centerStyle, gradientStyle, disableStyle]}
          start={START_LINEAR}
          end={END_LINEAR}>
          {children}
        </LinearGradient>
      );
    }

    return children;
  }, [
    isLoading,
    loadingColor,
    showGradientColors,
    gradientColors,
    gradientStyle,
    disable,
    children,
    centerStyle,
    disableStyle,
  ]);

  return (
    <Pressable
      style={[styles.container, centerStyle, style, _disableStyle]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disable}>
      {Component}
    </Pressable>
  );
};

export default memo(Button);
