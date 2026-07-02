import {StyleSheet} from 'react-native';
import colors from 'configuration/colors';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  totalPointInTurn: {
    backgroundColor: colors.grayBlue,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: responsiveScale(30),
  },
});

export default styles;
