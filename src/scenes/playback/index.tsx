import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  View as RNView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import {showEditor, listFiles, deleteFile} from 'react-native-video-trim';
import Video from 'react-native-video';
import Slider from '@react-native-community/slider';
import {useSelector} from 'react-redux';

import images from 'assets';
import Button from 'components/Button';
import Container from 'components/Container';
import Image from 'components/Image';
import Loading from 'components/Loading';
import PoolBroadcastScoreboard from 'components/PoolBroadcastScoreboard';
import CaromBroadcastScoreboard from 'components/CaromBroadcastScoreboard';
import Text from 'components/Text';
import View from 'components/View';
import {WEBCAM_SELECTED_VIDEO_TRACK} from 'constants/webcam';
import {RootState} from 'data/redux/reducers';
import i18n from 'i18n';
import {
  buildReplayFolderPath,
  deleteReplayFolder,
  ensureArchiveFolder,
  extractReplaySegmentIndex,
  normalizeWindowsVideoUri,
  resolveReplayFolder,
} from 'services/replay/localReplay';
import {
  loadReplayScoreboardTimeline,
  type ReplayScoreboardTimelineEntry,
} from 'services/replay/replayTimeline';
import {goBack} from 'utils/navigation';
import {recordDebugLog} from 'utils/recordDebugLogger';
import {
  buildContinuousTimeline,
  mapGlobalPositionToSegment,
  type HistorySegment,
} from 'services/replay/historyTimeline';
import {isCaromGame, isPool10Game, isPool15Game, isPool9Game} from 'utils/game';
import {shouldShowMatchOverlay} from 'utils/matchOverlay';

import PlayBackWebcamViewModel, {
  PlayBackWebcamViewModelProps,
} from './PlayBackViewModel';
import createStyles from './styles';
import useDesignSystem from 'theme/useDesignSystem';
import {LanguageContext} from 'context/language';

const setReplayReturnRequestSync = (
  request: {
    matchSessionId?: string;
    webcamFolderName?: string;
    requestedAt?: number;
  } | null,
) => {
  (globalThis as any).__APLUS_REPLAY_RETURN_REQUEST__ = request
    ? JSON.parse(JSON.stringify(request))
    : null;
};

const REPLAY_RESUME_SNAPSHOT_STORAGE_KEY = '@APLUS_REPLAY_RESUME_SNAPSHOT_V3';
const PLAYBACK_NATIVE_CONTROLS_BOTTOM_INSET = 100;
const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PLAYBACK_VIDEO_RESIZE_MODE = Platform.OS === 'android' ? 'cover' : 'contain';
const HISTORY_SEGMENT_FALLBACK_DURATION_MS = 5 * 60 * 1000;

type ReplayOverlaySnapshot = {
  webcamFolderName?: string;
  matchSessionId?: string;
  currentPlayerIndex?: number;
  countdownTime?: number;
  totalTurns?: number;
  playerSettings?: any;
  isStarted?: boolean;
  isPaused?: boolean;
  isMatchPaused?: boolean;
  matchCountdownPausedBeforeReplay?: boolean;
  restoreOnNextFocus?: boolean;
  savedAt?: number;
  [key: string]: any;
};

const formatLocalReplayClipTime = (item: any) => {
  const rawTimestamp = Number(
    item?.createdAtMs ||
      item?.createdAt ||
      (item?.mtime instanceof Date ? item.mtime.getTime() : 0) ||
      (item?.ctime instanceof Date ? item.ctime.getTime() : 0) ||
      0,
  );
  const date =
    Number.isFinite(rawTimestamp) && rawTimestamp > 0
      ? new Date(rawTimestamp)
      : new Date();
  const formattedLocalTime =
    String(date.getHours()).padStart(2, '0') +
    ':' +
    String(date.getMinutes()).padStart(2, '0');
  const formattedOldWrongTime = date.toISOString().slice(11, 16);

  return {
    rawTimestamp,
    parsedDate: date,
    formattedLocalTime,
    formattedOldWrongTime,
  };
};

const getLocalTimeZoneLabel = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (_error) {
    const offsetMinutes = new Date().getTimezoneOffset();
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const absolute = Math.abs(offsetMinutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(
      absolute % 60,
    ).padStart(2, '0')}`;
  }
};

const formatLocalClockTime = (timestampMs: number) => {
  const safeTimestamp =
    Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : Date.now();
  const date = new Date(safeTimestamp);

  return (
    String(date.getHours()).padStart(2, '0') +
    ':' +
    String(date.getMinutes()).padStart(2, '0') +
    ':' +
    String(date.getSeconds()).padStart(2, '0')
  );
};

const getReplayVideoStartTimeMs = (item: any) => {
  const candidates = [
    item?.segmentStartedAt,
    item?.createdAtMs,
    item?.createdAt,
    item?.mtime instanceof Date ? item.mtime.getTime() : undefined,
    item?.ctime instanceof Date ? item.ctime.getTime() : undefined,
  ];

  for (const value of candidates) {
    const numeric = Number(value || 0);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  return Date.now();
};

const normalizePlaybackVideoUri = (inputPath?: string | null) => {
  const raw = String(inputPath || '').trim();

  if (!raw || Platform.OS !== 'windows') {
    return raw;
  }

  return normalizeWindowsVideoUri(raw);
};

const getSelectedPlaybackQualityLabel = (path?: string | null) => {
  const lower = String(path || '').toLowerCase();
  if (lower.includes('_var_last30')) {
    return 'var-clip';
  }
  if (lower.endsWith('.mp4') && !lower.includes('_playback')) {
    return 'original-quality-remux-mp4';
  }
  if (lower.endsWith('.ts')) {
    return 'original-ts';
  }
  if (lower.includes('playback_hq') || lower.includes('_playback_hq')) {
    return 'playback-hq';
  }
  if (
    lower.includes('playback_mpeg4_720') ||
    lower.includes('playback_mpeg4_1080') ||
    lower.includes('_playback')
  ) {
    return 'transcoded-fallback';
  }
  return lower.split('.').pop() || 'unknown';
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
};

const getReplayResumeSnapshotSync = (): ReplayOverlaySnapshot | null => {
  const snapshot = (globalThis as any).__APLUS_REPLAY_RESUME_SNAPSHOT__;

  if (!snapshot) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(snapshot));
  } catch (_error) {
    return snapshot;
  }
};

const setReplayResumeSnapshotSync = (snapshot: ReplayOverlaySnapshot | null) => {
  (globalThis as any).__APLUS_REPLAY_RESUME_SNAPSHOT__ = snapshot
    ? JSON.parse(JSON.stringify(snapshot))
    : null;
};

const persistReplayReturnSnapshot = async (props: PlayBackWebcamViewModelProps) => {
  const snapshot = getReplayResumeSnapshotSync();
  if (!snapshot) {
    recordDebugLog('GameplaySession', 'return-snapshot-missing-before-goBack', {
      matchSessionId: props.matchSessionId,
      webcamFolderName: props.webcamFolderName,
    });
    return;
  }

  const snapshotMatches =
    (props.matchSessionId && snapshot.matchSessionId === props.matchSessionId) ||
    (props.webcamFolderName && snapshot.webcamFolderName === props.webcamFolderName);

  if (!snapshotMatches) {
    recordDebugLog('GameplaySession', 'return-snapshot-mismatch-before-goBack', {
      routeMatchSessionId: props.matchSessionId,
      snapshotMatchSessionId: snapshot.matchSessionId,
      routeWebcamFolderName: props.webcamFolderName,
      snapshotWebcamFolderName: snapshot.webcamFolderName,
    });
    return;
  }

  const countdownPausedBeforeReplay = Boolean(
    snapshot.matchCountdownPausedBeforeReplay ?? snapshot.isMatchPaused,
  );

  const nextSnapshot: ReplayOverlaySnapshot = {
    ...snapshot,
    isStarted: snapshot.isStarted !== false,
    isPaused: true,
    isMatchPaused: countdownPausedBeforeReplay,
    matchCountdownPausedBeforeReplay: countdownPausedBeforeReplay,
    restoreOnNextFocus: true,
    savedAt: Date.now(),
  };

  setReplayResumeSnapshotSync(nextSnapshot);
  try {
    await AsyncStorage.setItem(
      REPLAY_RESUME_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(nextSnapshot),
    );
  } catch (error) {
    console.log('[Replay] persist return snapshot failed:', error);
  }

  recordDebugLog('GameplaySession', 'return-snapshot-armed-before-goBack', {
    matchSessionId: nextSnapshot.matchSessionId,
    webcamFolderName: nextSnapshot.webcamFolderName,
    isStarted: nextSnapshot.isStarted,
    isPaused: nextSnapshot.isPaused,
    isMatchPaused: nextSnapshot.isMatchPaused,
    matchCountdownPausedBeforeReplay: nextSnapshot.matchCountdownPausedBeforeReplay,
    restoreOnNextFocus: nextSnapshot.restoreOnNextFocus,
  });
};

const PlayBackWebcam = (props: PlayBackWebcamViewModelProps) => {
  const {language} = useContext(LanguageContext);
  const viewModel = PlayBackWebcamViewModel(props);
  const {adaptive, design} = useDesignSystem();
  const styles = useMemo(
    () => createStyles(adaptive, design),
    [adaptive.styleKey, design],
  );
  const {gameSettings} = useSelector((state: RootState) => state.game);

  const [folder, setFolder] = useState<string>(
    buildReplayFolderPath(props.webcamFolderName),
  );
  const [replaySnapshot, setReplaySnapshot] =
    useState<ReplayOverlaySnapshot | null>(null);
  const [scoreboardTimeline, setScoreboardTimeline] = useState<
    ReplayScoreboardTimelineEntry[]
  >([]);
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState(0);
  const [scoreboardPlaybackTime, setScoreboardPlaybackTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const pausedBeforeSeekRef = useRef(false);
  const overlayAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressLogRef = useRef<{currentTime: number; wallTime: number} | null>(null);
  const lastProgressUiUpdateRef = useRef(0);
  const lastScoreboardUiUpdateRef = useRef(0);
  const lastSeekChangeLogRef = useRef<{position: number; wallTime: number} | null>(null);
  const lastSeekCompletedAtRef = useRef(0);
  const pendingHistorySeekRef = useRef<{
    path: string;
    localSeconds: number;
    globalSeconds: number;
    keepPaused: boolean;
  } | null>(null);
  const lastHistoryPlaybackLogRef = useRef(0);


  const loadReplaySnapshot = useCallback(async () => {
    const runtimeSnapshot = getReplayResumeSnapshotSync();

    if (runtimeSnapshot?.webcamFolderName === props.webcamFolderName) {
      setReplaySnapshot(runtimeSnapshot);
      return;
    }

    try {
      const rawSnapshot = await AsyncStorage.getItem(
        REPLAY_RESUME_SNAPSHOT_STORAGE_KEY,
      );

      if (!rawSnapshot) {
        setReplaySnapshot(null);
        return;
      }

      const parsedSnapshot = JSON.parse(rawSnapshot) as ReplayOverlaySnapshot;
      setReplaySnapshot(
        parsedSnapshot?.webcamFolderName === props.webcamFolderName
          ? parsedSnapshot
          : null,
      );
    } catch (error) {
      console.log('[Playback] load replay snapshot error:', error);
      setReplaySnapshot(null);
    }
  }, [props.webcamFolderName]);

  const loadScoreboardTimeline = useCallback(async () => {
    try {
      const timeline = await loadReplayScoreboardTimeline(
        props.webcamFolderName,
      );
      const entries = timeline?.entries || [];
      setScoreboardTimeline(entries);
      console.log(
        props.returnToMatch ? '[ReplayOverlaySync]' : '[HistoryOverlaySync]',
        {
          event: 'timelineLoadedForPlayback',
          webcamFolderName: props.webcamFolderName,
          overlayTimelineEventsCount: entries.length,
          usingLiveState: false,
        },
      );
    } catch (error) {
      console.log('[Playback] load scoreboard timeline error:', error);
      setScoreboardTimeline([]);
    }
  }, [props.webcamFolderName]);

  useEffect(() => {
    loadScoreboardTimeline();
  }, [loadScoreboardTimeline]);

  useEffect(() => {
    if (props.returnToMatch) {
      setPlaybackCurrentTime(0);
      setScoreboardPlaybackTime(0);
    }
    lastProgressLogRef.current = null;
    lastProgressUiUpdateRef.current = 0;
    lastScoreboardUiUpdateRef.current = 0;
  }, [props.returnToMatch, viewModel.currentIndex]);

  const handlePlaybackRateChange = useCallback(
    (nextRate: number) => {
      const appliedRate = PLAYBACK_RATE_OPTIONS.includes(nextRate)
        ? nextRate
        : 1;
      setPlaybackRate(appliedRate);

      const payload = {
        event: 'speed-changed',
        requestedRate: nextRate,
        appliedRate,
        minRate: PLAYBACK_RATE_OPTIONS[0],
        maxRate: PLAYBACK_RATE_OPTIONS[PLAYBACK_RATE_OPTIONS.length - 1],
        sourceType: props.returnToMatch ? 'replay' : 'history',
        player:
          Platform.OS === 'android'
            ? 'react-native-video/ExoPlayer'
            : 'react-native-video',
      };

      console.log('[PlaybackRate]', payload);
      recordDebugLog('ReplayOverlay', 'control-press', {
        type: 'speed',
        ...payload,
      });
    },
    [props.returnToMatch],
  );

  useEffect(() => {
    resolveReplayFolder(props.webcamFolderName).then(path => {
      if (path) {
        setFolder(path);
      }
    });
  }, [props.webcamFolderName]);

  useEffect(() => {
    loadReplaySnapshot();
  }, [loadReplaySnapshot]);

  useEffect(() => {
    if (!props.returnToMatch) {
      return;
    }
    const mountedAt = Date.now();
    recordDebugLog('VARLatency', 'playback-screen-mounted', {
      t: mountedAt,
      replayClickAt: props.replayClickAt,
      replayClickToMountedMs: props.replayClickAt
        ? mountedAt - Number(props.replayClickAt)
        : undefined,
      webcamFolderName: props.webcamFolderName,
      matchSessionId: props.matchSessionId,
    });
  }, [props.matchSessionId, props.replayClickAt, props.returnToMatch, props.webcamFolderName]);

  useEffect(() => {
    return () => {
      try {
        viewModel.videoRef.current?.pause?.();
        viewModel.videoRef.current?.stop?.();
        console.log('[VideoPlaybackControl]', {
          action: 'close',
          targetVideoPath: currentVideoPath,
          playerId: playerKey,
          pausedState: true,
          nativePauseCalled: true,
          nativeStopCalled: true,
          audioMuted: true,
          activePlayerCountAfterAction: 0,
        });
        console.log('[SingleActivePlayer]', {
          requestedOpenVideo: null,
          previousPlayerExists: true,
          previousPlayerPaused: true,
          previousPlayerStopped: true,
          previousPlayerUnmounted: true,
          nextPlayerMounted: false,
          activePlayerCount: 0,
        });
      } catch (_error) {
        // ignore cleanup errors
      }
    };
  }, [viewModel.videoRef]);

  const onBackToMatch = async () => {
    try {
      viewModel.videoRef.current?.pause?.();
      viewModel.videoRef.current?.stop?.();
      console.log('[VideoPlaybackControl]', {
        action: 'close',
        targetVideoPath: currentVideoPath,
        playerId: playerKey,
        pausedState: true,
        nativePauseCalled: true,
        nativeStopCalled: true,
        audioMuted: true,
        activePlayerCountAfterAction: 0,
      });
      console.log('[SingleActivePlayer]', {
        requestedOpenVideo: null,
        previousPlayerExists: true,
        previousPlayerPaused: true,
        previousPlayerStopped: true,
        previousPlayerUnmounted: true,
        nextPlayerMounted: false,
        activePlayerCount: 0,
      });
    } catch (_error) {
      // bỏ qua lỗi dọn dẹp playback
    }

    if (props.returnToMatch) {
      setReplayReturnRequestSync({
        matchSessionId: props.matchSessionId,
        webcamFolderName: props.webcamFolderName,
        requestedAt: Date.now(),
      });
      await persistReplayReturnSnapshot(props);

      if (Platform.OS === 'windows') {
        try {
          await deleteReplayFolder(props.webcamFolderName, {
            includeArchive: false,
          });
        } catch (cleanupError) {
          console.log('[Replay] cleanup temp fail', cleanupError);
        }
      }
    }

    goBack();
  };

  const WEBCAM_LOADER = useMemo(() => {
    return (
      <View
        flex={'1'}
        style={styles.fullWidth}
        alignItems={'center'}
        justify={'center'}>
        <Loading isLoading size={'large'} showPlainLoading />
      </View>
    );
  }, []);

  const onPress = (index: number, path: string) => {
    const previousPath = currentVideoPath;
    const previousPlayerExists = Boolean(previousPath);

    try {
      viewModel.videoRef.current?.pause?.();
      viewModel.videoRef.current?.stop?.();
    } catch (error) {
      console.log('[VideoPlaybackControl]', {
        action: 'switch',
        targetVideoPath: previousPath,
        nativePauseCalled: false,
        nativeStopCalled: false,
        activePlayerCountAfterAction: previousPlayerExists ? 1 : 0,
        error,
      });
    }

    console.log('[SingleActivePlayer]', {
      requestedOpenVideo: path,
      previousPlayerExists,
      previousPlayerPaused: previousPlayerExists,
      previousPlayerStopped: previousPlayerExists,
      previousPlayerUnmounted: previousPlayerExists,
      nextPlayerMounted: true,
      activePlayerCount: 1,
    });
    console.log('[VideoPlaybackControl]', {
      action: 'switch',
      targetVideoPath: path,
      playerId: `playback-${index}-${path}`,
      pausedState: false,
      nativePauseCalled: previousPlayerExists,
      nativeStopCalled: previousPlayerExists,
      audioMuted: false,
      activePlayerCountAfterAction: 1,
    });

    setPlaybackCurrentTime(0);
    setPlayerReady(false);
    setPlayerError(null);
    setPlaybackPaused(false);
    viewModel.setIsPlaying(true);
    viewModel.setCurrentIndex(index);
  };

  const currentVideoFile = viewModel.videoFiles?.[viewModel.currentIndex] as any;

  const currentVideoPath = currentVideoFile?.path || '';

  const currentVideoUri = useMemo(
    () => normalizePlaybackVideoUri(currentVideoPath),
    [currentVideoPath],
  );

  const videoSource = useMemo(
    () => ({uri: currentVideoUri}),
    [currentVideoUri],
  );

  const playerKey = useMemo(
    () =>
      `playback-${props.returnToMatch ? 'replay' : 'history'}-${viewModel.currentIndex}-${currentVideoPath}`,
    [currentVideoPath, props.returnToMatch, viewModel.currentIndex],
  );

  const currentVideoDuration = viewModel.videoDurations[currentVideoPath] || 0;
  const currentVideoContainer = String(
    currentVideoFile?.smoothPlaybackContainerType ||
      currentVideoFile?.playbackContainerType ||
      currentVideoFile?.containerType ||
      currentVideoPath.split('.').pop() ||
      'unknown',
  ).toLowerCase();

  const currentClipDisplay = useMemo(
    () =>
      formatLocalReplayClipTime(viewModel.videoFiles?.[viewModel.currentIndex]),
    [viewModel.currentIndex, viewModel.videoFiles],
  );

  const currentVideoStartTimeMs = useMemo(
    () =>
      getReplayVideoStartTimeMs(viewModel.videoFiles?.[viewModel.currentIndex]),
    [viewModel.currentIndex, viewModel.videoFiles],
  );

  const safePlaybackCurrentTime = Math.max(0, Number(playbackCurrentTime || 0));
  const safeVideoDuration = Math.max(0, Number(currentVideoDuration || 0));
  const isVarReplayMode = Boolean(props.returnToMatch);
  const isHistoryPlaybackMode = !isVarReplayMode && !props.videoUri;

  const historyTimeline = useMemo(() => {
    const segments = viewModel.videoFiles.map((file: any, playlistIndex) => {
      const manifestIndex = Number(file?.segmentIndex);
      const parsedIndex = extractReplaySegmentIndex(file?.name || file?.path);
      const index = Number.isFinite(manifestIndex) && manifestIndex >= 0
        ? manifestIndex
        : typeof parsedIndex === 'number'
          ? parsedIndex
          : playlistIndex;
      const durationMs = Math.max(
        0,
        Math.round(
          Number(
            (viewModel.videoDurations[file?.path] || 0) * 1000 ||
              Number(file?.durationSeconds || 0) * 1000 ||
              HISTORY_SEGMENT_FALLBACK_DURATION_MS,
          ),
        ),
      );

      return {
        index,
        path: file?.path || '',
        durationMs,
        startedAt: Number(file?.segmentStartedAt || file?.createdAtMs || 0) || undefined,
        endedAt: durationMs > 0
          ? (Number(file?.segmentStartedAt || file?.createdAtMs || 0) || 0) + durationMs
          : undefined,
        size: Number(file?.size || 0) || undefined,
      } as HistorySegment;
    });

    return buildContinuousTimeline(segments);
  }, [viewModel.videoDurations, viewModel.videoFiles]);

  const currentTimelineSegment = useMemo(() => {
    if (!isHistoryPlaybackMode || !currentVideoPath) {
      return undefined;
    }

    return historyTimeline.segments.find(segment => segment.path === currentVideoPath);
  }, [currentVideoPath, historyTimeline.segments, isHistoryPlaybackMode]);

  const currentSegmentGlobalStartSeconds =
    Number(currentTimelineSegment?.globalStartMs || 0) / 1000;
  const currentLocalPlaybackTime = isHistoryPlaybackMode
    ? clampNumber(
        safePlaybackCurrentTime - currentSegmentGlobalStartSeconds,
        0,
        safeVideoDuration || Math.max(0, Number(currentTimelineSegment?.durationMs || 0) / 1000),
      )
    : safePlaybackCurrentTime;
  const historyTotalDurationSeconds = Math.max(
    0,
    Number(historyTimeline.totalDurationMs || 0) / 1000,
  );

  const varClipStartTime =
    isVarReplayMode && safeVideoDuration > 30
      ? Math.max(0, safeVideoDuration - 30)
      : 0;
  const varClipEndTime = isVarReplayMode ? safeVideoDuration : safeVideoDuration;
  const visibleClipDuration = isVarReplayMode
    ? Math.max(0, varClipEndTime - varClipStartTime)
    : isHistoryPlaybackMode
      ? historyTotalDurationSeconds
      : safeVideoDuration;
  const sliderPlaybackTime = isVarReplayMode
    ? clampNumber(
        safePlaybackCurrentTime - varClipStartTime,
        0,
        Math.max(visibleClipDuration, 0),
      )
    : isHistoryPlaybackMode
      ? clampNumber(safePlaybackCurrentTime, 0, Math.max(visibleClipDuration, 0))
      : safePlaybackCurrentTime;
  const historyTimelineStartTimeMs =
    Number(historyTimeline.segments?.[0]?.startedAt || 0) || currentVideoStartTimeMs;
  const currentRealTimeLabel = formatLocalClockTime(
    isHistoryPlaybackMode
      ? historyTimelineStartTimeMs + safePlaybackCurrentTime * 1000
      : currentVideoStartTimeMs + safePlaybackCurrentTime * 1000,
  );
  const endRealTimeLabel = formatLocalClockTime(
    isHistoryPlaybackMode
      ? historyTimelineStartTimeMs + historyTotalDurationSeconds * 1000
      : currentVideoStartTimeMs + varClipEndTime * 1000,
  );

  useEffect(() => {
    if (!isHistoryPlaybackMode || !viewModel.videoFiles.length) {
      return;
    }

    recordDebugLog('HistoryPlayback', 'build-timeline-start', {
      folder: viewModel.resolvedFolder,
      webcamFolderName: props.webcamFolderName,
    });
    recordDebugLog('HistoryPlayback', 'segment-count', {
      count: historyTimeline.segments.length,
    });
    historyTimeline.segments.forEach(segment => {
      recordDebugLog('HistoryPlayback', 'segment', {
        index: segment.index,
        path: segment.path,
        durationMs: segment.durationMs,
        globalStartMs: segment.globalStartMs,
        globalEndMs: segment.globalEndMs,
        startedAt: segment.startedAt,
        size: segment.size,
      });
    });
    recordDebugLog('HistoryPlayback', 'total-durationMs', {
      totalDurationMs: historyTimeline.totalDurationMs,
    });
  }, [
    historyTimeline.segments,
    historyTimeline.totalDurationMs,
    isHistoryPlaybackMode,
    props.webcamFolderName,
    viewModel.resolvedFolder,
    viewModel.videoFiles.length,
  ]);

  useEffect(() => {
    if (!isHistoryPlaybackMode || !currentTimelineSegment) {
      return;
    }

    setPlaybackCurrentTime(currentTimelineSegment.globalStartMs / 1000);
    setScoreboardPlaybackTime(0);
  }, [currentTimelineSegment?.path, isHistoryPlaybackMode]);

  const clearOverlayAutoHideTimer = useCallback(() => {
    if (overlayAutoHideTimerRef.current) {
      clearTimeout(overlayAutoHideTimerRef.current);
      overlayAutoHideTimerRef.current = null;
    }
  }, []);

  const scheduleOverlayAutoHide = useCallback(
    (source: string) => {
      clearOverlayAutoHideTimer();
      if (playbackPaused || isSeeking) {
        return;
      }

      overlayAutoHideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
        recordDebugLog('ReplayOverlay', 'toggle', {
          visible: false,
          source: `auto-hide:${source}`,
          path: currentVideoPath,
          position: playbackCurrentTime,
        });
      }, 4500);
    },
    [
      clearOverlayAutoHideTimer,
      currentVideoPath,
      isSeeking,
      playbackCurrentTime,
      playbackPaused,
    ],
  );

  useEffect(() => {
    if (controlsVisible) {
      scheduleOverlayAutoHide('visible-state');
    } else {
      clearOverlayAutoHideTimer();
    }

    return clearOverlayAutoHideTimer;
  }, [clearOverlayAutoHideTimer, controlsVisible, scheduleOverlayAutoHide]);

  const togglePlaybackControls = useCallback(() => {
    setControlsVisible(visible => {
      const nextVisible = !visible;
      const payload = {
        visible: nextVisible,
        source: 'video-tap',
        videoPath: currentVideoPath,
        currentPosition: playbackCurrentTime,
      };
      console.log('[ReplayControls]', {
        event: 'toggle-overlay',
        ...payload,
      });
      recordDebugLog('ReplayOverlay', 'toggle', payload);
      return nextVisible;
    });
  }, [currentVideoPath, playbackCurrentTime]);

  const togglePlaybackPause = useCallback(() => {
    setControlsVisible(true);
    clearOverlayAutoHideTimer();
    setPlaybackPaused(paused => {
      let nextPaused = !paused;
      let nextPosition = playbackCurrentTime;

      if (
        paused &&
        safeVideoDuration > 0 &&
        playbackCurrentTime >= varClipEndTime - 0.35
      ) {
        nextPosition = varClipStartTime;
        try {
          viewModel.videoRef.current?.seek?.(varClipStartTime);
        } catch {}
        setPlaybackCurrentTime(varClipStartTime);
        setScoreboardPlaybackTime(varClipStartTime);
      }

      viewModel.setIsPlaying(!nextPaused);
      const payload = {
        type: 'play-pause',
        action: nextPaused ? 'pause' : 'play',
        videoPath: currentVideoPath,
        currentPosition: nextPosition,
        playbackRate,
      };
      console.log('[ReplayControls]', {
        event: payload.type,
        ...payload,
      });
      recordDebugLog('ReplayOverlay', 'control-press', payload);
      return nextPaused;
    });
  }, [
    clearOverlayAutoHideTimer,
    currentVideoPath,
    playbackCurrentTime,
    playbackRate,
    safeVideoDuration,
    varClipEndTime,
    varClipStartTime,
    viewModel,
  ]);

  const handleSeekStart = useCallback(() => {
    pausedBeforeSeekRef.current = playbackPaused;
    clearOverlayAutoHideTimer();
    setControlsVisible(true);
    setIsSeeking(true);
    setPlaybackPaused(true);
    const payload = {
      position: isVarReplayMode ? sliderPlaybackTime : safePlaybackCurrentTime,
      absolutePosition: safePlaybackCurrentTime,
      clipStart: varClipStartTime,
      clipEnd: isHistoryPlaybackMode ? historyTotalDurationSeconds : varClipEndTime,
      mode: isVarReplayMode ? 'var' : 'history',
      videoPath: currentVideoPath,
    };
    console.log('[ReplayControls]', {event: 'seek-start', ...payload});
    recordDebugLog('ReplayOverlay', 'seek-start', payload);
    recordDebugLog('ReplayOverlay', 'control-press', {
      type: 'seek',
      phase: 'start',
      ...payload,
    });
  }, [
    clearOverlayAutoHideTimer,
    currentVideoPath,
    isVarReplayMode,
    historyTotalDurationSeconds,
    isHistoryPlaybackMode,
    playbackCurrentTime,
    playbackPaused,
    safePlaybackCurrentTime,
    sliderPlaybackTime,
    varClipEndTime,
    varClipStartTime,
  ]);

  const handleSeekChange = useCallback(
    (position: number) => {
      const sliderPosition = clampNumber(
        Number(position || 0),
        0,
        Math.max(visibleClipDuration, 0) || Number(position || 0),
      );
      const target = isVarReplayMode
        ? clampNumber(varClipStartTime + sliderPosition, varClipStartTime, varClipEndTime)
        : isHistoryPlaybackMode
          ? clampNumber(sliderPosition, 0, historyTotalDurationSeconds || sliderPosition)
          : clampNumber(sliderPosition, 0, safeVideoDuration || sliderPosition);
      setPlaybackCurrentTime(target);
      if (isHistoryPlaybackMode) {
        const mapped = mapGlobalPositionToSegment(
          historyTimeline.segments,
          target * 1000,
        );
        setScoreboardPlaybackTime(Number(mapped?.localPositionMs || 0) / 1000);
      } else {
        setScoreboardPlaybackTime(target);
      }

      const now = Date.now();
      const last = lastSeekChangeLogRef.current;
      if (
        !last ||
        now - last.wallTime >= 350 ||
        Math.abs(target - last.position) >= 3
      ) {
        lastSeekChangeLogRef.current = {position: target, wallTime: now};
        recordDebugLog('ReplayOverlay', 'seek-change', {
          position: sliderPosition,
          absolutePosition: target,
          clipStart: varClipStartTime,
          clipEnd: isHistoryPlaybackMode ? historyTotalDurationSeconds : varClipEndTime,
          mode: isVarReplayMode ? 'var' : 'history',
          videoPath: currentVideoPath,
        });
      }
    },
    [
      currentVideoPath,
      historyTimeline.segments,
      historyTotalDurationSeconds,
      isHistoryPlaybackMode,
      isVarReplayMode,
      safeVideoDuration,
      varClipEndTime,
      varClipStartTime,
      visibleClipDuration,
    ],
  );

  const handleSeekComplete = useCallback(
    (position: number) => {
      const sliderPosition = clampNumber(
        Number(position || 0),
        0,
        Math.max(visibleClipDuration, 0) || Number(position || 0),
      );
      const target = isVarReplayMode
        ? clampNumber(varClipStartTime + sliderPosition, varClipStartTime, varClipEndTime)
        : isHistoryPlaybackMode
          ? clampNumber(sliderPosition, 0, historyTotalDurationSeconds || sliderPosition)
          : clampNumber(sliderPosition, 0, safeVideoDuration || sliderPosition);

      let localSeekSeconds = target;
      let mappedSegmentIndex: number | undefined;
      let mappedPath = currentVideoPath;

      if (isHistoryPlaybackMode) {
        recordDebugLog('HistoryPlayback', 'global-seek-request', {
          globalMs: Math.round(target * 1000),
          totalDurationMs: historyTimeline.totalDurationMs,
        });
        const mapped = mapGlobalPositionToSegment(
          historyTimeline.segments,
          target * 1000,
        );

        if (mapped) {
          localSeekSeconds = Math.max(0, mapped.localPositionMs / 1000);
          mappedSegmentIndex = mapped.segmentIndex;
          mappedPath = mapped.segment.path;
          recordDebugLog('HistoryPlayback', 'mapped-to-segment', {
            index: mappedSegmentIndex,
            path: mappedPath,
            localMs: Math.round(mapped.localPositionMs),
            globalMs: Math.round(target * 1000),
          });

          const targetFileIndex = viewModel.videoFiles.findIndex(
            (file: any) => file?.path === mappedPath,
          );

          if (targetFileIndex >= 0 && targetFileIndex !== viewModel.currentIndex) {
            pendingHistorySeekRef.current = {
              path: mappedPath,
              localSeconds: localSeekSeconds,
              globalSeconds: target,
              keepPaused: pausedBeforeSeekRef.current,
            };
            setPlayerReady(false);
            setPlaybackPaused(true);
            viewModel.setCurrentIndex(targetFileIndex);
          } else {
            try {
              viewModel.videoRef.current?.seek?.(localSeekSeconds);
              lastSeekCompletedAtRef.current = Date.now();
            } catch (error) {
              console.log('[ReplayControls]', {
                event: 'seek-error',
                videoPath: currentVideoPath,
                target,
                localSeekSeconds,
                error,
              });
            }
          }
        }
      } else {
        try {
          viewModel.videoRef.current?.seek?.(localSeekSeconds);
          lastSeekCompletedAtRef.current = Date.now();
        } catch (error) {
          console.log('[ReplayControls]', {
            event: 'seek-error',
            videoPath: currentVideoPath,
            target,
            error,
          });
        }
      }

      setPlaybackCurrentTime(target);
      setScoreboardPlaybackTime(localSeekSeconds);
      lastSeekChangeLogRef.current = null;
      setIsSeeking(false);
      setPlaybackPaused(pausedBeforeSeekRef.current);
      viewModel.setIsPlaying(!pausedBeforeSeekRef.current);
      const payload = {
        position: isVarReplayMode ? sliderPosition : target,
        absolutePosition: target,
        localPosition: localSeekSeconds,
        mappedSegmentIndex,
        clipStart: varClipStartTime,
        clipEnd: isHistoryPlaybackMode ? historyTotalDurationSeconds : varClipEndTime,
        mode: isVarReplayMode ? 'var' : 'history',
        videoPath: mappedPath,
        realTime: formatLocalClockTime(
          isHistoryPlaybackMode
            ? historyTimelineStartTimeMs + target * 1000
            : currentVideoStartTimeMs + target * 1000,
        ),
        keepPaused: pausedBeforeSeekRef.current,
      };
      console.log('[ReplayControls]', {event: 'seek-complete', ...payload});
      recordDebugLog('ReplayOverlay', 'seek-complete', payload);
      recordDebugLog('ReplayOverlay', 'control-press', {
        type: 'seek',
        phase: 'complete',
        ...payload,
      });
      if (isHistoryPlaybackMode) {
        recordDebugLog('HistoryPlayback', 'seek-complete', {
          globalMs: Math.round(target * 1000),
          segmentIndex: mappedSegmentIndex,
          localMs: Math.round(localSeekSeconds * 1000),
        });
      }
      if (!pausedBeforeSeekRef.current) {
        scheduleOverlayAutoHide('seek-complete');
      }
    },
    [
      currentVideoPath,
      currentVideoStartTimeMs,
      historyTimeline.segments,
      historyTimeline.totalDurationMs,
      historyTimelineStartTimeMs,
      historyTotalDurationSeconds,
      isHistoryPlaybackMode,
      isVarReplayMode,
      safeVideoDuration,
      scheduleOverlayAutoHide,
      varClipEndTime,
      varClipStartTime,
      visibleClipDuration,
      viewModel,
    ],
  );


  useEffect(() => {
    console.log('[ReplayScreen]', {
      event: 'opened',
      sourceType: props.returnToMatch ? 'replay' : 'history',
      matchSessionId: props.matchSessionId,
      webcamFolderName: props.webcamFolderName,
      recordingId: props.webcamFolderName,
      directVideoUri: props.videoUri,
      filesCount: viewModel.videoFiles.length,
      selectedIndex: viewModel.currentIndex,
      selectedPath: currentVideoPath,
      selectedQuality: getSelectedPlaybackQualityLabel(currentVideoPath),
      playbackMode: props.returnToMatch ? 'var' : 'history-full',
      realStartTime: formatLocalClockTime(currentVideoStartTimeMs),
      localTimezone: getLocalTimeZoneLabel(),
    });
  }, [
    currentVideoPath,
    currentVideoStartTimeMs,
    props.matchSessionId,
    props.returnToMatch,
    props.videoUri,
    props.webcamFolderName,
    viewModel.currentIndex,
    viewModel.videoFiles.length,
  ]);

  useEffect(() => {
    if (!viewModel.videoFiles.length) {
      return;
    }

    console.log('[ReplayClipSelector]', {
      clipsCount: viewModel.videoFiles.length,
      selectedClipIndex: viewModel.currentIndex,
      selectedClipPath: currentVideoPath,
      selectedClipDisplayTime: currentClipDisplay.formattedLocalTime,
    });
    console.log('[ReplayTimeFormat]', {
      rawTimestamp: currentClipDisplay.rawTimestamp,
      parsedDate: currentClipDisplay.parsedDate.toString(),
      timezoneOffsetMinutes: currentClipDisplay.parsedDate.getTimezoneOffset(),
      formattedLocalTime: currentClipDisplay.formattedLocalTime,
      formattedOldWrongTime: currentClipDisplay.formattedOldWrongTime,
      source: (viewModel.videoFiles?.[viewModel.currentIndex] as any)
        ?.createdAtMs
        ? 'createdAtMs'
        : 'mtime',
    });
  }, [
    currentClipDisplay,
    currentVideoPath,
    viewModel.currentIndex,
    viewModel.videoFiles,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'windows' || !currentVideoPath) {
      return;
    }

    const logPlayerState = async () => {
      let existsBeforePlay = false;
      let sizeBeforePlay = 0;

      try {
        existsBeforePlay = await RNFS.exists(currentVideoPath);
        if (existsBeforePlay) {
          const stat = await RNFS.stat(currentVideoPath);
          sizeBeforePlay = Number(stat?.size || 0);
        }
      } catch (error) {
        console.log('[ReplayPlayer]', {
          event: 'stat-failed',
          requestedPath: currentVideoPath,
          normalizedUri: currentVideoUri,
          playerSource: props.returnToMatch ? 'Replay' : 'History',
          playerKey,
          error,
        });
      }

      console.log('[ReplayPlayer]', {
        requestedPath: currentVideoPath,
        normalizedUri: currentVideoUri,
        existsBeforePlay,
        sizeBeforePlay,
        playerSource: props.returnToMatch ? 'Replay' : 'History',
        playerKey,
      });

      if (!existsBeforePlay || sizeBeforePlay <= 0) {
        console.log('[ReplayPlayer]', {
          event: 'player-not-ready',
          reason: !existsBeforePlay ? 'file chưa tồn tại' : 'file size = 0',
          requestedPath: currentVideoPath,
          normalizedUri: currentVideoUri,
          playerSource: props.returnToMatch ? 'Replay' : 'History',
          playerKey,
        });
      }
    };

    logPlayerState();
  }, [currentVideoPath, currentVideoUri, props.returnToMatch, playerKey]);

  useEffect(() => {
    if (!currentVideoPath) {
      return;
    }

    console.log('[VideoFreezeGuard]', {
      action: 'openPlayer',
      reason: 'watch player load/error timeout',
      asyncOperationStarted: true,
      playerKey,
    });

    const timer = setTimeout(() => {
      console.log('[VideoFreezeGuard]', {
        action: 'playerWatchdog',
        reason:
          'no onLoad/onError within timeout; pause player to keep UI responsive',
        preventedFreeze: true,
        playerKey,
        requestedPath: currentVideoPath,
      });
      console.log('[VideoPlayerFreezeGuard]', {
        action: 'timeoutLogOnly',
        reason:
          'player still mounted; do not pause automatically because native playback may be active',
        playerKey,
      });
    }, 10000);

    return () => clearTimeout(timer);
  }, [currentVideoPath, playerKey]);

  const getFileName = (filePath: string) => {
    return filePath.split('/').pop();
  };

  useEffect(() => {
    const videoTrimModule = NativeModules.VideoTrim;
    const supportsNativeEventEmitter = !!(
      videoTrimModule &&
      typeof videoTrimModule.addListener === 'function' &&
      typeof videoTrimModule.removeListeners === 'function'
    );

    const eventSource = supportsNativeEventEmitter
      ? new NativeEventEmitter(videoTrimModule)
      : DeviceEventEmitter;

    const subscription = eventSource.addListener('VideoTrim', async event => {
      switch (event.name) {
        case 'onLoad':
        case 'onShow':
        case 'onHide':
        case 'onStartTrimming':
        case 'onCancelTrimming':
        case 'onCancel':
        case 'onError':
        case 'onLog':
        case 'onStatistics':
          console.log(event.name, event);
          break;
        case 'onFinishTrimming': {
          const files = await listFiles();
          const archiveFolder = await ensureArchiveFolder(
            props.webcamFolderName,
          );

          for (let index = 0; index < files.length; index += 1) {
            try {
              const fileName = getFileName(files[index]);
              const exportPath = `${archiveFolder}/${Date.now()}_${fileName}`;
              await RNFS.moveFile(files[index], exportPath);
              await deleteFile(files[index]);
            } catch (error) {
              console.error('Error saving video:', error);
            }
          }

          viewModel.loadFiles();
          break;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [folder, viewModel.loadFiles]);

  const timelineBySegment = useMemo(() => {
    const grouped = new Map<number, ReplayScoreboardTimelineEntry[]>();

    for (const entry of scoreboardTimeline) {
      const list = grouped.get(entry.segmentIndex) || [];
      list.push(entry);
      grouped.set(entry.segmentIndex, list);
    }

    return grouped;
  }, [scoreboardTimeline]);

  const findTimelineEntryForPlayback = useCallback(() => {
    const currentSegmentEntries =
      timelineBySegment.get(viewModel.currentSegmentNumber) || [];

    if (!currentSegmentEntries.length) {
      return null;
    }

    const safeCurrentTime = Math.max(
      0,
      Number((props.returnToMatch ? playbackCurrentTime : currentLocalPlaybackTime) || 0),
    );
    let left = 0;
    let right = currentSegmentEntries.length - 1;
    let matchedIndex = 0;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      const middleTime = Number(
        currentSegmentEntries[middle]?.segmentTime || 0,
      );

      if (middleTime <= safeCurrentTime + 0.15) {
        matchedIndex = middle;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    return currentSegmentEntries[matchedIndex] || null;
  }, [
    currentLocalPlaybackTime,
    playbackCurrentTime,
    props.returnToMatch,
    scoreboardPlaybackTime,
    timelineBySegment,
    viewModel.currentSegmentNumber,
  ]);

  const renderPlaybackLogoOverlay = useCallback(() => null, []);

  const activeTimelineEntry = useMemo(() => {
    return findTimelineEntryForPlayback();
  }, [findTimelineEntryForPlayback]);

  const lastOverlaySyncLogRef = useRef('');

  useEffect(() => {
    const logKey = JSON.stringify({
      source: props.returnToMatch ? 'Replay' : 'History',
      path: currentVideoPath,
      segment: viewModel.currentSegmentNumber,
      time: Math.floor(Number(playbackCurrentTime || 0) * 2) / 2,
      eventTime: activeTimelineEntry?.segmentTime,
      scoreAt: activeTimelineEntry?.savedAt,
    });

    if (lastOverlaySyncLogRef.current === logKey) {
      return;
    }

    lastOverlaySyncLogRef.current = logKey;

    const tag = props.returnToMatch
      ? '[ReplayOverlaySync]'
      : '[HistoryOverlaySync]';
    console.log(tag, {
      replayVideoPath: props.returnToMatch ? currentVideoPath : undefined,
      historyVideoPath: props.returnToMatch ? undefined : currentVideoPath,
      historyDurationMs: props.returnToMatch
        ? undefined
        : Math.round((currentVideoDuration || 0) * 1000),
      replayStartMatchElapsedMs: undefined,
      replayDurationMs: props.returnToMatch
        ? Math.round((currentVideoDuration || 0) * 1000)
        : undefined,
      playerCurrentTimeMs: Math.round(Number(playbackCurrentTime || 0) * 1000),
      overlayLookupTimeMs: Math.round(Number(playbackCurrentTime || 0) * 1000),
      selectedOverlayEventTimeMs: activeTimelineEntry
        ? Math.round(Number(activeTimelineEntry.segmentTime || 0) * 1000)
        : undefined,
      selectedScoreSnapshot: activeTimelineEntry
        ? {
            currentPlayerIndex: activeTimelineEntry.currentPlayerIndex,
            countdownTime: activeTimelineEntry.countdownTime,
            totalTurns: activeTimelineEntry.totalTurns,
          }
        : undefined,
      overlayTimelineEventsCount: scoreboardTimeline.length,
      usingLiveState: false,
    });

    const selectedScore =
      activeTimelineEntry?.playerSettings?.playingPlayers?.map((player: any) =>
        Number(player?.totalPoint || player?.point || 0),
      );

    console.log('[PlaybackOverlaySync]', {
      sourceType: props.returnToMatch ? 'replay' : 'history',
      videoPath: currentVideoPath,
      playerCurrentTimeMs: Math.round(Number(playbackCurrentTime || 0) * 1000),
      playbackPaused: false,
      playbackSeeking: false,
      overlayLookupTimeMs: Math.round(Number(playbackCurrentTime || 0) * 1000),
      selectedSnapshotTimeMs: activeTimelineEntry
        ? Math.round(Number(activeTimelineEntry.segmentTime || 0) * 1000)
        : undefined,
      selectedScore,
      usingLiveState: false,
    });
  }, [
    activeTimelineEntry,
    currentVideoDuration,
    currentVideoPath,
    playbackCurrentTime,
    props.returnToMatch,
    scoreboardTimeline.length,
    viewModel.currentSegmentNumber,
  ]);

  const playbackScoreboardProps = useMemo(() => {
    const timelineEntry = activeTimelineEntry;
    const resolvedCategory = timelineEntry?.category ?? gameSettings?.category;

    if (timelineEntry?.playerSettings) {
      return {
        category: resolvedCategory,
        gameSettings: {
          category: resolvedCategory,
          mode: {
            mode: timelineEntry.gameMode ?? gameSettings?.mode?.mode,
            countdownTime:
              timelineEntry.baseCountdown ??
              gameSettings?.mode?.countdownTime ??
              0,
          },
          players: {
            goal: {
              goal:
                timelineEntry.goal ??
                gameSettings?.players?.goal?.goal ??
                replaySnapshot?.playerSettings?.goal?.goal ??
                0,
            },
          },
        },
        playerSettings: timelineEntry.playerSettings,
        currentPlayerIndex: timelineEntry.currentPlayerIndex ?? 0,
        countdownTime:
          timelineEntry.countdownTime ??
          timelineEntry.baseCountdown ??
          gameSettings?.mode?.countdownTime ??
          0,
        totalTurns: timelineEntry.totalTurns ?? replaySnapshot?.totalTurns ?? 1,
      };
    }

    console.log(
      props.returnToMatch ? '[ReplayOverlaySync]' : '[HistoryOverlaySync]',
      {
        event: 'noTimelineSnapshotForPlayback',
        replayVideoPath: props.returnToMatch ? currentVideoPath : undefined,
        historyVideoPath: props.returnToMatch ? undefined : currentVideoPath,
        playerCurrentTimeMs: Math.round(
          Number(playbackCurrentTime || 0) * 1000,
        ),
        overlayTimelineEventsCount: scoreboardTimeline.length,
        usingLiveState: false,
        reason:
          'No timeline entry matched current video time; do not render live/current match state over old video.',
      },
    );

    return null;
  }, [
    activeTimelineEntry,
    currentVideoPath,
    gameSettings,
    playbackCurrentTime,
    props.returnToMatch,
    scoreboardTimeline.length,
  ]);

  const lastTimerSyncLogRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastTimerSyncLogRef.current < 1000) {
      return;
    }

    lastTimerSyncLogRef.current = now;
    console.log('[PlaybackTimerSync]', {
      sourceType: props.returnToMatch ? 'replay' : 'history',
      onProgressCurrentTimeMs: Math.round(
        Number(playbackCurrentTime || 0) * 1000,
      ),
      interpolatedCurrentTimeMs: Math.round(
        Number(playbackCurrentTime || 0) * 1000,
      ),
      paused: false,
      playbackRate,
      countdownValue: playbackScoreboardProps?.countdownTime,
      usedLiveTimer: false,
    });
  }, [
    playbackCurrentTime,
    playbackRate,
    props.returnToMatch,
    playbackScoreboardProps?.countdownTime,
  ]);

  const shouldShowPlaybackMatchOverlay = useMemo(() => {
    if (!playbackScoreboardProps) {
      return false;
    }

    return shouldShowMatchOverlay(
      playbackScoreboardProps.gameSettings,
      playbackScoreboardProps.playerSettings,
    );
  }, [playbackScoreboardProps]);

  const renderPlaybackScoreboard = useCallback(() => {
    if (!playbackScoreboardProps || !shouldShowPlaybackMatchOverlay) {
      return null;
    }

    const category = playbackScoreboardProps.category;

    if (
      isPool9Game(category) ||
      isPool10Game(category) ||
      isPool15Game(category)
    ) {
      return (
        <PoolBroadcastScoreboard
          gameSettings={playbackScoreboardProps.gameSettings}
          playerSettings={playbackScoreboardProps.playerSettings}
          currentPlayerIndex={playbackScoreboardProps.currentPlayerIndex}
          countdownTime={playbackScoreboardProps.countdownTime}
          variant={'playback'}
          bottomOffset={0}
        />
      );
    }

    if (isCaromGame(category)) {
      return (
        <CaromBroadcastScoreboard
          gameSettings={playbackScoreboardProps.gameSettings}
          playerSettings={playbackScoreboardProps.playerSettings}
          currentPlayerIndex={playbackScoreboardProps.currentPlayerIndex}
          countdownTime={playbackScoreboardProps.countdownTime}
          totalTurns={playbackScoreboardProps.totalTurns}
          variant={'playback'}
          bottomOffset={0}
        />
      );
    }

    return null;
  }, [playbackScoreboardProps, shouldShowPlaybackMatchOverlay]);

  useEffect(() => {
    if (!currentVideoPath) {
      return;
    }

    const overlayScreen = props.returnToMatch ? 'replayVAR' : 'historyPlayback';
    console.log('[VideoLayering]', {
      playerContainerZ: 0,
      overlayZ: 120,
      nativeControlsVisible: Platform.OS === 'windows',
      overlayBottomInset: 8,
      overlayCoversControls: true,
      resizeMode: PLAYBACK_VIDEO_RESIZE_MODE,
    });
    console.log(
      `[VideoOverlay] screen=${overlayScreen} showSponsorLogo=false showLogo=false showWatermark=false showScore=false showLive=false showControls=true`,
    );
  }, [currentVideoPath, props.returnToMatch]);

  return (
    <Container>
      <View direction={'row'} style={styles.screenRoot}>
        <View style={styles.sidePanel}>
          <View style={styles.sideHeader}>
            <Text style={styles.sideTitle}>{i18n.t('reWatch')}</Text>
          </View>

          <View style={styles.sideLogoArea} />

          <View style={styles.sideBottomControls}>
            <Text style={styles.speedTitle}>{i18n.t('txtTocDoXem')}</Text>
            <View style={styles.speedGrid}>
              {PLAYBACK_RATE_OPTIONS.map(rate => (
                <Button
                  key={`rate-${rate}`}
                  style={[
                    styles.speedOption,
                    playbackRate === rate && styles.speedOptionSelected,
                  ]}
                  onPress={() => handlePlaybackRateChange(rate)}>
                  <Text
                    style={[
                      styles.speedOptionText,
                      playbackRate === rate && styles.speedOptionTextSelected,
                    ]}>
                    {rate}x
                  </Text>
                </Button>
              ))}
            </View>

            <Button style={styles.buttonBack} onPress={onBackToMatch}>
              <View direction={'row'} alignItems={'center'}>
                <Image source={images.back} style={styles.iconBack} />
                <Text lineHeight={15}>{i18n.t('txtBack')}</Text>
              </View>
            </Button>
          </View>
        </View>

        <View flex={'1'} style={styles.webcamContainer}>
          {viewModel.isLoading ? (
            <View style={styles.webcam}>{WEBCAM_LOADER}</View>
          ) : viewModel.videoFiles.length > 0 ? (
            <View style={styles.webcam} collapsable={false}>
              <Video
                key={playerKey}
                resizeMode={PLAYBACK_VIDEO_RESIZE_MODE}
                id={'webcam-billiards-playback'}
                ref={viewModel.videoRef}
                style={styles.webcam}
                controls={Platform.OS === 'windows'}
                paused={playbackPaused}
                source={videoSource}
                selectedVideoTrack={WEBCAM_SELECTED_VIDEO_TRACK}
                useTextureView={false}
                bufferConfig={{
                  minBufferMs: 4000,
                  maxBufferMs: 20000,
                  bufferForPlaybackMs: 250,
                  bufferForPlaybackAfterRebufferMs: 1000,
                }}
                onError={error => {
                  const errorMessage = `${i18n.t('msgWebcamVideoNotExist')} (${currentVideoUri})`;
                  setPlayerError(errorMessage);
                  setPlayerReady(false);
                  setPlaybackPaused(true);
                  console.log('[ReplayPlayer]', {
                    event: 'onError',
                    requestedPath: currentVideoPath,
                    normalizedSource: currentVideoUri,
                    playerKey,
                    playerSource: props.returnToMatch ? 'Replay' : 'History',
                    error,
                  });
                  viewModel.onWebcamError(error);
                }}
                renderLoader={WEBCAM_LOADER}
                rate={playbackRate}
                progressUpdateInterval={500}
                onLoadStart={() => {
                  setPlayerReady(false);
                  setPlayerError(null);
                  const loadStartPayload = {
                    event: 'loading',
                    requestedPath: currentVideoPath,
                    normalizedSource: currentVideoUri,
                    playerKey,
                    playerSource: props.returnToMatch ? 'Replay' : 'History',
                    realStartTime: formatLocalClockTime(
                      currentVideoStartTimeMs,
                    ),
                    localTimezone: getLocalTimeZoneLabel(),
                  };
                  console.log('[ReplayPlayer]', loadStartPayload);
                  recordDebugLog('ReplayPlayer', 'onLoadStart', loadStartPayload);
                  if (props.returnToMatch) {
                    recordDebugLog('VARLatency', 'player-load-start', {
                      t: Date.now(),
                      replayClickAt: props.replayClickAt,
                      webcamFolderName: props.webcamFolderName,
                      path: currentVideoPath,
                    });
                  }
                }}
                startAtTailSeconds={0}
                onLoad={data => {
                  console.log('[VideoFreezeGuard]', {
                    action: 'playerLoad',
                    asyncOperationFinished: true,
                    playerKey,
                  });
                  const duration = Number(data?.duration || 0);
                  const loadPayload = {
                    event: 'ready',
                    requestedPath: currentVideoPath,
                    normalizedSource: currentVideoUri,
                    playerKey,
                    duration,
                    naturalSize: data?.naturalSize,
                    container: currentVideoContainer,
                    codec: currentVideoFile?.codec || currentVideoFile?.videoCodec || 'unknown',
                    resizeMode: PLAYBACK_VIDEO_RESIZE_MODE,
                    selectedQuality: getSelectedPlaybackQualityLabel(currentVideoPath),
                    useTextureView: false,
                    realStartTime: formatLocalClockTime(
                      currentVideoStartTimeMs,
                    ),
                    realEndTime: formatLocalClockTime(
                      currentVideoStartTimeMs + duration * 1000,
                    ),
                    localTimezone: getLocalTimeZoneLabel(),
                    playerSource: props.returnToMatch ? 'Replay' : 'History',
                  };
                  console.log('[ReplayPlayer]', loadPayload);
                  recordDebugLog('ReplayPlayer', 'onLoad', loadPayload);
                  if (props.returnToMatch) {
                    const readyAt = Date.now();
                    recordDebugLog('VARLatency', 'player-ready', {
                      t: readyAt,
                      durationMs: props.replayClickAt
                        ? readyAt - Number(props.replayClickAt)
                        : undefined,
                      path: currentVideoPath,
                      duration,
                    });
                    recordDebugLog('VARLatency', 'replay-click-to-player-ready', {
                      durationMs: props.replayClickAt
                        ? readyAt - Number(props.replayClickAt)
                        : undefined,
                    });
                  }
                  lastProgressLogRef.current = null;
                  lastProgressUiUpdateRef.current = 0;
                  viewModel.handleVideoLoad(currentVideoPath, duration);
                  setPlayerReady(true);
                  setPlayerError(null);
                  setPlaybackPaused(false);
                  viewModel.setIsPlaying(true);

                  const pendingHistorySeek = pendingHistorySeekRef.current;
                  const segmentGlobalStartSeconds =
                    Number(currentTimelineSegment?.globalStartMs || 0) / 1000;

                  if (isHistoryPlaybackMode && pendingHistorySeek?.path === currentVideoPath) {
                    try {
                      viewModel.videoRef.current?.seek?.(pendingHistorySeek.localSeconds);
                      lastSeekCompletedAtRef.current = Date.now();
                    } catch (seekError) {
                      console.log('[HistoryPlayback]', {
                        event: 'pending-seek-error',
                        path: currentVideoPath,
                        seekError,
                      });
                    }
                    setPlaybackCurrentTime(pendingHistorySeek.globalSeconds);
                    setScoreboardPlaybackTime(pendingHistorySeek.localSeconds);
                    setPlaybackPaused(pendingHistorySeek.keepPaused);
                    viewModel.setIsPlaying(!pendingHistorySeek.keepPaused);
                    recordDebugLog('HistoryPlayback', 'next-segment-loaded', {
                      index: currentTimelineSegment?.index,
                      path: currentVideoPath,
                      localMs: Math.round(pendingHistorySeek.localSeconds * 1000),
                      globalMs: Math.round(pendingHistorySeek.globalSeconds * 1000),
                    });
                    pendingHistorySeekRef.current = null;
                  } else if (isHistoryPlaybackMode) {
                    setPlaybackCurrentTime(segmentGlobalStartSeconds);
                    setScoreboardPlaybackTime(0);
                    viewModel.handleLoad();
                    recordDebugLog('HistoryPlayback', 'next-segment-loaded', {
                      index: currentTimelineSegment?.index,
                      path: currentVideoPath,
                      localMs: 0,
                      globalMs: Math.round(segmentGlobalStartSeconds * 1000),
                    });
                  } else {
                    setPlaybackCurrentTime(0);
                    setScoreboardPlaybackTime(0);
                    viewModel.handleLoad();
                  }

                  if (props.returnToMatch) {
                    // VAR mode is a playback window over the newest full-quality
                    // segment. History keeps the full segment/match; only VAR seek UI
                    // is clamped to the final 30 seconds.
                    const clipStart = duration > 30.05 ? Math.max(0, duration - 30) : 0;
                    const clipEnd = duration;
                    const replayStartTime = clipStart;
                    const varPayload = {
                      mode: 'var',
                      sourcePath: currentVideoPath,
                      sourceDurationMs: Math.round(duration * 1000),
                      clipStartMs: Math.round(clipStart * 1000),
                      clipEndMs: Math.round(clipEnd * 1000),
                      clipDurationMs: Math.round(Math.max(0, clipEnd - clipStart) * 1000),
                    };
                    recordDebugLog('ReplayVAR', 'mode=var', varPayload);
                    try {
                      viewModel.videoRef.current?.seek?.(replayStartTime);
                      setPlaybackCurrentTime(replayStartTime);
                      setScoreboardPlaybackTime(replayStartTime);
                      console.log('[Replay]', {
                        event: 'seekToTail',
                        replayStartTime,
                        duration,
                        windowSeconds: 30,
                        realStartTime: formatLocalClockTime(
                          currentVideoStartTimeMs + replayStartTime * 1000,
                        ),
                      });
                    } catch (seekError) {
                      console.log(
                        '[Replay] seek to recent VAR window failed',
                        seekError,
                      );
                    }
                  }
                }}
                onReadyForDisplay={() => {
                  console.log('[VideoPlayerEvents]', {
                    event: 'onReadyForDisplay',
                    requestedPath: currentVideoPath,
                    normalizedSource: currentVideoUri,
                    playerKey,
                    playerSource: props.returnToMatch ? 'Replay' : 'History',
                  });
                }}
                onBuffer={data => {
                  const payload = {
                    event: 'buffering',
                    playerKey,
                    isBuffering: data?.isBuffering,
                    position: playbackCurrentTime,
                    playerSource: props.returnToMatch ? 'Replay' : 'History',
                  };
                  console.log('[ReplayPlayer]', payload);
                  recordDebugLog('ReplayPlayer', 'onBuffer', payload);
                }}
                onProgress={data => {
                  const localCurrentTime = Number(data?.currentTime || 0);
                  const currentTime = isHistoryPlaybackMode
                    ? currentSegmentGlobalStartSeconds + localCurrentTime
                    : localCurrentTime;
                  if (isSeeking) {
                    return;
                  }

                  const now = Date.now();
                  const previous = lastProgressLogRef.current;
                  if (previous && now - lastSeekCompletedAtRef.current > 1200) {
                    const deltaMs = Math.round(
                      (currentTime - previous.currentTime) * 1000,
                    );
                    const wallDeltaMs = now - previous.wallTime;
                    const expectedDeltaMs = Math.max(
                      0,
                      Math.round(wallDeltaMs * playbackRate),
                    );
                    const jumpDeltaMs = Math.abs(deltaMs - expectedDeltaMs);
                    if (playbackRate === 1 && deltaMs > 1500 && jumpDeltaMs > 1200) {
                      const payload = {
                        prev: previous.currentTime,
                        current: currentTime,
                        deltaMs,
                        wallDeltaMs,
                        expectedDeltaMs,
                        rate: playbackRate,
                        path: currentVideoPath,
                        segmentIndex: currentTimelineSegment?.index,
                        localCurrentTime,
                      };
                      recordDebugLog('ReplayPlayer', 'progress-jump', payload);
                      recordDebugLog('ReplayPlayer', 'stutter-or-jump detected', payload);
                    }
                  }
                  lastProgressLogRef.current = {currentTime, wallTime: now};

                  if (
                    now - lastProgressUiUpdateRef.current >= 500 ||
                    Math.abs(currentTime - playbackCurrentTime) >= 0.9
                  ) {
                    lastProgressUiUpdateRef.current = now;
                    setPlaybackCurrentTime(currentTime);
                  }
                  if (
                    now - lastScoreboardUiUpdateRef.current >= 1000 ||
                    Math.abs(localCurrentTime - scoreboardPlaybackTime) >= 1.5
                  ) {
                    lastScoreboardUiUpdateRef.current = now;
                    setScoreboardPlaybackTime(localCurrentTime);
                  }

                  if (isHistoryPlaybackMode && now - lastHistoryPlaybackLogRef.current >= 3000) {
                    lastHistoryPlaybackLogRef.current = now;
                    recordDebugLog('HistoryPlayback', 'current-segment-index', {
                      index: currentTimelineSegment?.index,
                      path: currentVideoPath,
                    });
                    recordDebugLog('HistoryPlayback', 'local-positionMs', {
                      localPositionMs: Math.round(localCurrentTime * 1000),
                    });
                    recordDebugLog('HistoryPlayback', 'global-positionMs', {
                      globalPositionMs: Math.round(currentTime * 1000),
                      totalDurationMs: historyTimeline.totalDurationMs,
                    });
                  }

                  viewModel.handleProgress({...data, currentTime: localCurrentTime});
                }}
                onEnd={() => {
                  console.log('[ReplayPlayer]', {
                    event: 'onEnd',
                    requestedPath: currentVideoPath,
                    normalizedSource: currentVideoUri,
                    playerKey,
                    playerSource: props.returnToMatch ? 'Replay' : 'History',
                  });

                  if (isHistoryPlaybackMode) {
                    recordDebugLog('HistoryPlayback', 'segment-end', {
                      index: currentTimelineSegment?.index,
                      playlistIndex: viewModel.currentIndex,
                      path: currentVideoPath,
                    });

                    if (viewModel.currentIndex < viewModel.videoFiles.length - 1) {
                      const nextIndex = viewModel.currentIndex + 1;
                      const nextPath = viewModel.videoFiles[nextIndex]?.path || '';
                      const nextTimelineSegment = historyTimeline.segments.find(
                        segment => segment.path === nextPath,
                      );
                      const nextGlobalSeconds =
                        Number(nextTimelineSegment?.globalStartMs || 0) / 1000;

                      pendingHistorySeekRef.current = {
                        path: nextPath,
                        localSeconds: 0,
                        globalSeconds: nextGlobalSeconds,
                        keepPaused: false,
                      };
                      setPlaybackCurrentTime(nextGlobalSeconds);
                      setScoreboardPlaybackTime(0);
                      setPlaybackPaused(false);
                      viewModel.setIsPlaying(true);
                      recordDebugLog('HistoryPlayback', 'auto-next-segment', {
                        from: viewModel.currentIndex,
                        to: nextIndex,
                        fromPath: currentVideoPath,
                        toPath: nextPath,
                        globalMs: Math.round(nextGlobalSeconds * 1000),
                      });
                      viewModel.setCurrentIndex(nextIndex);
                      return;
                    }

                    setPlaybackPaused(true);
                    viewModel.setIsPlaying(false);
                    recordDebugLog('HistoryPlayback', 'full-match-ended', {
                      totalDurationMs: historyTimeline.totalDurationMs,
                    });
                    return;
                  }

                  if (
                    viewModel.currentIndex >=
                    viewModel.videoFiles.length - 1
                  ) {
                    setPlaybackPaused(true);
                    viewModel.setIsPlaying(false);
                    return;
                  }
                  viewModel.handleNext();
                }}
              />

              {Platform.OS === 'windows' ? null : (
                <Pressable
                  style={overlayStyles.videoTapLayer}
                  onPress={togglePlaybackControls}
                />
              )}

              {controlsVisible ? (
                <RNView
                  pointerEvents={'box-none'}
                  style={overlayStyles.playerControls}>
                  <RNView
                    pointerEvents={'none'}
                    style={overlayStyles.controlsScrim}
                  />
                  <Pressable
                    style={overlayStyles.centerPlayButton}
                    onPress={togglePlaybackPause}>
                    <Text style={overlayStyles.centerPlayText}>
                      {playbackPaused ? '▶' : 'Ⅱ'}
                    </Text>
                  </Pressable>


                  <View style={overlayStyles.seekPanel}>
                    <Text style={overlayStyles.timeText}>
                      {currentRealTimeLabel}
                    </Text>
                    <Slider
                      style={overlayStyles.seekSlider}
                      minimumValue={0}
                      maximumValue={Math.max(visibleClipDuration, 1)}
                      value={Math.min(
                        sliderPlaybackTime,
                        Math.max(visibleClipDuration, 1),
                      )}
                      disabled={!playerReady || visibleClipDuration <= 0}
                      step={0.1}
                      onSlidingStart={handleSeekStart}
                      onValueChange={handleSeekChange}
                      onSlidingComplete={handleSeekComplete}
                    />
                    <Text style={overlayStyles.timeText}>
                      {endRealTimeLabel}
                    </Text>
                  </View>
                </RNView>
              ) : null}

              {playerError ? (
                <RNView
                  pointerEvents={'none'}
                  style={overlayStyles.playerErrorBox}>
                  <Text style={overlayStyles.playerErrorText}>
                    {playerError}
                  </Text>
                </RNView>
              ) : null}
            </View>
          ) : (
            <View style={styles.webcamEmpty}>
              <Text style={styles.noVideoTitle}>
                {i18n.t('msgReplayNotReady')}
              </Text>
              <Text style={styles.noVideoHint}>
                {props.returnToMatch
                  ? 'Replay chưa có file trong buffer hoặc lịch sử.'
                  : i18n.t('txtNoVideo')}
              </Text>
            </View>
          )}
        </View>

        {viewModel.videoFiles.length > 0 ? (
          <Button
            style={styles.buttonShare}
            onPress={() => {
              showEditor(viewModel.videoFiles[viewModel.currentIndex].path, {
                type: 'video',
                outputExt: 'mov',
                trimmingText: i18n.t('trimmingText'),
                cancelTrimmingDialogMessage: i18n.t(
                  'cancelTrimmingDialogMessage',
                ),
                cancelTrimmingButtonText: i18n.t('cancelTrimmingButtonText'),
                saveDialogConfirmText: i18n.t('saveDialogConfirmText'),
                saveDialogTitle: i18n.t('saveDialogTitle'),
                saveButtonText: i18n.t('saveButtonText'),
                saveDialogMessage: i18n.t('saveDialogMessage'),
                cancelDialogConfirmText: i18n.t('cancelDialogConfirmText'),
                openDocumentsOnFinish: false,
                cancelButtonText: i18n.t('cancelButtonText'),
                cancelTrimmingDialogCancelText: i18n.t(
                  'cancelTrimmingDialogCancelText',
                ),
                cancelDialogCancelText: i18n.t('cancelDialogCancelText'),
                cancelDialogMessage: i18n.t('cancelDialogMessage'),
              });
            }}>
            <Image source={images.videoEditor} style={styles.iconShare} />
          </Button>
        ) : (
          <View />
        )}
      </View>
    </Container>
  );
};

const overlayStyles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
    elevation: 12,
  },
  slot: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
    maxWidth: '42%',
  },
  topLeft: {
    top: 10,
    left: 10,
  },
  topRight: {
    top: 10,
    right: 10,
  },
  bottomLeft: {
    bottom: PLAYBACK_NATIVE_CONTROLS_BOTTOM_INSET,
    left: 10,
  },
  bottomRight: {
    bottom: PLAYBACK_NATIVE_CONTROLS_BOTTOM_INSET,
    right: 10,
  },
  videoTapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
    elevation: 90,
  },
  playerControls: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  centerPlayButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  centerPlayText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  seekPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
    minHeight: 50,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.68)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  seekSlider: {
    flex: 1,
    marginHorizontal: 8,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    minWidth: 62,
    textAlign: 'center',
  },
  playerErrorBox: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(216,32,39,0.90)',
    zIndex: 70,
    elevation: 70,
  },
  playerErrorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  image: {
    width: 120,
    height: 70,
    marginRight: 8,
  },
});

export default memo(PlayBackWebcam);
