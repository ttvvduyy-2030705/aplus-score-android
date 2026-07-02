import {StyleSheet} from 'react-native';

import {AdaptiveLayout} from 'scenes/game/useAdaptiveLayout';
import createBrandedScreenChrome from 'scenes/shared/createBrandedScreenChrome';
import getBrandedScreenMetrics from 'scenes/shared/getBrandedScreenMetrics';

const createStyles = (adaptive: AdaptiveLayout) => {
  const chrome = createBrandedScreenChrome(adaptive);
  const metrics = getBrandedScreenMetrics(adaptive);
  const stacked = !adaptive.isLandscape || adaptive.width < 1180;
  const sideGap = metrics.sectionGap;

  return StyleSheet.create({
    screen: chrome.screen,
    scrollView: {
      flex: 1,
      width: '100%',
      alignSelf: 'stretch',
    },
    scrollContent: {
      flexGrow: 1,
      width: '100%',
      alignSelf: 'stretch',
      paddingTop: metrics.sectionGap,
      paddingBottom: metrics.s(8),
    },
    headerGlow: chrome.headerGlow,
    headerBackButton: chrome.headerBackButton,
    headerBackFrame: chrome.headerBackFrame,
    headerBackInner: chrome.headerBackInner,
    headerBackArrow: {
      color: '#FFFFFF',
      fontSize: metrics.fs(22),
      fontWeight: '900',
      marginRight: metrics.s(10),
    },
    headerBackLogoImage: chrome.headerBackLogoImage,
    headerTitleWrap: chrome.headerTitleWrap,
    logoButton: {
      width: metrics.s(120),
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingVertical: metrics.s(6),
    },
    logoImage: {
      width: metrics.s(92),
      height: metrics.s(34),
    },
    headerTitle: chrome.headerTitle,
    headerSpacer: {
      width: metrics.s(120),
    },
    contentRow: {
      width: '100%',
      alignSelf: 'stretch',
      flexDirection: stacked ? 'column' : 'row',
      alignItems: 'stretch',
      gap: stacked ? metrics.sectionGap : sideGap,
    },
    contentColumn: {
      flexDirection: 'column',
    },
    leftColumn: {
      width: '100%',
      alignSelf: 'stretch',
      flex: stacked ? undefined : 1,
      minWidth: 0,
    },
    centerColumn: {
      width: '100%',
      alignSelf: 'stretch',
      flex: stacked ? undefined : 1.22,
      minWidth: 0,
    },
    rightColumn: {
      width: '100%',
      alignSelf: 'stretch',
      flex: stacked ? undefined : 1,
      minWidth: 0,
    },
    stackedColumn: {
      marginBottom: 0,
    },
    columnSpacer: {
      height: metrics.sectionGap,
    },
    panelShell: {
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: metrics.panelRadius,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      backgroundColor: '#050505',
      padding: metrics.panelPadding,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: metrics.s(10),
      shadowOffset: {width: 0, height: metrics.s(6)},
      elevation: 8,
    },
    livePanelBody: {
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: metrics.cardRadius,
      overflow: 'hidden',
      minHeight: 0,
    },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: '#090909',
      borderRadius: metrics.cardRadius,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      padding: metrics.s(6),
      marginBottom: metrics.s(14),
      gap: metrics.s(8),
    },
    tabButton: {
      flex: 1,
      minHeight: metrics.buttonHeight,
      borderRadius: metrics.fieldRadius,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    tabButtonActive: {
      backgroundColor: '#C91D24',
      borderColor: 'rgba(255,255,255,0.12)',
    },
    tabButtonIdle: {
      backgroundColor: '#0F0F0F',
      borderColor: 'rgba(255,255,255,0.08)',
    },
    tabLabel: {
      color: '#FFFFFF',
      fontSize: metrics.fs(stacked ? 14 : 15),
      fontWeight: '700',
    },
  });
};

export default createStyles;
