import React, {memo, useMemo, ReactNode} from 'react';
import {Text as RNText, TextStyle, LayoutChangeEvent} from 'react-native';
import {responsiveFontSize} from 'utils/helper';

import colors from 'configuration/colors';
import {getSelectedFont} from 'configuration/fonts';

interface TextProps {
  children: ReactNode;
  style?: TextStyle | TextStyle[];
  fontWeight?:
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900'
    | 'bold'
    | 'normal';
  fontStyle?: 'normal' | 'italic';
  textDecorationStyle?: 'solid' | 'dotted' | 'dashed' | 'double' | undefined;
  textDecorationLine?:
    | 'none'
    | 'underline'
    | 'line-through'
    | 'underline line-through'
    | undefined;
  fontSize?: number;
  lineHeight?: number;
  numberOfLines?: number;
  letterSpacing?: number;
  ellipsizeMode?: 'clip' | 'head' | 'middle' | 'tail';
  textAlign?: 'center' | 'justify' | 'left' | 'right';
  color?: string;
  adjustsFontSizeToFit?: boolean;
  includeFontPadding?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}

const Text = (props: TextProps) => {
  const {
    children,
    style,
    fontWeight = 'normal',
    fontStyle = 'normal',
    textDecorationStyle,
    textDecorationLine,
    fontSize = 14,
    lineHeight,
    numberOfLines,
    letterSpacing,
    ellipsizeMode = 'tail',
    textAlign = 'left',
    color = colors.black,
    adjustsFontSizeToFit,
    onLayout,
  } = props;

  const textStyle = useMemo(() => {
    const propStyle = {
      textAlign,
      fontStyle,
      fontSize: responsiveFontSize(fontSize),
    };

    const result = [style, propStyle];

    if (color) {
      result.push({color});
    }

    if (lineHeight) {
      result.push({lineHeight: responsiveFontSize(lineHeight)});
    }

    if (fontWeight === 'bold') {
      result.push({fontFamily: getSelectedFont('Nunito-Regular', 'bold')});
    } else if (fontWeight === '900') {
      result.push({fontFamily: getSelectedFont('Nunito-Regular', 'black')});
    }

    if (textDecorationStyle) {
      result.push({textDecorationStyle});
    }

    if (textDecorationLine) {
      result.push({textDecorationLine});
    }

    if (letterSpacing) {
      result.push({letterSpacing});
    }

    return result;
  }, [
    style,
    fontWeight,
    fontStyle,
    textDecorationStyle,
    textDecorationLine,
    fontSize,
    lineHeight,
    textAlign,
    color,
    letterSpacing,
  ]);

  return (
    <RNText
      style={textStyle}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      onLayout={onLayout}>
      {children}
    </RNText>
  );
};

export default memo(Text);
