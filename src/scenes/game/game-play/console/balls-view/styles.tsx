import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  ballsWrapper: {
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    backgroundColor: colors.lightGray2,
  },
  ballPool15OnlyWrapper: {
    backgroundColor: colors.lightGray2,
  },
  ballsLeft: {
    borderTopRightRadius: 60,
    borderBottomRightRadius: 60,
  },
  ballsRight: {
    borderTopLeftRadius: 60,
    borderBottomLeftRadius: 60,
  },
  doubleArrowWrapper: {},
  doubleArrowLeft: {
    width: responsiveScale(26),
    height: responsiveScale(26),
    marginLeft: 10,
  },
  doubleArrowRight: {
    width: responsiveScale(26),
    height: responsiveScale(26),
    marginRight: 10,
    transform: [{rotate: '180deg'}],
  },
  button: {
    flex: 1,
    borderRadius: 0,
    paddingVertical: responsiveScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBreakPool: {
    backgroundColor: colors.green,
  },
  buttonWrapper: {
    overflow: 'hidden',
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
  buttonRestart: {
    backgroundColor: colors.brown,
  },
  buttonGiveMoreTime: {
    backgroundColor: colors.yellow,
  },
  buttonResetTurn: {
    backgroundColor: colors.green,
  },
  buttonSwapPlayers: {
    backgroundColor: colors.yellow,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  buttonBorder: {
    borderWidth: 1,
    borderColor: colors.blue,
  },
});

export default styles;
