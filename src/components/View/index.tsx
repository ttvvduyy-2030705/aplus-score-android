import React, {memo, useMemo, ReactNode, forwardRef} from 'react';
import {
  View as RNView,
  ViewStyle,
  StyleProp,
  LayoutChangeEvent,
} from 'react-native';
import styles from 'configuration/styles';
import LinearGradient from 'react-native-linear-gradient';

import {LINEAR_MAP} from './constansts';

const c_align = 'alignItems_';
const c_flex = 'flex';
const c_justify = 'justify_';
//Margin
const c_margin = 'margin';
const c_marginHorizontal = 'marginHorizontal';
const c_marginVertical = 'marginVertical';
const c_marginTop = 'marginTop';
const c_marginLeft = 'marginLeft';
const c_marginBottom = 'marginBottom';
const c_marginRight = 'marginRight';
//Padding
const c_padding = 'padding';
const c_paddingHorizontal = 'paddingHorizontal';
const c_paddingVertical = 'paddingVertical';
const c_paddingTop = 'paddingTop';
const c_paddingLeft = 'paddingLeft';
const c_paddingBottom = 'paddingBottom';
const c_paddingRight = 'paddingRight';

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  alignItems?: 'start' | 'end' | 'center';
  direction?: 'row' | 'column';
  flex?: '0' | '1' | '2' | '3' | '4' | '6' | '8' | '10';
  justify?: 'start' | 'end' | 'center' | 'between' | 'around';
  //margin
  margin?: '5' | '10' | '15' | '20';
  marginHorizontal?: '5' | '10' | '15' | '20';
  marginVertical?: '5' | '10' | '15' | '20';
  marginTop?: '5' | '10' | '15' | '20';
  marginLeft?: '5' | '10' | '15' | '20';
  marginBottom?: '5' | '10' | '15' | '20';
  marginRight?: '5' | '10' | '15' | '20';
  //padding
  padding?: '5' | '10' | '15' | '20';
  paddingHorizontal?: '5' | '10' | '15' | '20';
  paddingVertical?: '5' | '10' | '15' | '20';
  paddingTop?: '5' | '10' | '15' | '20';
  paddingLeft?: '5' | '10' | '15' | '20';
  paddingBottom?: '5' | '10' | '15' | '20';
  paddingRight?: '5' | '10' | '15' | '20';

  //Linear gradient
  linearColors?: string[];
  linearEffect?: 'leftToRight' | 'rightToLeft' | 'topToBottom' | 'bottomToTop';

  collapsable?: boolean;
}

const View = forwardRef(function MyInput(
  props: Props,
  ref: React.ForwardedRef<RNView>,
) {
  const {
    children,
    style,
    onLayout,
    alignItems = 'start',
    direction = 'column',
    flex,
    justify = 'start',
    margin,
    marginHorizontal,
    marginVertical,
    marginTop,
    marginLeft,
    marginBottom,
    marginRight,
    padding,
    paddingHorizontal,
    paddingVertical,
    paddingTop,
    paddingLeft,
    paddingBottom,
    paddingRight,
    //linear
    linearColors,
    linearEffect = 'leftToRight',
    collapsable,
  } = props;

  const _styles = useMemo(() => {
    return [
      styles.align[c_align + alignItems],
      styles.direction[direction],
      flex && styles.flex[c_flex + flex],
      styles.justify[c_justify + justify],
      //Margin
      margin && styles.margin[c_margin + margin],
      marginHorizontal && styles.margin[c_marginHorizontal + marginHorizontal],
      marginVertical && styles.margin[c_marginVertical + marginVertical],
      marginTop && styles.margin[c_marginTop + marginTop],
      marginLeft && styles.margin[c_marginLeft + marginLeft],
      marginBottom && styles.margin[c_marginBottom + marginBottom],
      marginRight && styles.margin[c_marginRight + marginRight],
      //Padding
      padding && styles.padding[c_padding + padding],
      paddingHorizontal &&
        styles.padding[c_paddingHorizontal + paddingHorizontal],
      paddingVertical && styles.padding[c_paddingVertical + paddingVertical],
      paddingTop && styles.padding[c_paddingTop + paddingTop],
      paddingLeft && styles.padding[c_paddingLeft + paddingLeft],
      paddingBottom && styles.padding[c_paddingBottom + paddingBottom],
      paddingRight && styles.padding[c_paddingRight + paddingRight],

      style,
    ];
  }, [
    style,
    alignItems,
    direction,
    flex,
    justify,
    margin,
    marginHorizontal,
    marginVertical,
    marginTop,
    marginLeft,
    marginBottom,
    marginRight,
    padding,
    paddingHorizontal,
    paddingVertical,
    paddingTop,
    paddingLeft,
    paddingBottom,
    paddingRight,
  ]);

  if (linearColors) {
    return (
      <LinearGradient
        colors={linearColors}
        start={LINEAR_MAP[linearEffect].start}
        end={LINEAR_MAP[linearEffect].end}
        style={_styles}>
        {children}
      </LinearGradient>
    );
  }

  return (
    <RNView
      ref={ref}
      style={_styles}
      onLayout={onLayout}
      collapsable={collapsable}>
      {children}
    </RNView>
  );
});

export default memo(View);
