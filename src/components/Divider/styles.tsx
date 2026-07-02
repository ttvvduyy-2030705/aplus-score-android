import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';

const styles = StyleSheet.create({
  large: {
    width: '100%',
    height: 20,
    backgroundColor: colors.lightGray2,
  },
  medium: {
    width: '100%',
    height: 10,
    backgroundColor: colors.lightGray2,
  },
  small: {
    width: '100%',
    height: 1,
    backgroundColor: colors.lightGray2,
  },
  vertical_large: {
    width: 10,
    height: '100%',
    backgroundColor: colors.lightGray2,
  },
  vertical_medium: {
    width: 5,
    height: '100%',
    backgroundColor: colors.lightGray2,
  },
  vertical_small: {
    width: 2,
    height: '100%',
    backgroundColor: colors.lightGray2,
  },
});

export default styles;
