import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  image: {
    width: responsiveScale(256),
    height: responsiveScale(144),
    marginRight: responsiveScale(10),
  },
  absolute: {
    position: 'absolute',
    bottom: responsiveScale(-512),
  },
  emptyView: {
    width: responsiveScale(256),
    height: responsiveScale(144),
  },
});

export default styles;
