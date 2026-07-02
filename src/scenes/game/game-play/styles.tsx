import {StyleSheet} from 'react-native';

import colors from 'configuration/colors';

import type {DesignSystem} from 'theme/designSystem';

import {createGameplayStyles, GameplayLayoutRules} from './layoutRules';
import {AdaptiveLayout} from '../useAdaptiveLayout';

const createStyles = (
  adaptive: AdaptiveLayout,
  design: DesignSystem,
  rules: GameplayLayoutRules,
) => {
  const constrainedLandscape =
    adaptive.isLandscape &&
    (adaptive.isConstrainedLandscape || adaptive.systemMetrics.smallestScreenWidthDp < 600);
  const shortLandscape = adaptive.isLandscape && adaptive.height <= 720;

  return createGameplayStyles(adaptive, {
    warmUpContainer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 40,
    },

    buttonEndWarmUp: {
      backgroundColor: '#131313',
      borderRadius: design.radius.xl,
      borderWidth: rules.panelBorderWidth,
      borderColor: design.colors.borderStrong,
    },

    countdownContainer: {
      width: '100%',
      paddingHorizontal: adaptive.s(2),
      paddingTop: shortLandscape ? design.spacing.xs : design.spacing.sm,
      paddingBottom: shortLandscape ? design.spacing.xs : design.spacing.sm,
      marginTop: shortLandscape ? 0 : adaptive.s(2),
      backgroundColor: '#000000',
      minHeight: shortLandscape ? adaptive.s(36) : adaptive.s(46),
    },

    mainArea: {
      flex: 1,
      paddingTop: shortLandscape ? 0 : adaptive.layoutPreset === 'phone' ? design.spacing.xs : design.spacing.sm,
    },

    mainAreaFullscreen: {
      flex: 1,
      width: '100%',
      height: '100%',
      paddingTop: 0,
      paddingHorizontal: 0,
      paddingBottom: 0,
    },

    fullscreenScreen: {
      flex: 1,
      width: '100%',
      height: '100%',
      minWidth: 0,
      minHeight: 0,
      alignSelf: 'stretch',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      backgroundColor: '#000000',
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
    },

    poolArenaScreen: {
      backgroundColor: '#000000',
      paddingHorizontal: rules.screenPaddingX,
      paddingTop: shortLandscape ? design.spacing.xs : rules.screenPaddingY,
      paddingBottom: 0,
    },

    poolArenaBoard: {
      gap: rules.blockGap,
    },

    poolArenaPlayerColumn: {
      flex: constrainedLandscape ? rules.playerConsoleRatio.side : 1,
      minWidth: 0,
    },

    poolArenaConsoleWrapper: {
      flex:
        adaptive.layoutPreset === 'wideTablet'
          ? rules.playerConsoleRatio.center
          : constrainedLandscape
            ? 1.12
            : adaptive.layoutPreset === 'phone'
              ? 1.06
              : 0.98,
      minWidth: 0,
      marginHorizontal: 0,
      paddingBottom: 0,
    },
  });
};

export default createStyles;
