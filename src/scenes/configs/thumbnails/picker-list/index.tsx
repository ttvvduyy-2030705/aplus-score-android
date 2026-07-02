import React, {memo, useEffect} from 'react';
import {cleanupLegacyLogoStorage} from 'utils/logoCleanup';
import {Props} from './PickerListViewModel';

const PickerList = (_props: Props) => {
  useEffect(() => {
    void cleanupLegacyLogoStorage();
  }, []);

  return null;
};

export default memo(PickerList);
