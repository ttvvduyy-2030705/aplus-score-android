import {useCallback, useEffect, useMemo} from 'react';
import {cleanupLegacyLogoStorage} from 'utils/logoCleanup';

export interface Props {
  saveKey: string;
  fixedImageSource?: number;
  locked?: boolean;
  premiumLocked?: boolean;
}

const PickerListViewModel = (props: Props) => {
  useEffect(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  const noop = useCallback(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  return useMemo(
    () => ({
      images: [] as string[],
      locked: !!props.locked,
      premiumBlocked: false,
      fixedImageSource: props.fixedImageSource,
      onPickImage: noop,
      onDeleteImage: noop,
      onLockedPress: noop,
    }),
    [noop, props.fixedImageSource, props.locked],
  );
};

export default PickerListViewModel;
