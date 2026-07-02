import AsyncStorage from '@react-native-async-storage/async-storage';
import {keys} from 'configuration/keys';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {WebcamType} from 'types/webcam';

const ConfigsViewModel = () => {
  const [currentWebcamType, setCurrentWebcamType] = useState(WebcamType.camera);

  useEffect(() => {
    AsyncStorage.getItem(keys.WEBCAM_TYPE, (error, result) => {
      if (error) {
        return;
      }

      setCurrentWebcamType(result ? (result as WebcamType) : WebcamType.camera);
    });
  }, []);

  const onSelectWebcam = useCallback(() => {
    setCurrentWebcamType(WebcamType.webcam);
  }, []);

  const onSelectCamera = useCallback(() => {
    setCurrentWebcamType(WebcamType.camera);
  }, []);

  return useMemo(() => {
    return {currentWebcamType, onSelectCamera, onSelectWebcam};
  }, [currentWebcamType, onSelectCamera, onSelectWebcam]);
};

export default ConfigsViewModel;
