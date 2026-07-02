import {StyleSheet} from 'react-native';

import colors from 'configuration/colors';
import {LayoutPreset} from 'scenes/game/useAdaptiveLayout';

export const createStyles = (adaptive: {
  s: (value: number) => number;
  fs: (value: number) => number;
  layoutPreset: LayoutPreset;
  width?: number;
  height?: number;
  isLandscape?: boolean;
  isShortLandscape?: boolean;
}) => {
  const {s, fs, layoutPreset, width = 0, height = 0, isLandscape = false, isShortLandscape = false} = adaptive;
  const isPhone = layoutPreset === 'phone';
  const compactLandscape = isLandscape && (isShortLandscape || height <= 760 || width <= 1180);

  return StyleSheet.create({
    container: {
      paddingBottom: s(4),
    },
    mainTitle: {
      color: '#FFFFFF',
      fontSize: fs(isPhone ? 14 : 16),
      fontWeight: '800',
      marginBottom: s(10),
    },
    section: {
      marginBottom: s(isPhone ? 8 : compactLandscape ? 10 : 12),
    },
    sectionTitle: {
      color: '#FFFFFF',
      fontSize: fs(isPhone ? 13 : 15),
      fontWeight: '800',
      marginBottom: s(compactLandscape ? 4 : 6),
    },
    sectionDivider: {
      height: 1.1,
      backgroundColor: '#FF1F26',
      marginBottom: s(isPhone ? 8 : 10),
    },
    inlineRow: {
      flexDirection: compactLandscape ? 'column' : 'row',
      alignItems: 'flex-start',
      marginBottom: s(isPhone ? 6 : compactLandscape ? 7 : 8),
    },
    compactOptionRow: {
      marginBottom: s(isPhone ? 6 : 7),
    },
    inlineLabel: {
      width: compactLandscape ? '100%' : s(isPhone ? 58 : 66),
      color: '#FFFFFF',
      fontSize: fs(isPhone ? 11 : compactLandscape ? 12 : 13),
      fontWeight: '700',
      marginRight: compactLandscape ? 0 : s(8),
      marginBottom: compactLandscape ? s(4) : 0,
      paddingTop: compactLandscape ? 0 : s(6),
    },
    inlineOptions: {
      flex: 1,
      minWidth: 0,
    },

    fixedInlineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: s(isPhone ? 6 : 8),
    },
    fixedInlineLabel: {
      width: s(isPhone ? 58 : 66),
      color: '#FFFFFF',
      fontSize: fs(isPhone ? 11 : compactLandscape ? 12 : 13),
      fontWeight: '700',
      marginRight: s(8),
      paddingTop: s(6),
    },
    poolBlock: {
      marginBottom: s(compactLandscape ? 4 : 6),
    },
    modeOnlyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: s(compactLandscape ? 4 : 6),
    },
    optionsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    optionButton: {
      minHeight: s(isPhone ? 28 : 31),
      paddingHorizontal: s(isPhone ? 12 : 14),
      paddingVertical: s(4),
      marginRight: s(6),
      marginBottom: s(compactLandscape ? 4 : 6),
      borderRadius: s(13),
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      backgroundColor: '#141414',
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionButtonActive: {
      backgroundColor: '#E11D25',
      borderColor: '#E11D25',
    },
    optionButtonPressed: {
      opacity: 0.88,
    },
    optionText: {
      color: colors.white,
      fontSize: fs(isPhone ? 11 : compactLandscape ? 12 : 13),
      fontWeight: '600',
    },
    optionTextActive: {
      color: colors.white,
      fontWeight: '700',
    },
  });
};

export default createStyles;
