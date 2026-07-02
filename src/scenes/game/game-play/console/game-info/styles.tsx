import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  button: {
    flex: 1,
    borderRadius: 0,
    paddingVertical: responsiveScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonWrapper: {
    overflow: 'hidden',
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
  buttonGiveMoreTime: {
    backgroundColor: colors.yellow,
  },
  textPointMarginBottom: {
    marginTop: responsiveScale(-24),
  },
  textPointNoMarginBottom: {
    marginTop: responsiveScale(-16),
  },
  pointWrapper: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointLabel: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 20,
  },
  pointColon: {
    marginHorizontal: 4,
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 20,
  },
  valueWrapper: {
    minWidth: '18%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 32,
  },
  buttonTurns: {
    backgroundColor: colors.gray2,
  },
  buttonSwapPlayers: {
    backgroundColor: colors.yellow,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
});

export default styles;
