import React, {memo, useEffect} from 'react';

export interface Props {
  currentPlayerIndex: number;
  countdownTime?: number;
  gameSettings?: any;
  playerSettings?: any;
}

const LiveStreamImages = (_props: Props) => {
  useEffect(() => {
    console.log('[LogoCleanup] ignoredLegacyLogoField=true');
  }, []);

  return null;
};

export default memo(LiveStreamImages);
