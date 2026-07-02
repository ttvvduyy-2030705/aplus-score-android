import React, {memo, useMemo} from 'react';
import {ViewStyle} from 'react-native';
import View from 'components/View';

import styles from './styles';

interface Props {
  size: 'large' | 'medium' | 'small';
  vertical?: boolean;
  style?: ViewStyle;
}

const Divider = (props: Props) => {
  const {size = 'small', vertical, style} = props;

  const _style = useMemo(() => {
    if (!style) {
      if (vertical) {
        return styles[`vertical_${size}`];
      }

      return styles[size];
    }

    return [styles[size], style];
  }, [vertical, style, size]);

  return <View style={_style} />;
};

export default memo(Divider);
