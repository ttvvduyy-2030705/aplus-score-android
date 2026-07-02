import getBrandedScreenMetrics from './getBrandedScreenMetrics';

type AdaptiveLike = Parameters<typeof getBrandedScreenMetrics>[0];

export const createBrandedScreenChrome = (adaptive: AdaptiveLike = {}) => {
  const metrics = getBrandedScreenMetrics(adaptive);
  const {s, fs} = metrics;

  return {
    screen: {
      flex: 1,
      backgroundColor: '#000000',
      paddingHorizontal: metrics.screenPaddingX,
      paddingTop: metrics.screenPaddingTop,
      paddingBottom: metrics.screenPaddingBottom,
    },
    headerGlow: {
      minHeight: metrics.headerHeight,
      borderRadius: metrics.headerRadius,
      borderWidth: 1.2,
      borderColor: 'rgba(255, 52, 52, 0.28)',
      backgroundColor: '#050505',
      flexDirection: 'row' as const,
      position: 'relative' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: metrics.headerSidePadding,
      shadowColor: '#FF1414',
      shadowOpacity: 0.4,
      shadowRadius: s(metrics.isPhone ? 12 : 20),
      shadowOffset: {width: 0, height: s(metrics.isPhone ? 5 : 8)},
      elevation: 12,
    },
    headerBackButton: {
      position: 'absolute' as const,
      left: s(metrics.isPhone ? 12 : 18),
      top: s(metrics.isPhone ? 6 : 9),
      bottom: s(metrics.isPhone ? 6 : 9),
      justifyContent: 'center' as const,
      zIndex: 2,
    },
    headerBackFrame: {
      height: metrics.backButtonHeight,
      minWidth: metrics.backButtonMinWidth,
      paddingHorizontal: s(metrics.isPhone ? 14 : 16),
      borderRadius: metrics.backButtonRadius,
      borderWidth: 1.2,
      borderColor: 'rgba(255, 52, 52, 0.28)',
      backgroundColor: '#070707',
      justifyContent: 'center' as const,
      shadowColor: '#FF1414',
      shadowOpacity: 0.18,
      shadowRadius: s(metrics.isPhone ? 7 : 10),
      shadowOffset: {width: 0, height: s(metrics.isPhone ? 3 : 4)},
      elevation: 6,
      transform: [{skewX: '-16deg'}],
    },
    headerBackInner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      transform: [{skewX: '16deg'}],
    },
    headerBackLogoImage: {
      width: s(metrics.isPhone ? 64 : 72),
      height: s(metrics.isPhone ? 24 : 28),
    },
    headerTitleWrap: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: metrics.headerTitlePadding,
      pointerEvents: 'none' as const,
    },
    headerTitle: {
      flexShrink: 1,
      color: '#FFFFFF',
      textAlign: 'center' as const,
      fontSize: fs(metrics.isPhone ? 18 : 24),
      fontWeight: '800' as const,
      letterSpacing: 0.2,
    },
  };
};

export default createBrandedScreenChrome;
