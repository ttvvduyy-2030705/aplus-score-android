import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  container: {
    width: responsiveScale(65),
    height: responsiveScale(65),
    borderRadius: responsiveScale(32.5),
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    elevation: 5,
  },
  smallContainer: {
    width: responsiveScale(32.5),
    height: responsiveScale(32.5),
    borderRadius: responsiveScale(16.25),
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    elevation: 5,
  },
  ball: {
    backgroundColor: colors.white,
    width: responsiveScale(38),
    height: responsiveScale(38),
    borderRadius: responsiveScale(19),
  },
  smallBall: {
    backgroundColor: colors.white,
    width: responsiveScale(19),
    height: responsiveScale(19),
    borderRadius: responsiveScale(9.5),
  },
  cutWrapper: {
    backgroundColor: colors.white,
    height: responsiveScale(6.4),
    width: '100%',
  },
  smallCutWrapper: {
    backgroundColor: colors.white,
    height: responsiveScale(3.2),
    width: '100%',
  },
});

export default styles;
