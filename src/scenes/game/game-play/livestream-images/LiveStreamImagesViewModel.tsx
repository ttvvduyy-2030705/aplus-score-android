import {useCallback, useEffect, useMemo} from 'react';
import {cleanupLegacyLogoStorage} from 'utils/logoCleanup';

export interface Props {
  currentPlayerIndex: number;
  countdownTime?: number;
  gameSettings?: any;
  playerSettings?: any;
}

const LiveStreamImagesViewModel = (_props: Props) => {
  useEffect(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  const noop = useCallback(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  return useMemo(
    () => ({
      topLeftRef: {current: null},
      topRightRef: {current: null},
      bottomLeftRef: {current: null},
      bottomRightRef: {current: null},
      topLeftImages: [] as string[],
      topRightImages: [] as string[],
      bottomLeftImages: [] as string[],
      bottomRightImages: [] as string[],
      refresh: noop,
      captureTopLeft: noop,
      captureTopRight: noop,
      captureBottomLeft: noop,
      captureBottomRight: noop,
    }),
    [noop],
  );
};

export default LiveStreamImagesViewModel;
