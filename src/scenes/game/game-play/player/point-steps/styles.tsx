import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  stepsWrapper: {
    flexWrap: 'wrap',
  },
  buttonStep: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.deepGray,
    borderRadius: 20,
    paddingHorizontal: responsiveScale(35),
    paddingVertical: responsiveScale(15),
    marginRight: responsiveScale(15),
    marginBottom: responsiveScale(15),
  },
});

export default styles;
