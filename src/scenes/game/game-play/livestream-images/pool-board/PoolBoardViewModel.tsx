import {useEffect, useMemo, useRef} from 'react';
import {captureRef} from 'react-native-view-shot';
import RNFS from 'react-native-fs';

import {PlayerSettings} from 'types/player';
import {GameSettings} from 'types/settings';
import {MATCH_IMAGE, WEBCAM_BASE_CAMERA_FOLDER} from 'constants/webcam';

export interface Props {
  currentPlayerIndex: number;
  gameSettings?: GameSettings;
  playerSettings?: PlayerSettings;
}

const PoolBoardViewModel = (props: Props) => {
  const matchRef = useRef(null);

  // useEffect(() => {
  //   if (
  //     !matchRef.current ||
  //     !props.playerSettings ||
  //     props.playerSettings.playingPlayers.length > 2
  //   ) {
  //     return;
  //   }

  //   const timeout = setTimeout(() => {
  //     if (!matchRef.current) {
  //       return;
  //     }

  //     // captureRef(matchRef, {
  //     //   format: 'png',
  //     //   quality: 0.01,
  //     //   width: 256,
  //     // })
  //     //   .then(
  //     //     async uri => {
  //     //       const matchImagePath = `${RNFS.DownloadDirectoryPath}/${WEBCAM_BASE_CAMERA_FOLDER}/${MATCH_IMAGE}`;
  //     //       const _path = uri.slice(7);

  //     //       RNFS.copyFile(_path, matchImagePath);
  //     //     },
  //     //     error => console.error('Oops, match info failed', error),
  //     //   )
  //     //   .catch(e => {
  //     //     if (__DEV__) {
  //     //       console.log('Capture match info error', e);
  //     //     }
  //     //   });
  //     clearTimeout(timeout);
  //   }, 1000);
  // }, [props.playerSettings]);

  return useMemo(() => {
    const player0 = props.playerSettings?.playingPlayers[0];
    const player1 = props.playerSettings?.playingPlayers[1];

    return {matchRef, player0, player1};
  }, [matchRef, props.playerSettings]);
};

export default PoolBoardViewModel;
