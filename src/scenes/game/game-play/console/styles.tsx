import colors from 'configuration/colors';
import {StyleSheet} from 'react-native';
import {scale as responsiveScale} from 'utils/responsive';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 30,
  },
  icon: {
    width: responsiveScale(32),
    height: responsiveScale(32),
  },
  buttonSound: {
    padding: responsiveScale(15),
  },
  button: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: 10,
    paddingVertical: responsiveScale(5),
    borderColor: colors.gray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marginTop: {
    marginTop: responsiveScale(20),
  },
  marginVertical: {
    marginVertical: responsiveScale(20),
  },
  logo: {
    height: responsiveScale(56),
    width: responsiveScale(128),
  },
  buttonWrapper: {
    overflow: 'hidden',
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
  buttonGiveMoreTime: {
    backgroundColor: colors.yellow,
  },
  buttonTurns: {
    borderColor: colors.black,
    borderWidth: 0.5,
    backgroundColor: colors.yellow,
  },

  floatingHeaderSpacer: {
    height: 8,
  },

  arenaShell: {
    flex: 1,
    backgroundColor: '#0A0B0F',
    borderRadius: 30,
    borderWidth: 1.2,
    borderColor: '#7A1115',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    shadowColor: '#FF1E1E',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 0},
    elevation: 8,
  },
  arenaHeader: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  arenaSoundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#15161B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arenaSoundIcon: {
    width: 22,
    height: 22,
  },
  arenaHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arenaTableText: {
    color: '#8E9099',
    fontSize: 12,
  },
  arenaToggleStack: {
    minWidth: 114,
    gap: 6,
  },
  arenaToggleRow: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#15161B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arenaToggleLabel: {
    color: '#EDEDEF',
    fontSize: 11,
    marginRight: 8,
  },
  arenaTimerWrap: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 10,
    minWidth: 280,
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#2A0808',
  },
  arenaTimerText: {
    color: '#FF1E1E',
    fontSize: 70,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  arenaStatRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  arenaStatCard: {
    flex: 1,
    minHeight: 60,
    borderRadius: 16,
    backgroundColor: '#15161B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  arenaStatLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  arenaStatValue: {
    color: '#FF2626',
    fontSize: 30,
    fontWeight: '700',
  },
  arenaWinnerBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#f6f6f8',
    gap: 10,
  },
  arenaWinnerText: {
    color: '#F5F5F7',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  arenaCameraCard: {
    flex: 1,
    minHeight: 230,
    borderRadius: 20,
    backgroundColor: '#111214',
    paddingHorizontal: 8,
    paddingBottom: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  arenaActionGroup: {
    gap: 10,
  },
  arenaActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  arenaActionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  arenaActionButtonDark: {
    backgroundColor: '#1A1B20',
  },
  arenaActionButtonGreen: {
    backgroundColor: '#11C91C',
  },
  arenaActionButtonYellow: {
    backgroundColor: '#E0A000',
  },
  arenaActionButtonRed: {
    backgroundColor: '#FF221A',
  },
  arenaActionButtonDisabled: {
    opacity: 0.45,
  },
  arenaActionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  arenaActionButtonTextDark: {
    color: '#141414',
  },
  arenaFooterNote: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
  },
  arenaFooterNoteText: {
    color: '#C9CAD0',
    fontSize: 15,
    fontWeight: '500',
  },
  smallActionText: {
  color: '#FFFFFF',
  fontSize: 18,
  fontWeight: '700',
  textAlign: 'center',
  includeFontPadding: false,
  textAlignVertical: 'center',
},
wideButtonText: {
  color: '#FFFFFF',
  fontSize: 20,
  fontWeight: '800',
  textAlign: 'center',
  includeFontPadding: false,
  textAlignVertical: 'center',
},
dualButtonText: {
  color: '#FFFFFF',
  fontSize: 20,
  fontWeight: '800',
  textAlign: 'center',
  includeFontPadding: false,
  textAlignVertical: 'center',
},
tripleButtonText: {
  color: '#FFFFFF',
  fontSize: 19,
  fontWeight: '800',
  textAlign: 'center',
  includeFontPadding: false,
  textAlignVertical: 'center',
},
poolSmallActionText: {
  fontSize: 32,
  fontWeight: '900',
  lineHeight: 36,
  includeFontPadding: false,
  textAlignVertical: 'center',
},
poolWideButtonText: {
  fontSize: 35,
  fontWeight: '900',
  lineHeight: 39,
  includeFontPadding: false,
  textAlignVertical: 'center',
},
poolDualButtonText: {
  fontSize: 35,
  fontWeight: '900',
  lineHeight: 39,
  includeFontPadding: false,
  textAlignVertical: 'center',
},
poolTripleButtonText: {
  fontSize: 32,
  fontWeight: '900',
  lineHeight: 36,
  includeFontPadding: false,
  textAlignVertical: 'center',
},
});

export default styles;
