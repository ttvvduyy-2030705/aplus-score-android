import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {TextInput, ViewStyle} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {OnLoadData, OnVideoErrorData, VideoRef} from 'react-native-video';
import {keys} from 'configuration/keys';
import {WEBCAM_HOST, WEBCAM_PATH, WEBCAM_PORT} from 'constants/webcam';
import {LanguageContext} from 'context/language';
import {
  Bitrate,
  Fps,
  LiveStreamCamera,
  OutputType,
  Resolution,
  Webcam,
  WebcamType,
} from 'types/webcam';
import colors from 'configuration/colors';

const WebcamConfigViewModel = () => {
  const {language} = useContext(LanguageContext);

  const videoRef = useRef<VideoRef>(null);
  const userNameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [webcam, setWebcam] = useState<Webcam>({
    webcamIP: '',
    username: 'admin',
    password: '',
    syncTime: 60,
    outputType: OutputType.local,
  });

  const [liveStreamData, setLiveStreamData] = useState<LiveStreamCamera>({
    rtmpUrl: '',
    streamKey: '',
    outputType: OutputType.livestream,
    resolution: Resolution.FullHD,
    fps: Fps.F30,
    bitrate: Bitrate.B9000,
  });

  const [webcamUrl, setWebcamUrl] = useState<string>('');
  const [allowToSave, setAllowToSave] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(
      [
        keys.WEBCAM_IP_ADDRESS,
        keys.WEBCAM_USERNAME,
        keys.WEBCAM_PASSWORD,
        keys.WEBCAM_SCALE,
        keys.WEBCAM_SYNC_TIME,
        keys.WEBCAM_TRANSLATE_X,
        keys.WEBCAM_TRANSLATE_Y,
        keys.OUTPUT_TYPE,
        keys.CAMERA_RTMP_URL,
        keys.CAMERA_STREAM_KEY,
        keys.CAMERA_RESOLUTION,
        keys.CAMERA_FPS,
        keys.CAMERA_BITRATE,
        keys.CAMERA_USERNAME,
      ],
      (error, result) => {
        if (error || !result) {
          return;
        }

        const _ip = result[0][1];
        const _username = result[1][1];
        const _password = result[2][1];
        const _scale = result[3][1];
        const _syncTime = result[4][1];
        const _translateX = result[5][1];
        const _translateY = result[6][1];
        const _outputType = result[7][1];
        const _rtmpUrl = result[8][1];
        const _streamKey = result[9][1];
        const _resolution = result[10][1];
        const _fps = result[11][1];
        const _bitrate = result[12][1];
        const _cameraUsername = result[13][1];

        if (!_ip || !_username || !_password || !_outputType) {
          return;
        }

        setWebcam({
          webcamIP: _ip,
          username: _username,
          password: _password,
          scale: _scale ? Number(_scale) : 1,
          syncTime: _syncTime ? Number(_syncTime) : 60,
          translateX: _translateX ? Number(_translateX) : 0,
          translateY: _translateY ? Number(_translateY) : 0,
          outputType: _outputType as OutputType,
        });

        setLiveStreamData(prev => ({
          ...prev,
          rtmpUrl: _rtmpUrl || '',
          streamKey: _streamKey || '',
          resolution: (_resolution || Resolution.FullHD) as Resolution,
          fps: (_fps || Fps.F30) as Fps,
          bitrate: (_bitrate || Bitrate.B9000) as Bitrate,
          username: _cameraUsername || undefined,
        }));
      },
    );
  }, []);

  const onChangeWebcamConfig = useCallback(
    (key: string) => (value: string | number) => {
      setWebcam(prev => ({...prev, [key]: value}));
    },
    [],
  );

  const onChangeLiveStreamConfig = useCallback((data: LiveStreamCamera) => {
    setLiveStreamData(data);
  }, []);

  const onSubmitEditing = useCallback(
    (nextRef: React.RefObject<TextInput>) => () => {
      console.log('nextRef.current', nextRef.current);
      nextRef.current?.focus();
    },
    [],
  );

  const onTest = useCallback(() => {
    const _url = `${WEBCAM_HOST}${webcam?.username}:${webcam?.password}@${webcam?.webcamIP}:${WEBCAM_PORT}${WEBCAM_PATH}`;

    setWebcamUrl(_url);
  }, [webcam]);

  const onSaveConfig = useCallback(() => {
    if (!allowToSave) {
      return;
    }

    setWebcamUrl('');
    setAllowToSave(false);
    AsyncStorage.setItem(keys.WEBCAM_TYPE, WebcamType.webcam);
    AsyncStorage.setItem(keys.WEBCAM_IP_ADDRESS, webcam.webcamIP);
    AsyncStorage.setItem(keys.WEBCAM_USERNAME, webcam.username);
    AsyncStorage.setItem(keys.WEBCAM_PASSWORD, webcam.password);
    AsyncStorage.setItem(keys.WEBCAM_SYNC_TIME, webcam.syncTime.toString());
    AsyncStorage.setItem(keys.OUTPUT_TYPE, webcam.outputType.toString());
    AsyncStorage.setItem(keys.CAMERA_RTMP_URL, liveStreamData.rtmpUrl);
    AsyncStorage.setItem(keys.CAMERA_STREAM_KEY, liveStreamData.streamKey);
    AsyncStorage.setItem(
      keys.CAMERA_RESOLUTION,
      liveStreamData.resolution.toString(),
    );
    AsyncStorage.setItem(keys.CAMERA_FPS, liveStreamData.fps.toString());
    AsyncStorage.setItem(
      keys.CAMERA_BITRATE,
      liveStreamData.bitrate.toString(),
    );
    AsyncStorage.setItem(keys.CAMERA_USERNAME, liveStreamData.username || '');
  }, [allowToSave, webcam, liveStreamData]);

  const onSaveWebcamPosition = useCallback(
    (scale: number, translateX: number, translateY: number) => {
      AsyncStorage.setItem(keys.WEBCAM_SCALE, scale.toString());
      AsyncStorage.setItem(
        keys.WEBCAM_TRANSLATE_X,
        Math.round(translateX).toString(),
      );
      AsyncStorage.setItem(
        keys.WEBCAM_TRANSLATE_Y,
        Math.round(translateY).toString(),
      );
    },
    [],
  );

  const onLoad = useCallback((_data: OnLoadData) => {
    videoRef.current?.setVolume(0);
    setAllowToSave(true);
  }, []);

  const onWebcamError = useCallback((e: OnVideoErrorData) => {
    if (__DEV__) {
      console.log('On webcam error', e);
    }

    setWebcamUrl('');
    // setWebcam({
    //   webcamIP: '',
    //   username: '',
    //   password: '',
    //   syncTime: 60,
    //   outputType: OutputType.local,
    // });
    setAllowToSave(false);
  }, []);

  const sliderValueStyle: ViewStyle = useMemo(() => {
    return {
      left: `${webcam.syncTime * 1.5}%`,
    };
  }, [webcam]);

  const sliderColor = useMemo(() => {
    return webcam.syncTime <= 10
      ? colors.error
      : webcam.syncTime <= 30
      ? colors.yellow
      : colors.statusBar;
  }, [webcam]);

  return useMemo(() => {
    return {
      videoRef,
      userNameRef,
      passwordRef,
      language,
      webcam,
      liveStreamData,
      webcamUrl,
      allowToSave,
      source: {
        uri: webcamUrl,
        type: 'rtsp',
      },
      sliderValueStyle,
      sliderColor,
      onChangeIPAddress: onChangeWebcamConfig('webcamIP'),
      onChangeUsername: onChangeWebcamConfig('username'),
      onChangePassword: onChangeWebcamConfig('password'),
      onChangeSyncTime: onChangeWebcamConfig('syncTime'),
      onSelectOutputTypeLocal: onChangeWebcamConfig('outputType'),
      onSelectOutputTypeLiveStream: onChangeWebcamConfig('outputType'),
      onChangeLiveStreamConfig,
      onSubmitEditingIPAddress: onSubmitEditing(userNameRef),
      onSubmitEditingUsername: onSubmitEditing(passwordRef),
      onTest,
      onSaveConfig,
      onLoad,
      onWebcamError,
      onSaveWebcamPosition,
    };
  }, [
    language,
    webcam,
    liveStreamData,
    webcamUrl,
    allowToSave,
    sliderValueStyle,
    sliderColor,
    onChangeWebcamConfig,
    onChangeLiveStreamConfig,
    onSubmitEditing,
    onTest,
    onSaveConfig,
    onLoad,
    onWebcamError,
    onSaveWebcamPosition,
    WebcamType
  ]);
};

export default WebcamConfigViewModel;
