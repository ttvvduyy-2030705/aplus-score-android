import {useMemo} from 'react';

import useAdaptiveLayout from 'scenes/game/useAdaptiveLayout';

import createDesignSystem from './designSystem';
import useSafeScreenInsets from './safeArea';

export const useDesignSystem = () => {
  const adaptive = useAdaptiveLayout();
  const insets = useSafeScreenInsets();

  const design = useMemo(
    () => createDesignSystem(adaptive, insets),
    [
      adaptive.styleKey,
      insets.top,
      insets.right,
      insets.bottom,
      insets.left,
    ],
  );

  return {
    adaptive,
    insets,
    design,
  };
};

export default useDesignSystem;
