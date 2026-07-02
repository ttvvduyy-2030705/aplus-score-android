import React, {memo, useEffect} from 'react';
import {cleanupLegacyLogoStorage} from 'utils/logoCleanup';

const Thumbnails = () => {
  useEffect(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  return null;
};

export default memo(Thumbnails);
