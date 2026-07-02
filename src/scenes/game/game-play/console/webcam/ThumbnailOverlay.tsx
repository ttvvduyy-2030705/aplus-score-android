import React, {memo, useEffect} from 'react';
import {cleanupLegacyLogoStorage} from 'utils/logoCleanup';

export type ThumbnailOverlayData = {
  enabled: false;
  topLeft: [];
  topRight: [];
  bottomLeft: [];
  bottomRight: [];
};

type Props = {
  data?: ThumbnailOverlayData;
  fullscreen?: boolean;
};

const ThumbnailOverlay = (_props: Props) => {
  useEffect(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  return null;
};

export default memo(ThumbnailOverlay);
