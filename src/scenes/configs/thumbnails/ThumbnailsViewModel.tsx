import {useCallback, useEffect, useMemo} from 'react';
import {cleanupLegacyLogoStorage} from 'utils/logoCleanup';

const ThumbnailsViewModel = () => {
  useEffect(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  const cleanup = useCallback(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  return useMemo(
    () => ({enabled: false, cleanup}),
    [cleanup],
  );
};

export default ThumbnailsViewModel;
