import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.black,
  },

  webcamButton: {
    flex: 1,
    backgroundColor: colors.black,
  },

  webcamWrapper: {
    flex: 1,
    backgroundColor: colors.black,
  },

  icon: {
    width: responsiveScale(24),
    height: responsiveScale(24),
  },

  fullWidth: {
    width: '100%',
  },

  buttonIP: {
    flexDirection: 'row',
    padding: responsiveScale(10),
    backgroundColor: colors.whiteDarkerOverlay,
    borderRadius: 20,
  },

  controlWrapper: {},

  innerControlWrapper: {
    marginTop: responsiveScale(-48),
    backgroundColor: colors.white,
  },

  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  overlayTouch: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});

export default styles;