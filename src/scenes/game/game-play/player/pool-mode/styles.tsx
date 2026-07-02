import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  textViolate: {
    marginBottom: -16,
  },
  textX: {
    marginTop: responsiveScale(-6),
  },
  buttonViolate: {
    width: responsiveScale(96),
    height: responsiveScale(96),
    borderRadius: 100,
    backgroundColor: colors.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default styles;
