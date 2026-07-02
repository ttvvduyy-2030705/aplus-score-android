import {StyleSheet} from 'react-native';

import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  extraTimeTurnsContainer: {
    position: 'absolute',
    right: responsiveScale(10),
    top: '36%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraTimeTurn: {
    width: responsiveScale(34),
    height: responsiveScale(34),
    marginBottom: responsiveScale(10),
    borderRadius: 17,
    backgroundColor: 'rgba(24, 25, 31, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraTimeIcon: {
    width: '70%',
    height: '70%',
  },
  extraTimeTurnsEmpty: {
    width: 0,
    height: 0,
  },
});

export default styles;
