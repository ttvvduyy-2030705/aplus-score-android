import {StyleSheet} from 'react-native';

import colors from 'configuration/colors';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  button: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: responsiveScale(11),
    borderColor: colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#e0a100',
    borderRadius: 18,
  },
  breakGameButton: {
    backgroundColor: '#16c113',
    borderRadius: 18,
  },
  stopButton: {
    backgroundColor: '#ff2b2b',
    borderRadius: 18,
  },
});

export default styles;
