import {StyleSheet} from 'react-native';

import {AdaptiveLayout} from 'scenes/game/useAdaptiveLayout';
import createBrandedScreenChrome from 'scenes/shared/createBrandedScreenChrome';
import getBrandedScreenMetrics from 'scenes/shared/getBrandedScreenMetrics';

const createStyles = (adaptive: AdaptiveLayout) => {
  const chrome = createBrandedScreenChrome(adaptive);
  const metrics = getBrandedScreenMetrics(adaptive);
  const stacked = !adaptive.isLandscape || adaptive.width < 1100;

  return StyleSheet.create({
    screen: chrome.screen,
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
    listContent: {
      flexGrow: 1,
      width: '100%',
      alignSelf: 'stretch',
      paddingTop: metrics.sectionGap,
      paddingBottom: metrics.s(8),
    },
    item: {
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: metrics.panelRadius,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      backgroundColor: '#050505',
      padding: metrics.panelPadding,
      marginBottom: metrics.sectionGap,
    },
    itemRow: {
      width: '100%',
      flexDirection: stacked ? 'column' : 'row',
      alignItems: stacked ? 'stretch' : 'center',
      gap: metrics.sectionGap,
    },
    itemColumn: {
      flex: 1,
      minWidth: 0,
    },
    itemMeta: {
      color: '#9D9D9D',
      fontSize: metrics.fs(12),
      marginBottom: metrics.s(6),
    },
    itemValue: {
      color: '#FFFFFF',
      fontSize: metrics.fs(13),
      fontWeight: '700',
    },
    playerWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: stacked ? 'flex-start' : 'center',
      gap: metrics.s(8),
    },
    player: {
      borderRadius: metrics.cardRadius,
      minWidth: adaptive.s(stacked ? 132 : 118),
      paddingHorizontal: metrics.s(16),
      paddingVertical: metrics.s(12),
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    playerName: {
      fontSize: metrics.fs(12),
      fontWeight: '700',
      marginBottom: metrics.s(6),
      textAlign: 'center',
    },
    playerPoint: {
      fontSize: metrics.fs(stacked ? 38 : 42),
      fontWeight: '900',
    },
    actionColumn: {
      alignItems: stacked ? 'stretch' : 'flex-end',
      justifyContent: 'center',
      width: stacked ? '100%' : undefined,
    },
    button: {
      backgroundColor: '#C91D24',
      minWidth: adaptive.s(110),
      paddingHorizontal: metrics.s(26),
      paddingVertical: metrics.s(12),
      borderRadius: metrics.fieldRadius,
      alignItems: 'center',
      marginBottom: metrics.s(12),
    },
    buttonText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: metrics.fs(14),
    },
    buttonDelete: {
      alignSelf: stacked ? 'flex-start' : 'flex-end',
      backgroundColor: '#101010',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      padding: metrics.s(10),
      borderRadius: metrics.fieldRadius,
    },
    icon: {
      width: metrics.s(24),
      height: metrics.s(24),
      tintColor: '#FF4444',
    },
    emptyWrap: {
      width: '100%',
      flexGrow: 1,
      paddingVertical: adaptive.s(60),
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      color: '#FFFFFF',
      fontSize: metrics.fs(20),
      fontWeight: '800',
      marginBottom: metrics.s(8),
    },
    emptyText: {
      color: '#888888',
      fontSize: metrics.fs(14),
    },
  });
};

export default createStyles;
