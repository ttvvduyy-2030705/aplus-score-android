import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  matchInfo: {
    position: 'absolute',
    bottom: responsiveScale(-512),
    width: '200%',
    borderWidth: 1,
    borderColor: colors.white,
    overflow: 'hidden',
    backgroundColor: colors.transparent,
  },
  whiteBlock: {
    height: '100%',
    width: 26,
    backgroundColor: colors.white,
    marginRight: -10,
  },
  blackBlock: {
    height: '100%',
    width: 16,
    backgroundColor: colors.transparent,
  },
  imageTurnLeft: {
    width: responsiveScale(24),
    height: responsiveScale(24),
    tintColor: colors.white,
  },
  imageTurnRight: {
    width: responsiveScale(24),
    height: responsiveScale(24),
    transform: [{rotate: '180deg'}],
    tintColor: colors.white,
  },
  empty: {
    width: responsiveScale(24),
    height: responsiveScale(24),
  },
  matchBackground: {
    backgroundColor: colors.darkRed,
  },
  matchRace: {
    height: '100%',
  },
  matchPointText: {
    marginTop: responsiveScale(-10),
    marginBottom: responsiveScale(-8),
  },
});

export default styles;