import {StyleSheet} from 'react-native';
import colors from 'configuration/colors';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  functionWrapper: {
    top: responsiveScale(24),
    left: 0,
    position: 'absolute',
    width: '100%',
    height: '25%',
  },
  buttonPoolBreak: {
    backgroundColor: colors.green,
    paddingVertical: responsiveScale(8),
    paddingHorizontal: responsiveScale(24),
    marginRight: responsiveScale(15),
  },
  additionalWrapper: {
    marginTop: responsiveScale(-16),
    height: '100%',
  },
});

export default styles;
