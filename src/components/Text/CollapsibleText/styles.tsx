import colors from 'configuration/colors';
import fonts from 'configuration/fonts';
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  descriptionOverlay: {
    position: 'absolute',
    paddingHorizontal: 15,
  },
  html: {
    color: colors.deepGray,
    fontFamily: fonts.Nunito.regular,
    lineHeight: 23,
  },
  arrowContainer: {
    position: 'absolute',
    top: 0,
    right: 10,
  },
  tinyIcon: {
    width: 10,
    height: 10,
    tintColor: colors.deepGray,
  },
});

export default styles;
