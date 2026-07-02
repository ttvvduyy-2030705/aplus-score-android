import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {responsiveDimension} from 'utils/helper';

const radius = responsiveDimension(12);

const styles = StyleSheet.create({
  container: {
    borderRadius: radius,
  },
  fullWidth: {
    width: '100%',
    borderRadius: radius,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: responsiveDimension(10),
  },
  disable: {
    backgroundColor: colors.lightGray2,
    opacity: 0.75,
  },
});

export default styles;
