import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert, AppState, Platform} from 'react-native';
import {useSelector, useDispatch} from 'react-redux';
import RNFS from 'react-native-fs';
import {getUvcPreviewStatus} from 'services/uvc';
// import {captureRef} from 'react-native-view-shot';
import {useRealm} from '@realm/react';
import {RootState} from 'data/redux/reducers';
import {gameActions} from 'data/redux/actions/game';
import i18n from 'i18n';
import {LanguageContext} from 'context/language';
import {Camera} from 'react-native-vision-camera';
import {goBack} from 'utils/navigation';
import {
  isPool10Game,
  isPool15FreeGame,
  isPool15Game,
  isPool15OnlyGame,
  isPool9Game,
  isPoolGame,
  isCaromGame,
  isSnookerGame,
} from 'utils/game';
import Sound from 'utils/sound';
import {
  clearRecordDebugLog,
  getRecordDebugLogPath,
  recordDebugLog,
} from 'utils/recordDebugLogger';
import RemoteControl from 'utils/remote';
import {Player, PlayerSettings} from 'types/player';
import {GameSettings} from 'types/settings';
import {RemoteControlKeys} from 'types/bluetooth';
import {BallType, PoolBallType} from 'types/ball';
//import {MATCH_COUNTDOWN, WEBCAM_BASE_CAMERA_FOLDER} from 'constants/webcam';
import {NativeModules} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {LIVESTREAM_ACCOUNT_STORAGE_KEY} from 'config/livestreamAuth';
import {
  RECORDING_SEGMENT_DURATION_MS,
  MAX_REPLAY_STORAGE_BYTES,
  getConfiguredRecordingSegmentDurationMs,
  getConfiguredReplayStorageBytes,
  deleteReplayFolder,
  buildReplayLatestFile,
  buildReplayLatestForSource,
  exportMatchToArchive,
  getNextReplaySegmentIndex,
  registerReplaySegment,
  pruneReplayStorage,
  listReplayFiles,
  listArchiveFiles,
  listPlayableFiles,
  cleanupBrokenReplayFiles,
  waitForReplayFiles,
} from 'services/replay/localReplay';
import {
  buildRtspCameraCandidates,
  isIpCameraConfigured,
  loadIpCameraConfig,
} from 'services/camera/ipCameraConfig';
import {
  cancelRtspSegmentRecording,
  getRtspSegmentRecordingInfo,
  isRtspSegmentRecording,
  startRtspSegmentRecording,
  stopRtspSegmentRecording,
} from 'services/replay/rtspSegmentRecorder';
import {
  appendReplayScoreboardTimelineEntry,
  flushReplayScoreboardTimeline,
  loadReplayScoreboardTimeline,
} from 'services/replay/replayTimeline';
import {screens} from 'scenes/screens';
import {navigate, push} from 'utils/navigation';
import {
  createYouTubeLiveSession,
  getYouTubeLiveEligibility,
  stopYouTubeLiveSession,
  type YouTubeEligibilityCheck,
  type YouTubeEligibilityResponse,
} from 'services/youtubeLiveFlow';
import {
  isYouTubeNativeLiveEngineMounted,
  isYouTubeNativeLiveReady,
  isYouTubeNativePreviewViewAvailable,
  startYouTubeNativeLive,
  stopYouTubeNativeLive,
  subscribeYouTubeNativeLiveState,
} from 'services/youtubeNativeLive';
import {
  DEFAULT_YOUTUBE_RTMP_URL,
  createWindowsFfmpegSnapshotFromGameState,
  maskStreamKey,
  startWindowsFfmpegYouTubeLive,
  stopWindowsFfmpegYouTubeLive,
  updateWindowsFfmpegOverlay,
  type WindowsFfmpegLiveConfig,
} from 'services/livestream/WindowsFfmpegLiveEngine';
import {
  pushAplusLiveScoreUpdate,
  finishAplusLiveScoreMatch,
} from 'services/aplusLiveScore';

let countdownInterval: NodeJS.Timeout, warmUpCountdownInterval: NodeJS.Timeout;
const {CameraService} = NativeModules;

const DISABLE_WINDOWS_LOCAL_RECORDING_SERVICE = true;
// Android build ưu tiên chạy bảng điểm + preview camera ổn định.
// Không tự bật recording/replay khi vào gameplay vì nhiều máy Android box/tablet
// dùng USB UVC dễ crash native khi recording khởi động trong lúc camera còn loading.
const DISABLE_ANDROID_LOCAL_RECORDING_SERVICE = false;

const shouldUseLocalMatchRecording = (enabledByFlow: boolean) => {
  if (Platform.OS === 'windows' && DISABLE_WINDOWS_LOCAL_RECORDING_SERVICE) {
    return false;
  }

  if (Platform.OS === 'android' && DISABLE_ANDROID_LOCAL_RECORDING_SERVICE) {
    return false;
  }

  return enabledByFlow;
};

const getGameplayModeCode = (settings?: GameSettings | null) =>
  String(settings?.mode?.mode || 'unknown');

const getGameplayModeLogLabel = (settings?: GameSettings | null) => {
  const mode = getGameplayModeCode(settings);

  if (mode === 'fast') {
    return 'quick';
  }

  if (mode === 'quick_match') {
    return 'fastCompetition';
  }

  if (mode === 'pro') {
    return 'competition';
  }

  return mode;
};

const isFastGameMode = (settings?: GameSettings | null) =>
  getGameplayModeCode(settings) === 'fast';

const isQuickMatchGameMode = (settings?: GameSettings | null) =>
  getGameplayModeCode(settings) === 'quick_match';

const shouldSuppressMatchCountdownForMode = (settings?: GameSettings | null) =>
  isFastGameMode(settings) || isQuickMatchGameMode(settings);

const shouldEnableVideoReplayForGameMode = (
  settings?: GameSettings | null,
) => {
  const mode = getGameplayModeCode(settings);

  return (
    mode === 'fast' ||
    mode === 'quick_match' ||
    mode === 'pro' ||
    mode === 'time' ||
    mode === 'eliminate'
  );
};

const getActiveGameplayPlayerCount = (
  settings?: GameSettings | null,
  currentPlayerSettings?: PlayerSettings | null,
) => {
  const fromCurrent = Array.isArray(currentPlayerSettings?.playingPlayers)
    ? currentPlayerSettings!.playingPlayers.length
    : 0;
  const fromGamePlayers = Array.isArray(settings?.players?.playingPlayers)
    ? settings!.players.playingPlayers.length
    : 0;
  const fromNumber = Number(settings?.players?.playerNumber || 0);

  const count = fromCurrent || fromGamePlayers || fromNumber || 1;
  return Math.max(1, Math.round(count));
};

const getSafeRunPoint = (value?: number) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getTopTwoRuns = (player: Player, currentPoint: number) => {
  const runs = [
    getSafeRunPoint(player.proMode?.highestRate),
    getSafeRunPoint(player.proMode?.secondHighestRate),
    getSafeRunPoint(currentPoint),
  ].sort((a, b) => b - a);

  return {
    highestRate: runs[0] || 0,
    secondHighestRate: runs[1] || 0,
  };
};

const commitCurrentRunStatsForPlayers = (
  settings?: PlayerSettings,
  totalTurnsValue?: number,
): PlayerSettings | undefined => {
  if (!settings?.playingPlayers?.length) {
    return settings;
  }

  const completedTurns = Math.max(1, Number(totalTurnsValue || 0) + 1);

  return {
    ...settings,
    playingPlayers: settings.playingPlayers.map(player => {
      const currentPoint = getSafeRunPoint(player.proMode?.currentPoint);

      if (!player.proMode || currentPoint <= 0) {
        return player;
      }

      const {highestRate, secondHighestRate} = getTopTwoRuns(
        player,
        currentPoint,
      );
      const average = Number(
        (Number(player.totalPoint || 0) / completedTurns).toFixed(2),
      );

      return {
        ...player,
        proMode: {
          ...player.proMode,
          highestRate,
          secondHighestRate,
          average,
          currentPoint: 0,
        },
      };
    }),
  };
};

const COUNTDOWN_BEEP_START_SECOND = 10;
const COUNTDOWN_BEEP_END_SECOND = 1;

const getCountdownBeepSecond = (value?: number) => {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numericValue));
};

const playCountdownBeepSafely = () => {
  try {
    const soundModule = Sound as any;
    const playBeep =
      typeof soundModule?.countdownBeep === 'function'
        ? soundModule.countdownBeep
        : soundModule?.beep;

    if (typeof playBeep === 'function') {
      playBeep();
      return;
    }

    console.log('[CountdownBeep]', {
      component: 'GamePlayViewModel',
      reason: 'Sound.countdownBeep is not available; skipped countdown beep',
    });
  } catch (error) {
    console.log('[CountdownBeep]', {
      component: 'GamePlayViewModel',
      reason: 'Sound.countdownBeep threw; skipped countdown beep',
      error,
    });
  }
};

const stopCountdownBeepSafely = () => {
  try {
    const soundModule = Sound as any;

    if (typeof soundModule?.stopCountdownBeep === 'function') {
      soundModule.stopCountdownBeep();
    }
  } catch (error) {
    console.log('[CountdownBeep]', {
      component: 'GamePlayViewModel',
      reason: 'Sound.stopCountdownBeep threw; ignored',
      error,
    });
  }
};

type Visibility = 'public' | 'private' | 'unlisted';

type StoredSetup = {
  accountName?: string;
  visibility?: Visibility;
  accountId?: string;
  setupToken?: string;
};

type StorageShape = {
  facebook?: StoredSetup;
  youtube?: StoredSetup;
  tiktok?: StoredSetup;
};

type GameplayLiveRouteParams = {
  gameSettings?: GameSettings;
  livestreamPlatform?: 'facebook' | 'youtube' | 'tiktok' | 'device' | null;
  saveToDeviceWhileStreaming?: boolean;
  liveVisibility?: 'public' | 'private' | 'unlisted';
  liveAccountName?: string;
  liveAccountId?: string;
  liveSetupToken?: string;
  gameplaySessionKey?: string;
  forceNewGameplaySession?: boolean;
};

const normalizeGameplayLivestreamPlatform = (value: any) => {
  return value === 'facebook' ||
    value === 'youtube' ||
    value === 'tiktok' ||
    value === 'device'
    ? value
    : null;
};

const DEBUG_MATCH_RESTORE = false;
const debugMatchRestoreLog = (...args: any[]) => {
  if (__DEV__ && DEBUG_MATCH_RESTORE) {
    console.log(...args);
  }
};

const setYouTubeNativeCameraLock = (locked: boolean) => {
  (globalThis as any).__APLUS_YOUTUBE_NATIVE_LOCK__ = locked;
};

const getCurrentCameraSource = (): 'back' | 'front' | 'external' => {
  const value = (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__;
  return value === 'front' || value === 'external' ? value : 'back';
};

const setYouTubeSourceLock = (source: 'back' | 'front' | 'external' | null) => {
  (globalThis as any).__APLUS_YOUTUBE_SOURCE_LOCK__ = source;
};

const withEndMatchTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T | undefined> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`${label}_TIMEOUT_${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    console.log('[END] background/timeout skipped:', {
      label,
      timeoutMs,
      message: (error as Error)?.message || String(error),
    });
    return undefined;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const withVarReplayPrepareTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T | undefined> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`${label}_TIMEOUT_${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    recordDebugLog('VARLatency', 'wait-prepare-timeout', {
      label,
      timeoutMs,
      error: String((error as Error)?.message || error),
    });
    return undefined;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

type PreparedVarReplayFile = {
  name: string;
  path: string;
  size?: number;
  segmentIndex?: number;
  segmentStartedAt?: number;
  createdAtMs?: number;
  durationSeconds?: number;
  sourceFileName?: string;
  playbackFileName?: string;
  smoothPlaybackFileName?: string;
  containerType?: string;
  playbackContainerType?: string;
  smoothPlaybackContainerType?: string;
};

type PreparedVarReplayPayload = {
  mode: 'var';
  webcamFolderName: string;
  matchSessionId?: string;
  preparedAt: number;
  files: PreparedVarReplayFile[];
  latestPath?: string;
  source: 'pause-prepared';
};

type GameplayCameraSourceKey = 'rtsp' | 'usb' | 'builtInCamera' | 'unknown';

type ReplaySourceRuntimeState = {
  source: GameplayCameraSourceKey;
  matchId: string;
  sessionId?: string;
  recordingStarted: boolean;
  recorderReady: boolean;
  replayReady: boolean;
  currentSegmentPath?: string;
  latestReplayPath?: string;
  segmentRegistry: string[];
  bufferStartAt: number;
  lastError?: string;
  folderPath?: string;
};

const getGlobalCameraSourceKind = (): GameplayCameraSourceKey => {
  const kind = String((globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ || '').trim();
  if (kind === 'rtsp' || kind === 'usb' || kind === 'builtInCamera') {
    return kind;
  }
  return 'unknown';
};

const hasSelectedUsbCameraSource = () => {
  const sourceKind = getGlobalCameraSourceKind();
  const selectedMode = String((globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ || '').trim();
  const activeBackend = String((globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ || '').trim();
  const currentSource = String((globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ || '').trim();
  const activeRtspUrl = String((globalThis as any).__APLUS_ACTIVE_RTSP_URL__ || '').trim();
  const usbGameplayReady = (globalThis as any).__APLUS_USB_GAMEPLAY_READY__ === true;

  if (sourceKind === 'rtsp' || selectedMode === 'ip' || activeBackend === 'rtsp' || activeRtspUrl.length > 0) {
    return false;
  }

  return (
    sourceKind === 'usb' ||
    selectedMode === 'usb' ||
    activeBackend === 'uvc' ||
    (currentSource === 'external' && usbGameplayReady)
  );
};

const hasDetectedUvcSource = () => {
  return (
    (globalThis as any).__APLUS_UVC_PRESENT__ === true ||
    (Platform.OS === 'android' && hasSelectedUsbCameraSource())
  );
};

const getAvailableCameraSources = (): Array<'back' | 'front' | 'external'> => {
  if (Platform.OS === 'android' && hasDetectedUvcSource()) {
    return ['external'];
  }

  const sources = (globalThis as any).__APLUS_AVAILABLE_CAMERA_SOURCES__;
  return Array.isArray(sources) ? sources : [];
};

const normalizeAvailableCameraSources = (
  sources: Array<'back' | 'front' | 'external'>,
): Array<'back' | 'front' | 'external'> => {
  return Array.from(new Set(sources)).filter(
    (source): source is 'back' | 'front' | 'external' =>
      source === 'back' || source === 'front' || source === 'external',
  );
};

const resolveLockedLiveSource = (
  currentSource: 'back' | 'front' | 'external',
  availableSources: Array<'back' | 'front' | 'external'>,
): 'back' | 'front' | 'external' | null => {
  const normalizedSources = normalizeAvailableCameraSources(availableSources);
  const hasExternal =
    hasDetectedUvcSource() && normalizedSources.includes('external');

  if (hasExternal && Platform.OS === 'android') {
    return 'external';
  }

  if (currentSource === 'external') {
    return hasExternal ? 'external' : null;
  }

  if (currentSource === 'back' && normalizedSources.includes('back')) {
    return 'back';
  }

  if (currentSource === 'front' && normalizedSources.includes('front')) {
    return 'front';
  }

  if (normalizedSources.includes('back')) {
    return 'back';
  }

  if (normalizedSources.includes('front')) {
    return 'front';
  }

  if (currentSource === 'front' || currentSource === 'back') {
    return currentSource;
  }

  return null;
};

const LIVE_SNAPSHOT_SYNC_MIN_MS = 5000;
const REPLAY_TIMELINE_TIME_BUCKET_SECONDS = 3;
const REPLAY_TIMELINE_COUNTDOWN_BUCKET_SECONDS = 3;
const REPLAY_PRUNE_EVERY_N_SEGMENTS = 3;
const ENABLE_SEGMENT_OVERLAY_BURN = false;
const REPLAY_RETURN_CAMERA_STABILIZE_MS = 900;
const USB_INSTANT_REPLAY_SEGMENT_MS = 4000;
const MIN_VALID_RECORDING_BYTES = 128 * 1024;
const MIN_USB_SHORT_REPLAY_BYTES = 8 * 1024;
const getMinValidRecordingBytesForSource = (source?: string | null) =>
  source === 'usb' || source === 'uvc' ? MIN_USB_SHORT_REPLAY_BYTES : MIN_VALID_RECORDING_BYTES;

type ReplayResumeSnapshot = {
  matchSessionId?: string;
  webcamFolderName?: string;
  currentPlayerIndex: number;
  poolBreakPlayerIndex: number;
  totalTurns: number;
  totalTime: number;
  countdownTime: number;
  warmUpCount?: number;
  warmUpCountdownTime?: number;
  playerSettings?: PlayerSettings;
  winner?: Player;
  isStarted: boolean;
  isPaused: boolean;
  isMatchPaused: boolean;
  matchCountdownPausedBeforeReplay?: boolean;
  gameBreakEnabled: boolean;
  poolBreakEnabled: boolean;
  soundEnabled: boolean;
  proModeEnabled: boolean;
  restoreOnNextFocus?: boolean;
  savedAt?: number;
  aplusLiveMatchIdentity?: string;
  cameraSource?: GameplayCameraSourceKey;
};

type ReplayReturnRequest = {
  matchSessionId?: string;
  webcamFolderName?: string;
  requestedAt?: number;
};

type Pool8Tracker = {
  sequence: BallType[];
  activeIndex: number;
};

const DEFAULT_POOL8_LEFT_SEQUENCE: BallType[] = [
  BallType.B1,
  BallType.B2,
  BallType.B3,
  BallType.B4,
  BallType.B5,
  BallType.B6,
  BallType.B7,
  BallType.B8,
];

const DEFAULT_POOL8_RIGHT_SEQUENCE: BallType[] = [
  BallType.B9,
  BallType.B10,
  BallType.B11,
  BallType.B12,
  BallType.B13,
  BallType.B14,
  BallType.B15,
  BallType.B8,
];

const buildDefaultPool8Trackers = (): Pool8Tracker[] => [
  {sequence: [...DEFAULT_POOL8_LEFT_SEQUENCE], activeIndex: 0},
  {sequence: [...DEFAULT_POOL8_RIGHT_SEQUENCE], activeIndex: 0},
];

const getSafePool8Trackers = (
  trackers?: Pool8Tracker[] | null,
): Pool8Tracker[] =>
  Array.isArray(trackers) && trackers.length > 0
    ? trackers
    : buildDefaultPool8Trackers();

const resetPool8Trackers = (trackers?: Pool8Tracker[] | null): Pool8Tracker[] =>
  getSafePool8Trackers(trackers).map(tracker => ({...tracker, activeIndex: 0}));

const REPLAY_RESUME_SNAPSHOT_STORAGE_KEY = '@APLUS_REPLAY_RESUME_SNAPSHOT_V3';

const LIVE_MATCH_SNAPSHOT_STORAGE_KEY = '@APLUS_LIVE_MATCH_SNAPSHOT_V1';

type LiveMatchSnapshot = ReplayResumeSnapshot & {
  configSignature?: string;
  aplusLiveMatchIdentity?: string;
};

const getAplusLiveMatchIdentityFromSettings = (settings: any) => {
  const config = settings?.aplusLiveScore;
  const matchId = String(config?.matchId || '').trim();

  if (!matchId) {
    return '';
  }

  return [
    String(config?.tournamentId || '').trim(),
    matchId,
    String(config?.matchNumber || config?.matchCode || '').trim(),
  ].join('|');
};

const buildGameSettingsSignature = (settings: any) => {
  try {
    return JSON.stringify({
      category: settings?.category ?? null,
      mode: settings?.mode ?? null,
      playerNumber: settings?.players?.playerNumber ?? null,
      goal: settings?.players?.goal?.goal ?? null,
      snookerSetTarget:
        settings?.players?.goal?.snookerSetTarget ??
        settings?.players?.goal?.framePointTarget ??
        null,
      aplusLiveMatchIdentity: getAplusLiveMatchIdentityFromSettings(settings),
      playerNames: (settings?.players?.playingPlayers || [])
        .slice(0, 2)
        .map((player: any) => ({
          name: String(player?.name || ''),
          countryCode: String(player?.countryCode || player?.flag || ''),
        })),
    });
  } catch (_error) {
    return undefined;
  }
};

const setLiveMatchSnapshotSync = (snapshot: LiveMatchSnapshot | null) => {
  (globalThis as any).__APLUS_LIVE_MATCH_SNAPSHOT__ = snapshot
    ? cloneReplayValue(snapshot)
    : null;
};

const getLiveMatchSnapshotSync = (): LiveMatchSnapshot | null => {
  const snapshot = (globalThis as any).__APLUS_LIVE_MATCH_SNAPSHOT__;
  return snapshot ? cloneReplayValue(snapshot) : null;
};

const clearPersistedLiveMatchSnapshot = async () => {
  try {
    await AsyncStorage.removeItem(LIVE_MATCH_SNAPSHOT_STORAGE_KEY);
  } catch (error) {
    console.log('[Live Match] Failed to clear persisted snapshot:', error);
  }
};

const setLiveMatchSnapshot = async (snapshot: LiveMatchSnapshot | null) => {
  const normalizedSnapshot = snapshot ? cloneReplayValue(snapshot) : null;
  setLiveMatchSnapshotSync(normalizedSnapshot);

  if (!normalizedSnapshot) {
    await clearPersistedLiveMatchSnapshot();
  }
};

const getLiveMatchSnapshot = async (): Promise<LiveMatchSnapshot | null> => {
  const runtimeSnapshot = getLiveMatchSnapshotSync();
  return runtimeSnapshot ? cloneReplayValue(runtimeSnapshot) : null;
};

const isLiveMatchSnapshotUsable = (
  snapshot: LiveMatchSnapshot | null,
  expectedConfigSignature?: string,
  expectedAplusLiveMatchIdentity = '',
) => {
  if (!snapshot?.playerSettings) {
    return false;
  }

  if (snapshot.savedAt && Date.now() - snapshot.savedAt > 6 * 60 * 60 * 1000) {
    return false;
  }

  if (expectedAplusLiveMatchIdentity) {
    if (snapshot.aplusLiveMatchIdentity !== expectedAplusLiveMatchIdentity) {
      return false;
    }
  } else if (snapshot.aplusLiveMatchIdentity) {
    return false;
  }

  if (
    expectedConfigSignature &&
    snapshot.configSignature &&
    snapshot.configSignature !== expectedConfigSignature
  ) {
    return false;
  }

  return true;
};

const cloneReplayValue = <T,>(value: T): T => {
  if (value == null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (_error) {
    return value;
  }
};

const getSnookerSetScore = (player?: Player | any) => {
  const value =
    player?.snooker?.setScore ?? player?.setScore ?? player?.frameScore ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
};

const getSnookerSetScoreSnapshot = (settings?: PlayerSettings | null) => {
  const players = Array.isArray(settings?.playingPlayers)
    ? settings!.playingPlayers
    : [];

  return players.map(player => getSnookerSetScore(player));
};

const withSnookerSetScore = (player: Player, setScore: number): Player => ({
  ...player,
  setScore,
  frameScore: setScore,
  snooker: {
    ...(player as any)?.snooker,
    setScore,
  },
});

const getFinalScoreSnapshot = (settings?: PlayerSettings | null) => {
  const players = Array.isArray(settings?.playingPlayers)
    ? settings!.playingPlayers
    : [];

  return players.map((player: any) =>
    Number(player?.totalPoint ?? player?.point ?? 0),
  );
};

const getScoreSnapshotTotal = (score?: number[] | null) =>
  Array.isArray(score)
    ? score.reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;

const getScoreSnapshotFromPlayerSettings = (settings?: PlayerSettings | null) =>
  getFinalScoreSnapshot(settings);

const deriveWinnerPlayerFromScore = (
  settings?: PlayerSettings | null,
  finalScore?: number[],
): Player | undefined => {
  const players = Array.isArray(settings?.playingPlayers)
    ? settings!.playingPlayers
    : [];

  if (!players.length) {
    return undefined;
  }

  const scoreSource =
    Array.isArray(finalScore) && finalScore.length
      ? finalScore
      : getFinalScoreSnapshot(settings);

  if (!Array.isArray(scoreSource) || !scoreSource.length) {
    return players[0];
  }

  let winnerIndex = 0;
  let winnerScore = Number(scoreSource[0] || 0);

  scoreSource.forEach((score, index) => {
    if (Number(score || 0) > winnerScore) {
      winnerIndex = index;
      winnerScore = Number(score || 0);
    }
  });

  return players[winnerIndex];
};

const deriveWinnerNameFromScore = (
  settings?: PlayerSettings | null,
  finalScore?: number[],
) => deriveWinnerPlayerFromScore(settings, finalScore)?.name;

const getTargetGoalValue = (settings?: GameSettings | null) => {
  const rawGoal = settings?.players?.goal?.goal;
  const goal = Number(rawGoal || 0);
  return Number.isFinite(goal) && goal > 0 ? goal : 0;
};

const getSnookerSetPointTarget = (
  gameSettings?: GameSettings | null,
  playerSettings?: PlayerSettings | null,
) => {
  const rawTarget =
    (gameSettings as any)?.players?.goal?.snookerSetTarget ??
    (gameSettings as any)?.players?.goal?.framePointTarget ??
    (playerSettings as any)?.goal?.snookerSetTarget ??
    (playerSettings as any)?.goal?.framePointTarget ??
    75;
  const target = Number(rawTarget);
  return Number.isFinite(target) && target > 0 ? Math.round(target) : 75;
};

const clampScoreDeltaToGoal = (
  currentScore: number,
  requestedDelta: number,
  targetGoal: number,
) => {
  const safeCurrent = Number.isFinite(currentScore) ? currentScore : 0;
  const safeDelta = Number.isFinite(requestedDelta) ? requestedDelta : 0;

  if (safeDelta > 0 && targetGoal > 0) {
    return Math.min(targetGoal, safeCurrent + safeDelta) - safeCurrent;
  }

  if (safeDelta < 0) {
    return Math.max(0, safeCurrent + safeDelta) - safeCurrent;
  }

  return safeDelta;
};

const setReplayResumeSnapshotSync = (snapshot: ReplayResumeSnapshot | null) => {
  (globalThis as any).__APLUS_REPLAY_RESUME_SNAPSHOT__ = snapshot
    ? cloneReplayValue(snapshot)
    : null;
};

const getReplayResumeSnapshotSync = (): ReplayResumeSnapshot | null => {
  const snapshot = (globalThis as any).__APLUS_REPLAY_RESUME_SNAPSHOT__;
  return snapshot ? cloneReplayValue(snapshot) : null;
};

const setReplayReturnRequestSync = (request: ReplayReturnRequest | null) => {
  (globalThis as any).__APLUS_REPLAY_RETURN_REQUEST__ = request
    ? cloneReplayValue(request)
    : null;
};

const getReplayReturnRequestSync = (): ReplayReturnRequest | null => {
  const request = (globalThis as any).__APLUS_REPLAY_RETURN_REQUEST__;
  return request ? cloneReplayValue(request) : null;
};

type ActiveGameplaySession = {
  matchSessionId?: string;
  webcamFolderName?: string;
  savedAt?: number;
  source?: string;
  aplusLiveMatchIdentity?: string;
};

const ACTIVE_GAMEPLAY_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const setActiveGameplaySessionSync = (
  session: ActiveGameplaySession | null,
) => {
  (globalThis as any).__APLUS_ACTIVE_GAMEPLAY_SESSION__ = session
    ? cloneReplayValue({
        ...session,
        savedAt: session.savedAt || Date.now(),
      })
    : null;
};

const getActiveGameplaySessionSync = (): ActiveGameplaySession | null => {
  const session = (globalThis as any).__APLUS_ACTIVE_GAMEPLAY_SESSION__;
  return session ? cloneReplayValue(session) : null;
};

const clearActiveGameplaySessionSync = () => {
  setActiveGameplaySessionSync(null);
};

const isActiveGameplaySessionReusable = (
  session: ActiveGameplaySession | null,
  expectedAplusLiveMatchIdentity = '',
) => {
  if (!session?.matchSessionId || !session?.webcamFolderName) {
    return false;
  }

  if (
    session.savedAt &&
    Date.now() - session.savedAt > ACTIVE_GAMEPLAY_SESSION_MAX_AGE_MS
  ) {
    return false;
  }

  if (expectedAplusLiveMatchIdentity) {
    return session.aplusLiveMatchIdentity === expectedAplusLiveMatchIdentity;
  }

  // Không cho trận thường/local tái dùng session của một trận Aplus trước đó.
  if (session.aplusLiveMatchIdentity) {
    return false;
  }

  return true;
};

const setReplayResumeSnapshot = async (
  snapshot: ReplayResumeSnapshot | null,
) => {
  const normalizedSnapshot = snapshot ? cloneReplayValue(snapshot) : null;
  setReplayResumeSnapshotSync(normalizedSnapshot);

  try {
    if (normalizedSnapshot) {
      await AsyncStorage.setItem(
        REPLAY_RESUME_SNAPSHOT_STORAGE_KEY,
        JSON.stringify(normalizedSnapshot),
      );
    } else {
      await AsyncStorage.removeItem(REPLAY_RESUME_SNAPSHOT_STORAGE_KEY);
    }
  } catch (error) {
    console.log('[Replay] Failed to persist resume snapshot:', error);
  }
};

const getReplayResumeSnapshot =
  async (): Promise<ReplayResumeSnapshot | null> => {
    const runtimeSnapshot = getReplayResumeSnapshotSync();
    if (runtimeSnapshot) {
      return runtimeSnapshot;
    }

    try {
      const rawSnapshot = await AsyncStorage.getItem(
        REPLAY_RESUME_SNAPSHOT_STORAGE_KEY,
      );

      if (!rawSnapshot) {
        return null;
      }

      const parsedSnapshot = JSON.parse(rawSnapshot) as ReplayResumeSnapshot;
      setReplayResumeSnapshotSync(parsedSnapshot);
      return cloneReplayValue(parsedSnapshot);
    } catch (error) {
      console.log('[Replay] Failed to load resume snapshot:', error);
      return null;
    }
  };

const isReplayResumeSnapshotReusable = (
  snapshot: ReplayResumeSnapshot | null,
) => {
  if (!snapshot?.webcamFolderName) {
    return false;
  }

  if (!snapshot.isPaused) {
    return false;
  }

  if (snapshot.savedAt && Date.now() - snapshot.savedAt > 30 * 60 * 1000) {
    return false;
  }

  return true;
};

const isReplayResumeSnapshotMatch = (
  snapshot: ReplayResumeSnapshot | null,
  expectedFolderName?: string | null,
  expectedMatchSessionId?: string | null,
  expectedAplusLiveMatchIdentity = '',
) => {
  if (!isReplayResumeSnapshotReusable(snapshot)) {
    return false;
  }

  if (expectedAplusLiveMatchIdentity) {
    if (snapshot?.aplusLiveMatchIdentity !== expectedAplusLiveMatchIdentity) {
      return false;
    }
  } else if (snapshot?.aplusLiveMatchIdentity) {
    return false;
  }

  if (
    expectedMatchSessionId &&
    snapshot?.matchSessionId &&
    snapshot.matchSessionId === expectedMatchSessionId
  ) {
    return true;
  }

  if (!expectedFolderName) {
    return true;
  }

  return expectedFolderName === snapshot.webcamFolderName;
};

const GamePlayViewModel = () => {
  const {language} = useContext(LanguageContext);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeParams = (route?.params || {}) as GameplayLiveRouteParams;
  const realm = useRealm();
  const dispatch = useDispatch();
  const {updateGameSettings} = useSelector((state: RootState) => state.UI.game);
  const {gameSettings: reduxGameSettings} = useSelector(
    (state: RootState) => state.game,
  );
  const routeGameSettings = routeParams.gameSettings;
  const gameSettings = useMemo(
    () => routeGameSettings ?? reduxGameSettings,
    [routeGameSettings, reduxGameSettings],
  );
  const selectedLivestreamPlatform = (normalizeGameplayLivestreamPlatform(
    routeParams.livestreamPlatform,
  ) ||
    normalizeGameplayLivestreamPlatform(
      (gameSettings as any)?.livestreamPlatform,
    ) ||
    null) as 'facebook' | 'youtube' | 'tiktok' | 'device' | null;
  const saveToDeviceWhileStreaming = Boolean(
    routeParams.saveToDeviceWhileStreaming ??
    (gameSettings as any)?.saveToDeviceWhileStreaming ??
    false,
  );
  const shouldUseYouTubeLive = selectedLivestreamPlatform === 'youtube';
  const shouldUseLocalRecordingOnly = selectedLivestreamPlatform !== 'youtube';
  const currentAplusLiveMatchIdentity = useMemo(
    () => getAplusLiveMatchIdentityFromSettings(gameSettings),
    [
      (gameSettings as any)?.aplusLiveScore?.tournamentId,
      (gameSettings as any)?.aplusLiveScore?.matchId,
      (gameSettings as any)?.aplusLiveScore?.matchNumber,
    ],
  );

  const gameSettingsSignature = useMemo(() => {
    return buildGameSettingsSignature(gameSettings);
  }, [
    gameSettings?.category,
    gameSettings?.mode,
    gameSettings?.players?.playerNumber,
    gameSettings?.players?.goal?.goal,
    (gameSettings as any)?.players?.goal?.snookerSetTarget,
    (gameSettings as any)?.players?.goal?.framePointTarget,
    currentAplusLiveMatchIdentity,
  ]);
  const currentGameplayModeCode = getGameplayModeCode(gameSettings);
  const currentGameplayModeLabel = getGameplayModeLogLabel(gameSettings);
  const isFastModeActive = isFastGameMode(gameSettings);
  const isQuickMatchModeActive = isQuickMatchGameMode(gameSettings);
  const videoPipelineEnabledForCurrentMode = shouldEnableVideoReplayForGameMode(gameSettings);
  const shouldSuppressMatchCountdown = shouldSuppressMatchCountdownForMode(gameSettings);
  const cameraRef = useRef<Camera>(null);
  const matchCountdownRef = useRef(null);
  const countdownBeepLastSecondRef = useRef<number | null>(null);
  const countdownBeepPreviousSecondRef = useRef<number | null>(null);
  const recordingRotateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartRetryRef = useRef<NodeJS.Timeout | null>(null);
  const restartAfterStopRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const isStoppingRecordingRef = useRef(false);
  const pendingStartRecordingRef = useRef(false);
  const lastRecordedVideoPathRef = useRef<string | undefined>(undefined);
  const replayCompletedSegmentsRef = useRef(0);
  const currentReplaySegmentIndexRef = useRef(0);
  const currentReplaySegmentStartTotalTimeRef = useRef(0);
  const currentReplaySegmentWallStartMsRef = useRef(0);
  const totalTimeRef = useRef(0);
  const totalTurnsRef = useRef(1);
  const playerSettingsRef = useRef<PlayerSettings | undefined>(undefined);
  const winnerRef = useRef<Player | undefined>(undefined);
  const activeMatchFolderNameRef = useRef<string | null>(null);
  const replayTimelineSignatureRef = useRef('');
  const lastLiveSnapshotSignatureRef = useRef('');
  const lastLiveSnapshotSyncAtRef = useRef(0);
  const lastReplayTimelineWriteSignatureRef = useRef('');
  const lastPruneCompletedSegmentsRef = useRef(0);
  const recordingSegmentDurationMsRef = useRef(RECORDING_SEGMENT_DURATION_MS);
  const maxReplayStorageBytesRef = useRef(MAX_REPLAY_STORAGE_BYTES);
  const rtspRecordingUrlsRef = useRef<string[]>([]);
  const rtspRecordingEnabledRef = useRef(false);
  const quickMatchRemoteStopRef = useRef<(() => void) | null>(null);
  const remoteHandlersRef = useRef({
    start: () => {},
    warmUp: () => {},
    stop: () => {},
    gameBreak: () => {},
    extension: () => {},
    timer: () => {},
    newGame: () => {},
    up: () => {},
    down: () => {},
    left: () => {},
    right: () => {},
  });
  const recordingFinishedResolverRef = useRef<
    ((videoPath?: string) => void) | null
  >(null);
  const recordingFinishedPromiseRef = useRef<Promise<
    string | undefined
  > | null>(null);
  const recordingFinalizePromiseRef = useRef<Promise<
    string | undefined
  > | null>(null);
  const varReplayPreparePromiseRef = useRef<Promise<PreparedVarReplayPayload | null> | null>(null);
  const varReplayPayloadRef = useRef<PreparedVarReplayPayload | null>(null);
  const isVarReplayReadyRef = useRef(false);
  const activeGameplayCameraSourceRef = useRef<GameplayCameraSourceKey>('unknown');
  const activeReplayKeyRef = useRef('');
  const replayStateByKeyRef = useRef<Record<string, ReplaySourceRuntimeState>>({});
  const varReplayPreparePromiseByKeyRef = useRef<Record<string, Promise<PreparedVarReplayPayload | null> | null>>({});
  const varReplayPayloadByKeyRef = useRef<Record<string, PreparedVarReplayPayload | null>>({});
  const isVarReplayReadyByKeyRef = useRef<Record<string, boolean>>({});
  const [isVarReplayPreparing, setIsVarReplayPreparing] = useState(false);
  const [isVarReplayReady, setIsVarReplayReady] = useState(false);
  const shouldStartRecordingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadReplayStorageSettings = async () => {
      try {
        const [segmentDurationMs, maxStorageBytes] = await Promise.all([
          getConfiguredRecordingSegmentDurationMs(),
          getConfiguredReplayStorageBytes(),
        ]);

        if (!mounted) {
          return;
        }

        recordingSegmentDurationMsRef.current = segmentDurationMs;
        maxReplayStorageBytesRef.current = maxStorageBytes;
        console.log('[ReplayConfig]', {segmentDurationMs, maxStorageBytes});
      } catch (error) {
        console.log('[ReplayConfig] load failed:', error);
      }
    };

    void loadReplayStorageSettings();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadRtspRecorderConfig = async () => {
      if (Platform.OS !== 'android') {
        return;
      }

      try {
        const config = await loadIpCameraConfig();
        const configured = isIpCameraConfigured(config);
        const configuredCandidates = configured
          ? buildRtspCameraCandidates(config)
          : [];
        const previewCandidates = Array.isArray(
          (globalThis as any).__APLUS_RTSP_CANDIDATES__,
        )
          ? ((globalThis as any).__APLUS_RTSP_CANDIDATES__ as string[])
          : [];
        const activePreviewUrl = String(
          (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ || '',
        ).trim();
        const candidates = Array.from(
          new Set(
            [
              activePreviewUrl,
              ...previewCandidates,
              ...configuredCandidates,
            ].filter(Boolean),
          ),
        );

        if (!mounted) {
          return;
        }

        rtspRecordingEnabledRef.current = configured && candidates.length > 0;
        rtspRecordingUrlsRef.current = candidates;
        console.log('[RTSPRecorder] config loaded', {
          enabled: rtspRecordingEnabledRef.current,
          candidateCount: candidates.length,
        });
      } catch (error) {
        console.log('[RTSPRecorder] config load failed:', error);
        rtspRecordingEnabledRef.current = false;
        rtspRecordingUrlsRef.current = [];
      }
    };

    void loadRtspRecorderConfig();

    return () => {
      mounted = false;
    };
  }, []);
  const pendingYouTubeNativeStartRef = useRef<{
    url: string;
    options: {
      width: number;
      height: number;
      fps: number;
      bitrate: number;
      audioBitrate: number;
      sampleRate: number;
      isStereo: boolean;
      cameraFacing: 'front' | 'back';
      sourceType: 'phone' | 'webcam';
      rotationDegrees: number;
    };
  } | null>(null);
  const activeYouTubeBroadcastIdRef = useRef<string>('');
  const isEndingGameRef = useRef(false);
  const endWinnerPromptDisplayedRef = useRef(false);
  const [isEndingGame, setIsEndingGame] = useState(false);
  const appliedReplayResumeSnapshotRef = useRef(false);
  const initializedGameStateRef = useRef(false);
  const initializedGameplayStateKeyRef = useRef('');
  const replayResumeSnapshotOnMount = getReplayResumeSnapshotSync();
  const replayReturnRequestOnMount = getReplayReturnRequestSync();
  const activeGameplaySessionOnMount = getActiveGameplaySessionSync();
  // Only Replay VAR return may restore a gameplay session. Normal exit creates a new match.
  const reusableReplayResumeSnapshotOnMount =
    replayResumeSnapshotOnMount?.restoreOnNextFocus &&
    isReplayResumeSnapshotMatch(
      replayResumeSnapshotOnMount,
      undefined,
      undefined,
      currentAplusLiveMatchIdentity,
    )
      ? replayResumeSnapshotOnMount
      : null;
  const reusableActiveGameplaySessionOnMount = null;
  const routeGameplaySessionKey = String(
    routeParams.gameplaySessionKey ||
      (gameSettings as any)?.gameplaySessionKey ||
      '',
  ).trim();

  const initialMatchSessionId =
    reusableReplayResumeSnapshotOnMount?.matchSessionId ||
    replayReturnRequestOnMount?.matchSessionId ||
    routeGameplaySessionKey ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const matchSessionIdRef = useRef(initialMatchSessionId);
  const currentGameplayStateKey =
    routeGameplaySessionKey ||
    currentAplusLiveMatchIdentity ||
    gameSettingsSignature ||
    'local-gameplay';
  const [isRecording, setIsRecording] = useState(false);
  const [poolBreakPlayerIndex, setPoolBreakPlayerIndex] = useState<number>(0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [totalTurns, setTotalTurns] = useState(1);
  const [totalTime, setTotalTime] = useState(0);
  const [countdownTime, setCountdownTime] = useState<number>(0);
  const [warmUpCount, setWarmUpCount] = useState<number>();
  const [warmUpCountdownTime, setWarmUpCountdownTime] = useState<number>();
  const quickMatchWarmUpTotalTurnsRef = useRef(0);
  const quickMatchWarmUpCurrentTurnRef = useRef(0);
  const [playerSettings, setPlayerSettingsState] = useState<PlayerSettings>();
  const setPlayerSettings = useCallback(
    (
      value:
        | PlayerSettings
        | undefined
        | ((
            previous: PlayerSettings | undefined,
          ) => PlayerSettings | undefined),
    ) => {
      const optimisticNext =
        typeof value === 'function'
          ? (
              value as (
                previous: PlayerSettings | undefined,
              ) => PlayerSettings | undefined
            )(playerSettingsRef.current)
          : value;
      playerSettingsRef.current = cloneReplayValue(optimisticNext);

      setPlayerSettingsState(previous => {
        const next =
          typeof value === 'function'
            ? (
                value as (
                  previous: PlayerSettings | undefined,
                ) => PlayerSettings | undefined
              )(previous)
            : value;
        playerSettingsRef.current = cloneReplayValue(next);
        return next;
      });
    },
    [],
  );
  const [winner, setWinner] = useState<Player>();
  const winnerAlertShownRef = useRef(false);
  const pendingNewGameAfterViolateRef = useRef(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [pool8FreeHole10Scores, setPool8FreeHole10Scores] = useState<number[]>([
    0, 0, 0, 0,
  ]);
  const [pool8FreeSetWinnerIndex, setPool8FreeSetWinnerIndex] = useState<
    number | null
  >(null);
  const [pool8Trackers, setPool8Trackers] = useState<Pool8Tracker[]>(
    buildDefaultPool8Trackers,
  );
  const [pool8SetWinnerIndex, setPool8SetWinnerIndex] = useState<number | null>(
    null,
  );
  const [cameraSessionNonce, setCameraSessionNonce] = useState(0);
  const replayReturnAtRef = useRef(0);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    totalTimeRef.current = totalTime;
  }, [totalTime]);

  useEffect(() => {
    totalTurnsRef.current = totalTurns;
  }, [totalTurns]);

  useEffect(() => {
    playerSettingsRef.current = cloneReplayValue(playerSettings);
  }, [playerSettings]);

  useEffect(() => {
    winnerRef.current = cloneReplayValue(winner);
  }, [winner]);

  useEffect(() => {
    if (!playerSettings) {
      return;
    }

    setPool8FreeHole10Scores(prev => {
      const next = Array.from(
        {length: Math.max(4, playerSettings.playingPlayers.length)},
        (_, index) => prev[index] || 0,
      );
      return next;
    });
  }, [playerSettings?.playingPlayers.length]);

  const clearRecordingStartRetry = useCallback(() => {
    if (recordingStartRetryRef.current) {
      clearInterval(recordingStartRetryRef.current);
      recordingStartRetryRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recordingRotateTimeoutRef.current) {
        clearTimeout(recordingRotateTimeoutRef.current);
      }
      clearRecordingStartRetry();
    };
  }, [clearRecordingStartRetry]);

  useEffect(() => {
    const unsubscribe = subscribeYouTubeNativeLiveState(event => {
      console.log('[YouTubeNativeLive]', event);
      if (event?.type === 'error' && event?.message) {
        if (
          event.message.includes('cameraId was null') ||
          event.message.includes('webcam USB') ||
          event.message.includes('Không tìm thấy camera')
        ) {
          pendingYouTubeNativeStartRef.current = null;
          shouldStartRecordingRef.current = false;
          pendingStartRecordingRef.current = false;
          setYoutubeLivePreparing(false);
          setYoutubeLivePreviewActive(false);
          setIsCameraReady(false);
          setIsStarted(false);
          setYouTubeNativeCameraLock(false);
          setYouTubeSourceLock(null);
        }
        setYoutubeLiveOverlay({
          visible: true,
          title: i18n.t('youtubeLiveErrorTitle'),
          message: event.message,
          checks: [],
        });
      }
    });

    return () => {
      unsubscribe();
      void stopYouTubeNativeLive();
    };
  }, [language]);

  const readYouTubeVisibilityFromStorage =
    useCallback(async (): Promise<Visibility> => {
      try {
        const raw = await AsyncStorage.getItem(LIVESTREAM_ACCOUNT_STORAGE_KEY);
        if (!raw) {
          return 'public';
        }

        const parsed = JSON.parse(raw) as StorageShape;
        const visibility = parsed?.youtube?.visibility;

        if (
          visibility === 'public' ||
          visibility === 'private' ||
          visibility === 'unlisted'
        ) {
          return visibility;
        }

        return 'public';
      } catch (_error) {
        return 'public';
      }
    }, []);

  const routeWebcamFolderName =
    gameSettings?.webcamFolderName != null
      ? String(gameSettings?.webcamFolderName)
      : undefined;
  const now =
    reusableReplayResumeSnapshotOnMount?.webcamFolderName ||
    replayReturnRequestOnMount?.webcamFolderName ||
    routeWebcamFolderName ||
    Date.now().toString();

  const [webcamFolderName, setWebcamFolderName] = useState<string>(String(now));

  useEffect(() => {
    let mounted = true;

    replayCompletedSegmentsRef.current = 0;
    currentReplaySegmentIndexRef.current = 0;
    currentReplaySegmentStartTotalTimeRef.current = 0;
    currentReplaySegmentWallStartMsRef.current = 0;
    replayTimelineSignatureRef.current = '';
    lastPruneCompletedSegmentsRef.current = 0;

    if (!webcamFolderName) {
      return () => {
        mounted = false;
      };
    }

    const restoredExistingMatchSession = Boolean(
      (reusableReplayResumeSnapshotOnMount?.matchSessionId &&
        reusableReplayResumeSnapshotOnMount.matchSessionId ===
          matchSessionIdRef.current) ||
      (replayReturnRequestOnMount?.matchSessionId &&
        replayReturnRequestOnMount.matchSessionId ===
          matchSessionIdRef.current) ||
      false,
    );

    setActiveGameplaySessionSync({
      matchSessionId: matchSessionIdRef.current,
      webcamFolderName,
      savedAt: Date.now(),
      source: restoredExistingMatchSession
        ? 'restore-existing-session'
        : 'gameplay-active',
      aplusLiveMatchIdentity: currentAplusLiveMatchIdentity || undefined,
    });

    if (!activeMatchFolderNameRef.current) {
      activeMatchFolderNameRef.current = webcamFolderName;
      console.log('[MatchSession]', {
        event: restoredExistingMatchSession ? 'reuseMatchId' : 'createMatchId',
        activeMatchId: matchSessionIdRef.current,
        webcamFolderName,
        reasonIfCreateNew: restoredExistingMatchSession
          ? 'restored existing gameplay session; no new match id created'
          : 'initial gameplay session folder',
      });
      if (!restoredExistingMatchSession) {
        console.log(
          `[SessionLifecycle] new-session-created matchSessionId=${matchSessionIdRef.current}`,
        );
      }
    } else if (activeMatchFolderNameRef.current !== webcamFolderName) {
      console.log('[MatchSession]', {
        event: 'reuseMatchId',
        activeMatchId: matchSessionIdRef.current,
        webcamFolderName,
        previousWebcamFolderName: activeMatchFolderNameRef.current,
        reasonIfCreateNew:
          'webcamFolderName state changed; existing recorder session remains guarded',
      });
      activeMatchFolderNameRef.current = webcamFolderName;
    } else {
      console.log('[MatchSession]', {
        event: 'reuseMatchId',
        activeMatchId: matchSessionIdRef.current,
        webcamFolderName,
      });
    }

    void (async () => {
      try {
        await cleanupBrokenReplayFiles(webcamFolderName);
        const existingFiles = await listReplayFiles(webcamFolderName, {
          mode: 'var',
          source: getLockedGameplayCameraSource(),
        });
        const nextSegmentIndex =
          await getNextReplaySegmentIndex(webcamFolderName);
        if (!mounted) {
          return;
        }

        replayCompletedSegmentsRef.current = nextSegmentIndex;
        currentReplaySegmentIndexRef.current = nextSegmentIndex;
      } catch (error) {
        console.log('[ReplayTimeline] load existing segments failed:', error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [webcamFolderName]);

  const [isStarted, setIsStarted] = useState(false);

  type YouTubeLiveOverlayState = {
    visible: boolean;
    title: string;
    message: string;
    checks: YouTubeEligibilityCheck[];
  };

  const [youtubeLiveOverlay, setYoutubeLiveOverlay] =
    useState<YouTubeLiveOverlayState | null>(null);
  const [youtubeLivePreviewActive, setYoutubeLivePreviewActive] =
    useState(false);
  const [youtubeLivePreparing, setYoutubeLivePreparing] = useState(false);
  const [youtubeNativeStartNonce, setYoutubeNativeStartNonce] = useState(0);
  const youtubeLiveNativeMode =
    youtubeLivePreviewActive || youtubeLivePreparing;

  useEffect(() => {
    setYouTubeNativeCameraLock(youtubeLiveNativeMode);

    if (!youtubeLiveNativeMode) {
      setYouTubeSourceLock(null);
    }

    return () => {
      setYouTubeNativeCameraLock(false);
      setYouTubeSourceLock(null);
    };
  }, [youtubeLiveNativeMode]);

  useEffect(() => {
    if (shouldUseYouTubeLive) {
      return;
    }

    pendingYouTubeNativeStartRef.current = null;
    setYoutubeLivePreparing(false);
    setYoutubeLivePreviewActive(false);
    setYouTubeNativeCameraLock(false);
    setYouTubeSourceLock(null);
  }, [shouldUseYouTubeLive]);

  useEffect(() => {
    if (!youtubeLiveNativeMode || !isCameraReady) {
      return;
    }

    const pending = pendingYouTubeNativeStartRef.current;
    if (!pending) {
      return;
    }

    pendingYouTubeNativeStartRef.current = null;

    let cancelled = false;
    const timer = setTimeout(() => {
      const startNativeLive = async () => {
        try {
          if (cancelled) {
            return;
          }

          console.log('[YouTube Live] native start requested');
          console.log('[YouTube Live] validating params', {
            hasUrl: Boolean(pending.url),
            hasStreamKey: Boolean(pending.url && pending.url.length > 24),
            cameraReady: isCameraReady,
            width: pending.options.width,
            height: pending.options.height,
            sourceType: pending.options.sourceType,
            cameraFacing: pending.options.cameraFacing,
          });
          await startYouTubeNativeLive(pending.url, pending.options);
        } catch (error: any) {
          console.log('[YouTube Live] native start failed:', error);
          const activeYouTubeBroadcastId = activeYouTubeBroadcastIdRef.current;
          activeYouTubeBroadcastIdRef.current = '';
          if (activeYouTubeBroadcastId) {
            try {
              await stopYouTubeLiveSession(activeYouTubeBroadcastId);
              console.log(
                '[YouTube Live] stopped broadcast after native start failed:',
                activeYouTubeBroadcastId,
              );
            } catch (youtubeStopError) {
              console.log(
                '[YouTube Live] stop after native start failed:',
                youtubeStopError,
              );
            }
          }
          pendingYouTubeNativeStartRef.current = null;
          setYoutubeLivePreparing(false);
          setYoutubeLivePreviewActive(false);
          setIsCameraReady(false);
          setIsStarted(false);
          setYouTubeNativeCameraLock(false);
          setYouTubeSourceLock(null);
          setYoutubeLiveOverlay({
            visible: true,
            title: i18n.t('youtubeLiveErrorTitle'),
            message: error?.message || i18n.t('youtubeLiveCannotStart'),
            checks: [],
          });
        }
      };

      void startNativeLive();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isCameraReady, youtubeLiveNativeMode, youtubeNativeStartNonce]);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMatchPaused, setIsMatchPaused] = useState<boolean>(false);

  const logRecorderFlow = useCallback(
    (event: string, payload: Record<string, any> = {}) => {
      recordDebugLog('RecorderFlow', event, {
        mode: currentGameplayModeLabel,
        rawMode: currentGameplayModeCode,
        videoPipelineEnabled: videoPipelineEnabledForCurrentMode,
        matchSessionId: matchSessionIdRef.current,
        webcamFolderName,
        isStarted,
        isPaused,
        isRecording: isRecordingRef.current,
        isStarting: isStartingRecordingRef.current,
        isStopping: isStoppingRecordingRef.current,
        segmentIndex: currentReplaySegmentIndexRef.current,
        cameraRefExists: Boolean(cameraRef.current),
        cameraReady: isCameraReady,
        activeBackend: String(
          (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ || '',
        ),
        recordingInfo: (cameraRef.current as any)?.getRecordingInfo?.(),
        ...payload,
      });
    },
    [
      currentGameplayModeCode,
      currentGameplayModeLabel,
      isCameraReady,
      isPaused,
      isStarted,
      videoPipelineEnabledForCurrentMode,
      webcamFolderName,
    ],
  );

  useEffect(() => {
    const payload = {
      currentMode: currentGameplayModeLabel,
      rawMode: currentGameplayModeCode,
      cameraEnabled: true,
      replayEnabled: videoPipelineEnabledForCurrentMode,
      historyEnabled: videoPipelineEnabledForCurrentMode,
      selectedLivestreamPlatform,
    };

    console.log(
      `[GameMode] currentMode=${payload.currentMode} rawMode=${payload.rawMode}`,
    );
    console.log(
      `[VideoPipeline] mode=${payload.currentMode} cameraEnabled=${payload.cameraEnabled} replayEnabled=${payload.replayEnabled} historyEnabled=${payload.historyEnabled}`,
      payload,
    );
    recordDebugLog('GameMode', 'mode-selected', payload);
    recordDebugLog('VideoPipeline', 'capabilities', payload);
  }, [
    currentGameplayModeCode,
    currentGameplayModeLabel,
    selectedLivestreamPlatform,
    videoPipelineEnabledForCurrentMode,
  ]);

  useEffect(() => {
    void clearRecordDebugLog();
    recordDebugLog('RecorderFlow', 'gameplay-mounted', {
      matchSessionId: matchSessionIdRef.current,
      webcamFolderName,
      cameraSource: String(
        (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ || '',
      ),
      cameraReady: isCameraReady,
      cameraRefExists: Boolean(cameraRef.current),
      debugLogPath: getRecordDebugLogPath(),
    });
    return () => {
      void cancelRtspSegmentRecording('gameplay-unmounted');
      recordDebugLog('RecorderFlow', 'gameplay-unmounted', {
        matchSessionId: matchSessionIdRef.current,
        webcamFolderName,
      });
    };
    // only on gameplay mount/unmount; other recorder events are logged separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getActiveCameraBackend = useCallback(() => {
    const globalBackend = String(
      (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ || '',
    ).trim();
    const controllerInfo = (cameraRef.current as any)?.getRecordingInfo?.();
    return String(controllerInfo?.backend || globalBackend || '').trim();
  }, []);

  const getActiveGameplayCameraSource = useCallback((): GameplayCameraSourceKey => {
    const controllerInfo = (cameraRef.current as any)?.getRecordingInfo?.();
    const activeBackend = getActiveCameraBackend();
    const sourceKind = getGlobalCameraSourceKind();
    const selectedMode = String((globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ || '').trim();
    const currentSource = String((globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ || '').trim();
    const activeRtspUrl = String((globalThis as any).__APLUS_ACTIVE_RTSP_URL__ || '').trim();
    const usbGameplayReady = (globalThis as any).__APLUS_USB_GAMEPLAY_READY__ === true;

    // RTSP wins even when an USB device is still plugged in. Device presence is
    // not an active source. This prevents RTSP replay from entering USB messages
    // or USB segment checks.
    if (
      sourceKind === 'rtsp' ||
      selectedMode === 'ip' ||
      activeBackend === 'rtsp' ||
      activeRtspUrl.length > 0
    ) {
      return 'rtsp';
    }

    if (
      Platform.OS === 'android' &&
      (
        sourceKind === 'usb' ||
        activeBackend === 'uvc' ||
        controllerInfo?.backend === 'uvc' ||
        controllerInfo?.source === 'external' ||
        selectedMode === 'usb' ||
        (currentSource === 'external' && usbGameplayReady)
      )
    ) {
      return 'usb';
    }

    return Platform.OS === 'android' || Platform.OS === 'ios' ? 'builtInCamera' : 'unknown';
  }, [getActiveCameraBackend]);

  const getLockedGameplayCameraSource = useCallback((): GameplayCameraSourceKey => {
    const lockedSource = activeGameplayCameraSourceRef.current;
    if (lockedSource && lockedSource !== 'unknown') {
      return lockedSource;
    }
    return getActiveGameplayCameraSource();
  }, [getActiveGameplayCameraSource]);

  const getReplayKeyForSource = useCallback((source?: GameplayCameraSourceKey) => {
    const resolvedSource = source || getActiveGameplayCameraSource();
    return `${matchSessionIdRef.current || webcamFolderName}:${resolvedSource}`;
  }, [getActiveGameplayCameraSource, webcamFolderName]);

  const ensureReplayRuntimeState = useCallback((source?: GameplayCameraSourceKey) => {
    const resolvedSource = source || getActiveGameplayCameraSource();
    const key = getReplayKeyForSource(resolvedSource);
    const existing = replayStateByKeyRef.current[key];
    if (existing) {
      return existing;
    }

    const nextState: ReplaySourceRuntimeState = {
      source: resolvedSource,
      matchId: webcamFolderName,
      sessionId: matchSessionIdRef.current,
      recordingStarted: false,
      recorderReady: false,
      replayReady: false,
      segmentRegistry: [],
      bufferStartAt: 0,
      folderPath: `ReplayBuffer/${webcamFolderName}/${resolvedSource}`,
    };
    replayStateByKeyRef.current[key] = nextState;
    return nextState;
  }, [getActiveGameplayCameraSource, getReplayKeyForSource, webcamFolderName]);

  const setActiveReplaySource = useCallback((source?: GameplayCameraSourceKey) => {
    const resolvedSource = source || getLockedGameplayCameraSource();
    const key = getReplayKeyForSource(resolvedSource);
    activeGameplayCameraSourceRef.current = resolvedSource;
    activeReplayKeyRef.current = key;
    ensureReplayRuntimeState(resolvedSource);
    recordDebugLog('CameraSource', `active=${resolvedSource} matchId=${webcamFolderName}`, {
      active: resolvedSource,
      matchId: webcamFolderName,
      matchSessionId: matchSessionIdRef.current,
      key,
    });
    return {source: resolvedSource, key};
  }, [ensureReplayRuntimeState, getLockedGameplayCameraSource, getReplayKeyForSource, webcamFolderName]);

  const isUsbWebcamGameplaySourceActive = useCallback(() => {
    return getLockedGameplayCameraSource() === 'usb';
  }, [getLockedGameplayCameraSource]);

  const shouldUseRtspRecorderNow = useCallback(() => {
    const activeBackend = getActiveCameraBackend();
    const activeRtspUrl = String(
      (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ || '',
    ).trim();
    const selectedMode = String((globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ || '').trim();
    const sourceKind = getGlobalCameraSourceKind();

    if (Platform.OS !== 'android' || activeRtspUrl.length === 0) {
      return false;
    }

    if (selectedMode === 'usb' && sourceKind === 'usb' && activeBackend !== 'rtsp') {
      recordDebugLog('CameraSource', 'fallback-blocked', {
        from: 'usb',
        to: 'rtsp-recorder',
        reason: 'active gameplay source is usb',
      });
      return false;
    }

    return activeBackend === 'rtsp' || selectedMode === 'ip' || sourceKind === 'rtsp';
  }, [getActiveCameraBackend]);

  const inspectRecordedVideoFile = useCallback(async (path?: string | null, source?: string | null) => {
    if (!path) {
      return {exists: false, size: 0, usable: false};
    }

    try {
      const exists = await RNFS.exists(path);
      if (!exists) {
        return {exists: false, size: 0, usable: false};
      }

      const stat = await RNFS.stat(path);
      const size = Number(stat?.size || 0);
      return {
        exists: true,
        size,
        usable: size >= getMinValidRecordingBytesForSource(source),
        minValidBytes: getMinValidRecordingBytesForSource(source),
      };
    } catch (error) {
      recordDebugLog('RecorderFlow', 'file-stat-failed', {
        path,
        error: String((error as any)?.message || error),
      });
      return {exists: false, size: 0, usable: false};
    }
  }, []);

  const [gameBreakEnabled, setGameBreakEnabled] = useState<boolean>(false);
  const [poolBreakEnabled, setPoolBreakEnabled] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === 'active',
  );
  const [proModeEnabled, setProModeEnabled] = useState(
    !isPoolGame(gameSettings?.category) &&
      !isSnookerGame(gameSettings?.category) &&
      gameSettings?.mode?.mode !== 'fast' &&
      gameSettings?.mode?.mode !== 'quick_match',
  );

  const applyReplayResumeSnapshot = useCallback(
    (snapshot: ReplayResumeSnapshot) => {
      clearInterval(countdownInterval);
      clearInterval(warmUpCountdownInterval);

      const scoreBeforeReplayRestore = getScoreSnapshotFromPlayerSettings(
        playerSettingsRef.current,
      );
      playerSettingsRef.current = cloneReplayValue(snapshot.playerSettings);
      winnerRef.current = cloneReplayValue(snapshot.winner);

      console.log('[ReplayReturnFlow]', {
        event: 'closeReplay',
        scoreBeforeReplay: getScoreSnapshotFromPlayerSettings(
          snapshot.playerSettings,
        ),
        scoreAfterReplayClose: getScoreSnapshotFromPlayerSettings(
          snapshot.playerSettings,
        ),
        scoreBeforeRestore: scoreBeforeReplayRestore,
        matchIdBeforeReplay: snapshot.matchSessionId,
        matchIdAfterReplayClose: snapshot.matchSessionId,
        historyPathBeforeReplay: lastRecordedVideoPathRef.current,
        historyPathAfterReplayClose: lastRecordedVideoPathRef.current,
        replayCleanupTouchedHistory: false,
        replayCleanupTouchedScore: false,
      });

      setWebcamFolderName(snapshot.webcamFolderName || Date.now().toString());
      setCurrentPlayerIndex(snapshot.currentPlayerIndex ?? 0);
      setPoolBreakPlayerIndex(snapshot.poolBreakPlayerIndex ?? 0);
      setTotalTurns(snapshot.totalTurns ?? 1);
      setTotalTime(snapshot.totalTime ?? 0);
      setCountdownTime(snapshot.countdownTime ?? 0);
      setWarmUpCount(snapshot.warmUpCount);
      setWarmUpCountdownTime(snapshot.warmUpCountdownTime);
      setPlayerSettings(cloneReplayValue(snapshot.playerSettings));
      setWinner(cloneReplayValue(snapshot.winner));
      const restoredMatchCountdownPaused = Boolean(
        snapshot.matchCountdownPausedBeforeReplay ?? snapshot.isMatchPaused,
      );
      setIsStarted(!!snapshot.isStarted);
      setIsPaused(!!snapshot.isPaused);
      setIsMatchPaused(restoredMatchCountdownPaused);
      setGameBreakEnabled(!!snapshot.gameBreakEnabled);
      setPoolBreakEnabled(!!snapshot.poolBreakEnabled);
      setSoundEnabled(
        snapshot.soundEnabled == null ? true : !!snapshot.soundEnabled,
      );
      setProModeEnabled(!!snapshot.proModeEnabled);

      if (snapshot.matchSessionId) {
        matchSessionIdRef.current = snapshot.matchSessionId;
      }

      if (snapshot.cameraSource) {
        activeGameplayCameraSourceRef.current = snapshot.cameraSource;
        const restoredReplayKey = getReplayKeyForSource(snapshot.cameraSource);
        activeReplayKeyRef.current = restoredReplayKey;
        ensureReplayRuntimeState(snapshot.cameraSource);
        recordDebugLog('GameplaySession', 'restore-source sessionId=' + String(snapshot.matchSessionId || matchSessionIdRef.current), {
          sessionId: snapshot.matchSessionId || matchSessionIdRef.current,
          webcamFolderName: snapshot.webcamFolderName || webcamFolderName,
          source: snapshot.cameraSource,
          replayKey: restoredReplayKey,
        });
      }

      setActiveGameplaySessionSync({
        matchSessionId: snapshot.matchSessionId || matchSessionIdRef.current,
        webcamFolderName: snapshot.webcamFolderName || webcamFolderName,
        savedAt: Date.now(),
        source: 'replay-restore',
        aplusLiveMatchIdentity:
          snapshot.aplusLiveMatchIdentity ||
          currentAplusLiveMatchIdentity ||
          undefined,
      });

      appliedReplayResumeSnapshotRef.current = true;
      initializedGameStateRef.current = true;
      initializedGameplayStateKeyRef.current =
        snapshot.aplusLiveMatchIdentity || currentGameplayStateKey;
    },
    [currentAplusLiveMatchIdentity, currentGameplayStateKey, ensureReplayRuntimeState, getReplayKeyForSource, webcamFolderName],
  );

  const tryRestoreReplayResumeSnapshot = useCallback(async () => {
    const snapshot = await getReplayResumeSnapshot();
    const returnRequest = getReplayReturnRequestSync();
    const expectedFolderName =
      webcamFolderName || gameSettings?.webcamFolderName;
    const expectedMatchSessionId =
      returnRequest?.matchSessionId || matchSessionIdRef.current;

    const shouldRestoreBecausePlaybackIsReturning = Boolean(
      snapshot?.restoreOnNextFocus && isReplayResumeSnapshotReusable(snapshot),
    );
    const shouldForceRestore = Boolean(
      shouldRestoreBecausePlaybackIsReturning ||
      (returnRequest &&
        snapshot &&
        isReplayResumeSnapshotReusable(snapshot) &&
        ((returnRequest.matchSessionId &&
          snapshot.matchSessionId === returnRequest.matchSessionId) ||
          (returnRequest.webcamFolderName &&
            snapshot.webcamFolderName === returnRequest.webcamFolderName))),
    );

    if (!shouldForceRestore && !snapshot?.restoreOnNextFocus) {
      return false;
    }

    if (
      !shouldForceRestore &&
      !isReplayResumeSnapshotMatch(
        snapshot,
        expectedFolderName,
        expectedMatchSessionId,
        currentAplusLiveMatchIdentity,
      )
    ) {
      return false;
    }

    // Kể cả luồng replay return có yêu cầu restore, không bao giờ cho snapshot
    // của trận Aplus khác ghi đè vào trận đang mở. Tuy nhiên, khi Playback vừa
    // đặt ReplayReturnRequest khớp đúng matchSession/webcamFolderName thì đây là
    // hành động quay lại replay có chủ đích; không được reject snapshot chỉ vì
    // bản cũ thiếu aplusLiveMatchIdentity.
    const explicitReplayReturnMatches = Boolean(
      returnRequest &&
        snapshot &&
        isReplayResumeSnapshotReusable(snapshot) &&
        ((returnRequest.matchSessionId &&
          snapshot.matchSessionId === returnRequest.matchSessionId) ||
          (returnRequest.webcamFolderName &&
            snapshot.webcamFolderName === returnRequest.webcamFolderName)),
    );

    if (currentAplusLiveMatchIdentity) {
      if (
        snapshot?.aplusLiveMatchIdentity &&
        snapshot.aplusLiveMatchIdentity !== currentAplusLiveMatchIdentity &&
        !explicitReplayReturnMatches
      ) {
        return false;
      }
    } else if (snapshot?.aplusLiveMatchIdentity && !explicitReplayReturnMatches) {
      return false;
    }

    console.log(
      '[Replay] Khôi phục trận đang tạm dừng:',
      snapshot?.matchSessionId,
      snapshot?.webcamFolderName,
    );

    applyReplayResumeSnapshot(snapshot!);
    setReplayReturnRequestSync(null);

    const restoredSource = snapshot?.cameraSource || getLockedGameplayCameraSource();
    const restoredSessionId = snapshot?.matchSessionId || matchSessionIdRef.current;
    recordDebugLog('GameplaySession', 'close-replay sessionId=' + String(restoredSessionId), {
      sessionId: restoredSessionId,
      webcamFolderName: snapshot?.webcamFolderName || webcamFolderName,
      source: restoredSource,
    });
    recordDebugLog('GameplaySession', 'resume sessionId=' + String(restoredSessionId), {
      sessionId: restoredSessionId,
      webcamFolderName: snapshot?.webcamFolderName || webcamFolderName,
      source: restoredSource,
      preserveState: true,
    });
    recordDebugLog('GameplaySession', 'stateAfterResume started=' + String(!!snapshot?.isStarted) + ' score=' + JSON.stringify(getScoreSnapshotFromPlayerSettings(snapshot?.playerSettings)) + ' timer=' + String(snapshot?.totalTime) + ' turn=' + String(snapshot?.totalTurns), {
      sessionId: restoredSessionId,
      webcamFolderName: snapshot?.webcamFolderName || webcamFolderName,
      source: restoredSource,
      started: !!snapshot?.isStarted,
      paused: !!snapshot?.isPaused,
      matchCountdownPaused: Boolean(snapshot?.matchCountdownPausedBeforeReplay ?? snapshot?.isMatchPaused),
      score: getScoreSnapshotFromPlayerSettings(snapshot?.playerSettings),
      timer: snapshot?.totalTime,
      turn: snapshot?.totalTurns,
    });

    replayReturnAtRef.current = Date.now();
    if (restoredSource === 'usb') {
      // Do not remount the UVC native view on Replay VAR return.  Remounting the
      // USB surface can look like the match has reset and can restart the camera
      // session.  Keep the gameplay/session state and native preview stable.
      recordDebugLog('USBSession', 'reuse reason=replay-return', {
        sessionId: restoredSessionId,
        webcamFolderName: snapshot?.webcamFolderName || webcamFolderName,
      });
    } else {
      setIsCameraReady(false);
      setCameraSessionNonce(value => value + 1);
    }

    // Giữ lại snapshot nhưng tắt auto-restore để tránh focus lại là ghi đè state lần nữa.
    await setReplayResumeSnapshot({
      ...snapshot!,
      aplusLiveMatchIdentity:
        snapshot?.aplusLiveMatchIdentity ||
        currentAplusLiveMatchIdentity ||
        undefined,
      cameraSource: restoredSource,
      restoreOnNextFocus: false,
    });

    return true;
  }, [
    applyReplayResumeSnapshot,
    gameSettings?.webcamFolderName,
    getLockedGameplayCameraSource,
    webcamFolderName,
    currentAplusLiveMatchIdentity,
  ]);

  const buildLiveMatchSnapshot = useCallback((): LiveMatchSnapshot | null => {
    if (!playerSettings || !gameSettingsSignature) {
      return null;
    }

    return {
      matchSessionId: matchSessionIdRef.current,
      webcamFolderName,
      currentPlayerIndex,
      poolBreakPlayerIndex,
      totalTurns,
      totalTime,
      countdownTime,
      warmUpCount,
      warmUpCountdownTime,
      playerSettings: cloneReplayValue(playerSettings),
      winner: cloneReplayValue(winner),
      isStarted,
      isPaused,
      isMatchPaused,
      matchCountdownPausedBeforeReplay: isMatchPaused,
      gameBreakEnabled,
      poolBreakEnabled,
      soundEnabled,
      proModeEnabled,
      savedAt: Date.now(),
      configSignature: gameSettingsSignature,
      aplusLiveMatchIdentity: currentAplusLiveMatchIdentity || undefined,
    };
  }, [
    countdownTime,
    currentPlayerIndex,
    gameBreakEnabled,
    gameSettingsSignature,
    currentAplusLiveMatchIdentity,
    isMatchPaused,
    isPaused,
    isStarted,
    playerSettings,
    poolBreakEnabled,
    poolBreakPlayerIndex,
    proModeEnabled,
    soundEnabled,
    totalTime,
    totalTurns,
    warmUpCount,
    warmUpCountdownTime,
    webcamFolderName,
    winner,
  ]);

  const tryRestoreLiveMatchSnapshot = useCallback(async () => {
    const snapshot = await getLiveMatchSnapshot();

    if (
      !isLiveMatchSnapshotUsable(
        snapshot,
        gameSettingsSignature,
        currentAplusLiveMatchIdentity,
      )
    ) {
      return false;
    }

    debugMatchRestoreLog(
      '[Live Match] Restoring active match snapshot:',
      snapshot?.matchSessionId,
      snapshot?.webcamFolderName,
    );

    applyReplayResumeSnapshot(snapshot!);

    const shouldResumeRecording = !!(
      snapshot?.isStarted &&
      !snapshot?.isPaused &&
      !youtubeLiveNativeMode
    );

    shouldStartRecordingRef.current = shouldUseLocalMatchRecording(
      shouldResumeRecording,
    );
    pendingStartRecordingRef.current = shouldStartRecordingRef.current;

    return true;
  }, [
    applyReplayResumeSnapshot,
    gameSettingsSignature,
    youtubeLiveNativeMode,
    currentAplusLiveMatchIdentity,
  ]);

  useEffect(() => {
    // Không cho build mới / mở app mới tự restore trận cũ từ storage hoặc runtime global.
    // Luồng "Xem lại -> Quay lại" vẫn dùng replay snapshot riêng.
    setLiveMatchSnapshotSync(null);
    clearActiveGameplaySessionSync();
    void clearPersistedLiveMatchSnapshot();
    console.log('[SessionLifecycle] clear-persisted-session');
    console.log('[SessionLifecycle] prevent-resume-old-session=true');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void tryRestoreReplayResumeSnapshot();

      return () => {
        const replaySnapshot = getReplayResumeSnapshotSync();
        const shouldKeepSessionForReplayReturn = Boolean(
          replaySnapshot?.restoreOnNextFocus &&
            replaySnapshot?.matchSessionId === matchSessionIdRef.current,
        );

        if (shouldKeepSessionForReplayReturn) {
          console.log('[SessionLifecycle] gameplay-exit skipped reason=replay-return');
          return;
        }

        console.log('[SessionLifecycle] gameplay-exit');
        console.log('[SessionLifecycle] stop-active-session');
        clearInterval(countdownInterval);
        clearInterval(warmUpCountdownInterval);
        shouldStartRecordingRef.current = false;
        pendingStartRecordingRef.current = false;
        pendingYouTubeNativeStartRef.current = null;
        clearActiveGameplaySessionSync();
        setLiveMatchSnapshotSync(null);
        void clearPersistedLiveMatchSnapshot();
        void setReplayResumeSnapshot(null);
        setReplayReturnRequestSync(null);
        void cancelRtspSegmentRecording('gameplay-exit');
        console.log('[SessionLifecycle] clear-persisted-session');
        console.log('[SessionLifecycle] prevent-resume-old-session=true');
      };
    }, [tryRestoreReplayResumeSnapshot]),
  );

  useEffect(() => {
    const snapshot = buildLiveMatchSnapshot();

    if (!snapshot) {
      return;
    }

    const leftPlayer = snapshot.playerSettings?.playingPlayers?.[0];
    const rightPlayer = snapshot.playerSettings?.playingPlayers?.[1];
    const signature = JSON.stringify({
      webcamFolderName: snapshot.webcamFolderName,
      currentPlayerIndex: snapshot.currentPlayerIndex,
      poolBreakPlayerIndex: snapshot.poolBreakPlayerIndex,
      totalTurns: snapshot.totalTurns,
      totalTimeBucket: Math.floor(Number(snapshot.totalTime || 0) / 5),
      countdownBucket: Math.floor(Number(snapshot.countdownTime || 0) / 5),
      warmUpBucket:
        snapshot.warmUpCountdownTime == null
          ? null
          : Math.floor(Number(snapshot.warmUpCountdownTime) / 5),
      leftScore: Number(leftPlayer?.totalPoint ?? 0),
      rightScore: Number(rightPlayer?.totalPoint ?? 0),
      leftCurrentPoint: Number(leftPlayer?.proMode?.currentPoint ?? 0),
      rightCurrentPoint: Number(rightPlayer?.proMode?.currentPoint ?? 0),
      winnerName: snapshot.winner?.name ?? null,
      isStarted: snapshot.isStarted,
      isPaused: snapshot.isPaused,
      isMatchPaused: snapshot.isMatchPaused,
      gameBreakEnabled: snapshot.gameBreakEnabled,
      poolBreakEnabled: snapshot.poolBreakEnabled,
      soundEnabled: snapshot.soundEnabled,
      proModeEnabled: snapshot.proModeEnabled,
    });

    const now = Date.now();
    if (
      signature === lastLiveSnapshotSignatureRef.current &&
      now - lastLiveSnapshotSyncAtRef.current < LIVE_SNAPSHOT_SYNC_MIN_MS
    ) {
      return;
    }

    lastLiveSnapshotSignatureRef.current = signature;
    lastLiveSnapshotSyncAtRef.current = now;
    setLiveMatchSnapshotSync(snapshot);

    if (Platform.OS === 'windows' && selectedLivestreamPlatform === 'youtube') {
      void updateWindowsFfmpegOverlay(
        createWindowsFfmpegSnapshotFromGameState({
          gameSettings,
          playerSettings: snapshot.playerSettings,
          currentPlayerIndex: snapshot.currentPlayerIndex,
          countdownTime: snapshot.countdownTime,
          totalTurns: snapshot.totalTurns,
        }),
      );
    }
  }, [buildLiveMatchSnapshot, gameSettings, selectedLivestreamPlatform]);

  // useEffect(() => {
  //      if(!hasPermission){
  //        requestPermission()
  //      }
  // }, [hasPermission]);

  useEffect(() => {
    const useTurnRemoteMode =
      isCaromGame(gameSettings?.category) ||
      isSnookerGame(gameSettings?.category);

    // Pool: NEW GAME still requires 3s hold before reset.
    // Carom/Snooker: NEW GAME is reused as "tăng lượt", so it fires immediately.
    RemoteControl.instance.setNewGameHoldRequired?.(!useTurnRemoteMode);

    const isQuickMatchRemoteMode = gameSettings?.mode?.mode === 'quick_match';
    const quickMatchWarmUpActive =
      isQuickMatchRemoteMode &&
      !isStarted &&
      ((typeof warmUpCountdownTime === 'number' && warmUpCountdownTime >= 0) ||
        Number(warmUpCount || 0) > 0);

    const handleQuickMatchPrimaryRemoteAction = () => {
      if (quickMatchWarmUpActive) {
        onWarmUp();
        return;
      }

      if (isStarted) {
        onPause();
        return;
      }

      void onStart();
    };

    remoteHandlersRef.current = {
      start: () => {
        console.log('[Remote][Start] toggle v13-quick-match-two-state', {
          isStarted,
          isPaused,
          isMatchPaused,
          isQuickMatchRemoteMode,
          quickMatchWarmUpActive,
        });

        if (isQuickMatchRemoteMode) {
          handleQuickMatchPrimaryRemoteAction();
          return;
        }

        if (quickMatchWarmUpActive) {
          onWarmUp();
          return;
        }

        if (isStarted) {
          onPause();
          return;
        }

        void onStart();
      },
      warmUp: isQuickMatchRemoteMode
        ? handleQuickMatchPrimaryRemoteAction
        : quickMatchWarmUpActive
          ? onWarmUp
          : warmUpCountdownTime
            ? onEndWarmUp
            : onWarmUp,
      stop: isQuickMatchRemoteMode
        ? () => {
            console.log('[Remote][QuickMatch] STOP -> end match');
            quickMatchRemoteStopRef.current?.();
          }
        : onToggleCountDown,
      gameBreak: isQuickMatchRemoteMode
        ? () => {
            console.log('[Remote][QuickMatch] BREAK ignored: quick match has no Break/New game button');
          }
        : useTurnRemoteMode
          ? () => {
              console.log('[Remote][TurnMode] BREAK -> decrease turns');
              setTotalTurns(prev => Math.max(1, (Number(prev) || 1) - 1));
            }
          : onPoolBreak,
      extension: isQuickMatchRemoteMode
        ? () => {
            console.log('[Remote][QuickMatch] EXTENSION ignored');
          }
        : onPressGiveMoreTime,
      timer: isQuickMatchRemoteMode
        ? () => {
            console.log('[Remote][QuickMatch] TIMER ignored');
          }
        : useTurnRemoteMode
          ? () => {
              console.log('[Remote][TurnMode] TIMER ignored');
            }
          : onResetTurn,
      newGame: isQuickMatchRemoteMode
        ? () => {
            console.log('[Remote][QuickMatch] NEW_GAME ignored: quick match has no Break/New game button');
          }
        : useTurnRemoteMode
          ? () => {
              console.log('[Remote][TurnMode] NEW_GAME -> increase turns');
              setTotalTurns(prev => Math.max(1, (Number(prev) || 0) + 1));
            }
          : onReset,
      up: () => onChangePlayerPoint(1, currentPlayerIndex, 0),
      down: () => onChangePlayerPoint(-1, currentPlayerIndex, 0),
      left: onEndTurn,
      right: onEndTurn,
    };
  }, [
    gameSettings?.category,
    gameSettings?.mode?.mode,
    isStarted,
    isEndingGame,
    isPaused,
    isMatchPaused,
    poolBreakEnabled,
    warmUpCount,
    warmUpCountdownTime,
    onPause,
    onStart,
    onEndWarmUp,
    onWarmUp,
    onQuickMatchWarmUpNext,
    onToggleCountDown,
    onPoolBreak,
    onPressGiveMoreTime,
    onResetTurn,
    onReset,
    onChangePlayerPoint,
    currentPlayerIndex,
    onEndTurn,
  ]);

  useEffect(() => {
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.START, () =>
      remoteHandlersRef.current.start(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.WARM_UP, () =>
      remoteHandlersRef.current.warmUp(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.STOP, () =>
      remoteHandlersRef.current.stop(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.BREAK, () =>
      remoteHandlersRef.current.gameBreak(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.EXTENSION, () =>
      remoteHandlersRef.current.extension(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.TIMER, () =>
      remoteHandlersRef.current.timer(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.NEW_GAME, () =>
      remoteHandlersRef.current.newGame(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.UP, () =>
      remoteHandlersRef.current.up(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.DOWN, () =>
      remoteHandlersRef.current.down(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.LEFT, () =>
      remoteHandlersRef.current.left(),
    );
    RemoteControl.instance.registerKeyEvents(RemoteControlKeys.RIGHT, () =>
      remoteHandlersRef.current.right(),
    );
  }, []);
  useEffect(() => {
    clearInterval(countdownInterval);
    clearInterval(warmUpCountdownInterval);

    if (!gameSettings) {
      return;
    }

    let cancelled = false;

    const initializeGameState = async () => {
      const alreadyInitializedForCurrentGame =
        initializedGameStateRef.current &&
        initializedGameplayStateKeyRef.current === currentGameplayStateKey;

      if (cancelled || alreadyInitializedForCurrentGame) {
        return;
      }

      const isSwitchingToDifferentGame = Boolean(
        initializedGameplayStateKeyRef.current &&
        initializedGameplayStateKeyRef.current !== currentGameplayStateKey,
      );

      if (isSwitchingToDifferentGame) {
        clearInterval(countdownInterval);
        clearInterval(warmUpCountdownInterval);
        setReplayResumeSnapshotSync(null);
        setReplayReturnRequestSync(null);
        setLiveMatchSnapshotSync(null);
        clearActiveGameplaySessionSync();
        aplusLiveScoreLastSignatureRef.current = '';
        aplusLiveScoreLastPushAtRef.current = 0;
        matchSessionIdRef.current =
          routeGameplaySessionKey ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        activeMatchFolderNameRef.current = null;
        setWebcamFolderName(Date.now().toString());
      }

      const restoredFromReplay = await tryRestoreReplayResumeSnapshot();
      if (cancelled || restoredFromReplay) {
        return;
      }

      // Do not restore an old active match after leaving gameplay.
      // Only the explicit Replay VAR return flow may restore state.
      console.log('[SessionLifecycle] prevent-resume-old-session=true');

      appliedReplayResumeSnapshotRef.current = false;
      initializedGameStateRef.current = true;
      initializedGameplayStateKeyRef.current = currentGameplayStateKey;

      setIsStarted(false);
      setIsPaused(false);
      setIsMatchPaused(false);
      setGameBreakEnabled(false);
      setWinner(undefined);
      setPool8FreeSetWinnerIndex(null);
      setTotalTurns(1);
      setTotalTime(0);
      setCurrentPlayerIndex(0);
      setPoolBreakPlayerIndex(0);

      setPlayerSettings(cloneReplayValue(gameSettings?.players));

      if (isQuickMatchGameMode(gameSettings) && gameSettings?.mode?.warmUpTime) {
        const warmupTotalTurns = getActiveGameplayPlayerCount(
          gameSettings,
          gameSettings?.players,
        );
        quickMatchWarmUpTotalTurnsRef.current = warmupTotalTurns;
        quickMatchWarmUpCurrentTurnRef.current = 0;
        setWarmUpCount(warmupTotalTurns);
        setWarmUpCountdownTime(undefined);
        console.log('[WarmupFlow] mode=fastCompetition playerCount=' + warmupTotalTurns);
        console.log('[WarmupFlow] warmupTotalTurns=' + warmupTotalTurns);
      } else if (
        gameSettings?.mode?.warmUpTime &&
        !isFastGameMode(gameSettings)
      ) {
        const warmupTotalTurns = getActiveGameplayPlayerCount(
          gameSettings,
          gameSettings?.players,
        );
        quickMatchWarmUpTotalTurnsRef.current = 0;
        quickMatchWarmUpCurrentTurnRef.current = 0;
        setWarmUpCount(warmupTotalTurns);
        setWarmUpCountdownTime(undefined);
      } else {
        quickMatchWarmUpTotalTurnsRef.current = 0;
        quickMatchWarmUpCurrentTurnRef.current = 0;
        setWarmUpCount(undefined);
        setWarmUpCountdownTime(undefined);
      }

      setCountdownTime(
        shouldSuppressMatchCountdownForMode(gameSettings)
          ? 0
          : gameSettings?.mode?.countdownTime || 0,
      );

      setPoolBreakEnabled(
        isPoolGame(gameSettings?.category) &&
          !isFastGameMode(gameSettings) &&
          !isQuickMatchGameMode(gameSettings) &&
          !isPool15FreeGame(gameSettings?.category) &&
          Boolean(gameSettings?.mode?.countdownTime),
      );

      if (isPool15OnlyGame(gameSettings?.category)) {
        setPool8Trackers(buildDefaultPool8Trackers());
        setPool8SetWinnerIndex(null);
      }
    };

    void initializeGameState();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameSettings,
    tryRestoreReplayResumeSnapshot,
    currentGameplayStateKey,
    routeGameplaySessionKey,
  ]);

  useEffect(() => {
    const activeCameraBackendForRecording = getActiveCameraBackend();
    const uvcPreviewCanRecord = isUsbWebcamGameplaySourceActive();
    const cameraReadyForRecording = isCameraReady || uvcPreviewCanRecord;

    if (!isStarted || isPaused || !cameraReadyForRecording) {
      if (Platform.OS === 'android' && activeCameraBackendForRecording === 'uvc') {
        logRecorderFlow('usb-start-waiting-camera-ready', {
          backend: activeCameraBackendForRecording,
          isCameraReady,
          cameraReadyForRecording,
          reason: 'uvc-preview-visible-but-parent-ready-flag-not-yet-true',
        });
      }
      clearRecordingStartRetry();
      return;
    }

    if (uvcPreviewCanRecord && !isCameraReady) {
      logRecorderFlow('usb-start-allowed-by-backend', {
        backend: activeCameraBackendForRecording,
        isCameraReady,
        reason: 'UVC native preview is active; do not block record/replay on parent ready flag',
      });
    }

    if (!shouldStartRecordingRef.current && !pendingStartRecordingRef.current) {
      return;
    }

    if (isRecordingRef.current || isStoppingRecordingRef.current) {
      return;
    }

    if (recordingStartRetryRef.current) {
      return;
    }

    const replayReturnAge = Date.now() - replayReturnAtRef.current;
    const startDelay =
      replayReturnAge >= 0 && replayReturnAge < 4000
        ? REPLAY_RETURN_CAMERA_STABILIZE_MS
        : 0;

    console.log('[Replay] auto start recording after camera ready', {
      startDelay,
    });

    let attempts = 0;
    const beginRetryLoop = () => {
      let startAttemptInFlight = false;
      recordingStartRetryRef.current = setInterval(() => {
        if (startAttemptInFlight) {
          return;
        }

        startAttemptInFlight = true;
        attempts += 1;
        console.log('[Replay] start retry attempt:', attempts);

        void startVideoRecording()
          .then(started => {
            if (started) {
              shouldStartRecordingRef.current = false;
              pendingStartRecordingRef.current = false;
              clearRecordingStartRetry();
              return;
            }

            if (attempts >= 12) {
              logRecorderFlow('start-still-waiting', {
                attempts,
                cameraReady: isCameraReady,
                cameraRefExists: Boolean(cameraRef.current),
                activeCameraBackend: getActiveCameraBackend(),
                reason:
                  'camera/recorder not ready yet; keep retrying while match is active',
              });
              attempts = 0;
            }
          })
          .catch(error => {
            logRecorderFlow('start-failed', {
              attempts,
              cameraReady: isCameraReady,
              activeCameraBackend: getActiveCameraBackend(),
              error: String((error as any)?.message || error),
            });
          })
          .finally(() => {
            startAttemptInFlight = false;
          });
      }, 700);
    };

    const startDelayTimer = setTimeout(beginRetryLoop, startDelay);

    return () => {
      clearTimeout(startDelayTimer);
      clearRecordingStartRetry();
    };
  }, [
    isStarted,
    isPaused,
    isCameraReady,
    isRecording,
    clearRecordingStartRetry,
    getActiveCameraBackend,
    logRecorderFlow,
    webcamFolderName,
    youtubeLivePreviewActive,
  ]);

  useEffect(() => {
    if (!webcamFolderName || !isStarted || isPaused || !playerSettings) {
      return;
    }

    if (
      !isPool9Game(gameSettings?.category) &&
      !isPool10Game(gameSettings?.category) &&
      !isCaromGame(gameSettings?.category) &&
      !isSnookerGame(gameSettings?.category)
    ) {
      return;
    }

    const leftPlayer = playerSettings?.playingPlayers?.[0];
    const rightPlayer = playerSettings?.playingPlayers?.[1];
    const goal = Number(
      gameSettings?.players?.goal?.goal ?? playerSettings?.goal?.goal ?? 0,
    );
    const baseCountdown = Number(gameSettings?.mode?.countdownTime ?? 0);
    const segmentIndex = currentReplaySegmentIndexRef.current;
    const segmentTime = Math.max(
      0,
      totalTime - currentReplaySegmentStartTotalTimeRef.current,
    );
    const segmentTimeBucket = Math.floor(
      segmentTime / REPLAY_TIMELINE_TIME_BUCKET_SECONDS,
    );
    const countdownBucket = Math.floor(
      Number(countdownTime || 0) / REPLAY_TIMELINE_COUNTDOWN_BUCKET_SECONDS,
    );

    const signature = JSON.stringify({
      webcamFolderName,
      segmentIndex,
      segmentTimeBucket,
      countdownBucket,
      currentPlayerIndex,
      goal,
      baseCountdown,
      gameMode: gameSettings?.mode?.mode,
      leftScore: Number(leftPlayer?.totalPoint ?? 0),
      rightScore: Number(rightPlayer?.totalPoint ?? 0),
      totalTurns: Number(totalTurns || 1),
      leftCurrentPoint: Number(leftPlayer?.proMode?.currentPoint ?? 0),
      rightCurrentPoint: Number(rightPlayer?.proMode?.currentPoint ?? 0),
    });

    if (signature === lastReplayTimelineWriteSignatureRef.current) {
      return;
    }

    lastReplayTimelineWriteSignatureRef.current = signature;
    replayTimelineSignatureRef.current = signature;

    void appendReplayScoreboardTimelineEntry(webcamFolderName, {
      segmentIndex,
      segmentTime,
      currentPlayerIndex,
      countdownTime,
      baseCountdown,
      category: gameSettings?.category,
      gameMode: gameSettings?.mode?.mode,
      goal,
      playerSettings: cloneReplayValue(playerSettings),
      totalTurns: Number(totalTurns || 1),
      savedAt: Date.now(),
    });
  }, [
    webcamFolderName,
    isStarted,
    isPaused,
    playerSettings,
    gameSettings?.category,
    gameSettings?.players?.goal?.goal,
    gameSettings?.mode?.mode,
    gameSettings?.mode?.countdownTime,
    totalTime,
    currentPlayerIndex,
    countdownTime,
    totalTurns,
  ]);

  useEffect(() => {
    if (!isStarted || isPaused) {
      return;
    }

    countdownInterval = setInterval(() => {
      setTotalTime(prev => prev + 1);

      if (!isMatchPaused && !poolBreakEnabled) {
        setCountdownTime(prev =>
          typeof prev === 'number' && prev > 0 ? prev - 1 : 0,
        );
      }
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, [isStarted, isPaused, isMatchPaused, poolBreakEnabled]);

  useEffect(() => {
    if (typeof warmUpCountdownTime !== 'number') {
      return;
    }

    warmUpCountdownInterval = setInterval(() => {
      setWarmUpCountdownTime(prev => {
        if (typeof prev !== 'number') {
          return prev;
        }

        if (gameBreakEnabled) {
          return prev + 1;
        }

        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => {
      clearInterval(warmUpCountdownInterval);
    };
  }, [typeof warmUpCountdownTime === 'number', gameBreakEnabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const nextIsActive = nextState === 'active';
      setIsAppActive(nextIsActive);

      if (!nextIsActive) {
        stopCountdownBeepSafely();
      }

      console.log('[CountdownBeep]', {
        event: 'app-state',
        state: nextState,
        active: nextIsActive,
      });
    });

    return () => {
      subscription.remove();
      stopCountdownBeepSafely();
      countdownBeepLastSecondRef.current = null;
      countdownBeepPreviousSecondRef.current = null;
    };
  }, []);

  useEffect(() => {
    const currentSecond = getCountdownBeepSecond(countdownTime);
    const previousSecond = countdownBeepPreviousSecondRef.current;

    if (previousSecond !== null && currentSecond > previousSecond) {
      // Timer was reset/extended for a new turn, pool break, new game or resumed match.
      // Clear the guard so the next 10..1 window can beep again.
      countdownBeepLastSecondRef.current = null;
    }

    countdownBeepPreviousSecondRef.current = currentSecond;

    const baseCountdownTime = Number(gameSettings?.mode?.countdownTime || 0);
    const canPlayCountdownBeep =
      isStarted &&
      !isPaused &&
      !isMatchPaused &&
      !poolBreakEnabled &&
      !gameBreakEnabled &&
      soundEnabled &&
      isAppActive &&
      baseCountdownTime > 0;

    if (!canPlayCountdownBeep) {
      return;
    }

    if (
      currentSecond < COUNTDOWN_BEEP_END_SECOND ||
      currentSecond > COUNTDOWN_BEEP_START_SECOND
    ) {
      return;
    }

    if (countdownBeepLastSecondRef.current === currentSecond) {
      return;
    }

    countdownBeepLastSecondRef.current = currentSecond;
    playCountdownBeepSafely();

    console.log('[CountdownBeep]', {
      event: 'beep',
      second: currentSecond,
      countdownTime,
      matchSessionId: matchSessionIdRef.current,
    });
  }, [
    countdownTime,
    gameSettings?.mode?.countdownTime,
    gameBreakEnabled,
    isAppActive,
    isMatchPaused,
    isPaused,
    isStarted,
    poolBreakEnabled,
    soundEnabled,
  ]);

  // useEffect(() => {
  //   if (!matchCountdownRef.current || isCaromGame(gameSettings?.category)) {
  //     return;
  //   }

  //   captureRef(matchCountdownRef, {
  //     format: 'png',
  //     quality: 0.01,
  //     width: 1242,
  //   })
  //     .then(
  //       async uri => {
  //         const matchCountdownImagePath = `${RNFS.DownloadDirectoryPath}/${WEBCAM_BASE_CAMERA_FOLDER}/${MATCH_COUNTDOWN}`;

  //         console.log("matchCountdownImagePath" + matchCountdownImagePath)

  //         const _path = uri.slice(7);
  //         console.log("prh" + _path)

  //         RNFS.copyFile(_path, matchCountdownImagePath);
  //       },
  //       error => console.log('Oops, match countdown failed', error),
  //     )
  //     .catch(e => {
  //       if (__DEV__) {
  //         console.log('Capture countdown error', e);
  //       }
  //     });
  // }, [countdownTime, gameSettings]);

  // useEffect(() => {
  //   return () => {
  //     cancelStreamWebcamToFile();
  //   };
  // }, []);

  const updateWebcamFolderName = useCallback((name: string) => {
    setWebcamFolderName(name);
  }, []);

  const _resetCountdown = useCallback(
    (isResume?: boolean, cumulativeTime?: boolean) => {
      if (!gameSettings || !gameSettings.mode?.countdownTime) {
        return;
      }

      if (cumulativeTime) {
        setCountdownTime(countdownTime + gameSettings!.mode?.countdownTime);
      } else if (!isResume) {
        setCountdownTime(gameSettings!.mode?.countdownTime);
      }
    },
    [gameSettings, countdownTime],
  );

  const onEditPlayerName = useCallback((index: number, newName: string) => {
    setPlayerSettings(
      prev =>
        ({
          ...prev,
          playingPlayers: prev?.playingPlayers.map((player, playerIndex) => {
            if (index === playerIndex) {
              return {...player, name: newName};
            }

            return player;
          }),
        }) as PlayerSettings,
    );
  }, []);

  const navigateBackAfterWinner = useCallback(() => {
    setTimeout(() => {
      try {
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
          return;
        }
      } catch (error) {
        console.log('[WinnerAlert] navigation.goBack failed', error);
      }

      try {
        goBack();
      } catch (error) {
        console.log('[WinnerAlert] fallback goBack failed', error);
      }
    }, 0);
  }, [navigation]);

  const showWinnerAlertAndGoBack = useCallback(
    (winnerPlayer?: Player) => {
      if (!winnerPlayer?.name || winnerAlertShownRef.current) {
        return;
      }

      const shouldUseCaromWinnerSummary =
        isCaromGame(gameSettings?.category) &&
        gameSettings?.mode?.mode === 'pro' &&
        (playerSettings?.playingPlayers?.length || 0) === 2;

      if (shouldUseCaromWinnerSummary) {
        return;
      }

      winnerAlertShownRef.current = true;

      Alert.alert(
        i18n.t('txtWin'),
        i18n.t('msgWinner', {player: winnerPlayer.name}),
        [
          {
            text: i18n.t('txtClose'),
            onPress: () => {
              winnerAlertShownRef.current = false;
              navigateBackAfterWinner();
            },
          },
        ],
        {cancelable: false},
      );
    },
    [
      gameSettings?.category,
      gameSettings?.mode?.mode,
      navigateBackAfterWinner,
      playerSettings?.playingPlayers?.length,
    ],
  );

  const resetCurrentMatchForNextGame = useCallback(() => {
    pendingNewGameAfterViolateRef.current = false;
    winnerAlertShownRef.current = false;
    endWinnerPromptDisplayedRef.current = false;
    void setReplayResumeSnapshot(null);
    void setLiveMatchSnapshot(null);
    setReplayReturnRequestSync(null);
    setWinner(undefined);
    setIsStarted(false);
    setIsPaused(false);
    setIsMatchPaused(false);
    setGameBreakEnabled(false);
    setWarmUpCountdownTime(undefined);
    clearInterval(warmUpCountdownInterval);
    setTotalTurns(1);
    setTotalTime(0);
    setCurrentPlayerIndex(0);
    setPoolBreakPlayerIndex(0);
    setPool8SetWinnerIndex(null);
    setPool8FreeSetWinnerIndex(null);

    if (gameSettings?.mode?.warmUpTime) {
      const warmupTotalTurns = getActiveGameplayPlayerCount(
        gameSettings,
        gameSettings?.players,
      );
      if (isQuickMatchGameMode(gameSettings)) {
        quickMatchWarmUpTotalTurnsRef.current = warmupTotalTurns;
        quickMatchWarmUpCurrentTurnRef.current = 0;
        console.log('[WarmupFlow] mode=fastCompetition playerCount=' + warmupTotalTurns);
        console.log('[WarmupFlow] warmupTotalTurns=' + warmupTotalTurns);
      }
      setWarmUpCount(warmupTotalTurns);
    } else {
      quickMatchWarmUpTotalTurnsRef.current = 0;
      quickMatchWarmUpCurrentTurnRef.current = 0;
      setWarmUpCount(undefined);
    }

    if (gameSettings?.mode?.countdownTime) {
      const extraTimeBonus = isPoolGame(gameSettings?.category)
        ? gameSettings.mode?.extraTimeBonus || 0
        : 0;
      setCountdownTime(gameSettings.mode.countdownTime + extraTimeBonus);
    } else {
      setCountdownTime(0);
    }

    const sourcePlayerSettings = playerSettings || gameSettings?.players;

    if (sourcePlayerSettings) {
      setPlayerSettings({
        ...sourcePlayerSettings,
        playingPlayers: sourcePlayerSettings.playingPlayers.map(player => ({
          ...player,
          totalPoint: 0,
          violate: 0,
          scoredBalls: [],
          setScore: 0,
          frameScore: 0,
          snooker: {
            ...(player as any)?.snooker,
            setScore: 0,
          },
          proMode: player.proMode
            ? {
                ...player.proMode,
                highestRate: 0,
                secondHighestRate: 0,
                average: 0,
                currentPoint: 0,
                extraTimeTurns: gameSettings?.mode?.extraTimeTurns,
              }
            : player.proMode,
        })),
      } as PlayerSettings);
    }
  }, [gameSettings, playerSettings]);

  const onCloseWinnerSummary = useCallback(() => {
    resetCurrentMatchForNextGame();
    navigateBackAfterWinner();
  }, [navigateBackAfterWinner, resetCurrentMatchForNextGame]);

  const commitSnookerSetWinner = useCallback(
    (setWinnerIndex: number, source: 'auto' | 'manual' = 'manual') => {
      if (
        !isStarted ||
        !playerSettings ||
        !gameSettings ||
        !isSnookerGame(gameSettings.category) ||
        winner
      ) {
        return;
      }

      const players = playerSettings.playingPlayers || [];
      if (!players[setWinnerIndex]) {
        return;
      }

      const targetSet = getTargetGoalValue(gameSettings);
      const nextSetScore = getSnookerSetScore(players[setWinnerIndex]) + 1;
      const winnerName =
        players[setWinnerIndex]?.name || `Player ${setWinnerIndex + 1}`;
      const nextPlayers = players.map((player, index) => {
        const setScore =
          index === setWinnerIndex
            ? getSnookerSetScore(player) + 1
            : getSnookerSetScore(player);

        return withSnookerSetScore(
          {
            ...player,
            totalPoint: 0,
            violate: 0,
            scoredBalls: [],
            proMode: player.proMode
              ? {
                  ...player.proMode,
                  currentPoint: 0,
                }
              : player.proMode,
          } as Player,
          setScore,
        );
      });

      setPlayerSettings({
        ...playerSettings,
        playingPlayers: nextPlayers,
      });
      setCurrentPlayerIndex(setWinnerIndex);
      setIsMatchPaused(false);
      _resetCountdown();

      const reachedTargetSet = targetSet > 0 && nextSetScore >= targetSet;
      Alert.alert(
        reachedTargetSet ? 'Đã đủ mục tiêu set' : 'Kết thúc set',
        reachedTargetSet
          ? `${winnerName} đã đạt ${targetSet} set và thắng trận. Bấm Kết thúc để chốt toàn bộ trận.`
          : `${winnerName} đã thắng set${source === 'auto' ? ' do đạt điểm set' : ''}. Điểm hiện tại đã reset về 0 - 0.`,
        [
          {
            text: reachedTargetSet
              ? i18n.t('stop') || 'Kết thúc trận'
              : 'Tiếp tục set mới',
          },
        ],
      );
    },
    [_resetCountdown, gameSettings, isStarted, playerSettings, winner],
  );

  const onChangePlayerPoint = useCallback(
    (addedPoint: number, index: number, stepIndex: number) => {
      if (
        !isStarted ||
        stepIndex === 4 ||
        !playerSettings ||
        !gameSettings ||
        winner
      ) {
        return;
      }

      const player = playerSettings.playingPlayers[index];
      if (!player) {
        return;
      }

      const targetGoal = getTargetGoalValue(gameSettings);
      const currentTotalPoint = Number(player.totalPoint || 0);
      const requestedDelta = Number(addedPoint || 0);
      const actualAddedPoint = isSnookerGame(gameSettings.category)
        ? clampScoreDeltaToGoal(currentTotalPoint, requestedDelta, 0)
        : clampScoreDeltaToGoal(currentTotalPoint, requestedDelta, targetGoal);

      // v13: chạm điểm mục tiêu thì chặn tăng thêm, nhưng vẫn cho giảm điểm.
      // Không tự hiện thắng ở đây; chỉ bấm Kết thúc mới chốt người thắng.
      if (actualAddedPoint === 0) {
        console.log('[TargetScoreLimit] blocked point change v13', {
          index,
          currentTotalPoint,
          requestedDelta: addedPoint,
          targetGoal,
        });
        return;
      }

      if (isSnookerGame(gameSettings.category) && actualAddedPoint > 0) {
        const snookerSetTarget = getSnookerSetPointTarget(
          gameSettings,
          playerSettings,
        );
        const nextSnookerScore = currentTotalPoint + actualAddedPoint;
        if (snookerSetTarget > 0 && nextSnookerScore >= snookerSetTarget) {
          commitSnookerSetWinner(index, 'auto');
          return;
        }
      }

      setPlayerSettings(
        prev =>
          ({
            ...prev,
            playingPlayers: prev?.playingPlayers.map(
              (currentPlayer, playerIndex) => {
                if (index === playerIndex) {
                  const updatedTotalPoint = Math.max(
                    0,
                    Number(currentPlayer.totalPoint || 0) + actualAddedPoint,
                  );
                  const updatedCurrentPoint = Math.max(
                    0,
                    Number(currentPlayer.proMode?.currentPoint || 0) +
                      actualAddedPoint,
                  );
                  const updatedAverage = Number(
                    (updatedTotalPoint / Math.max(1, totalTurns + 1)).toFixed(
                      2,
                    ),
                  );

                  return {
                    ...currentPlayer,
                    totalPoint: updatedTotalPoint,
                    proMode: currentPlayer.proMode
                      ? {
                          ...currentPlayer.proMode,
                          // v15: Không ghi High Run khi đang cộng từng điểm trong cùng 1 lượt.
                          // HR1/HR2 hiển thị live sẽ được tính từ currentPoint ở PlayerViewModel,
                          // còn HR thật chỉ được chốt khi đổi lượt hoặc kết thúc trận.
                          average: updatedAverage,
                          currentPoint: updatedCurrentPoint,
                        }
                      : currentPlayer.proMode,
                  };
                }

                return currentPlayer;
              },
            ),
          }) as PlayerSettings,
      );

      if (!isPoolGame(gameSettings.category)) {
        _resetCountdown();
        setIsMatchPaused(false);
      }
    },
    [
      isStarted,
      gameSettings,
      playerSettings,
      winner,
      _resetCountdown,
      commitSnookerSetWinner,
      totalTurns,
    ],
  );

  const onSnookerScore = useCallback(
    (point: number, playerIndex?: number) => {
      if (
        !isStarted ||
        !playerSettings ||
        !gameSettings ||
        !isSnookerGame(gameSettings.category) ||
        winner
      ) {
        return;
      }

      const value = Math.max(0, Math.round(Number(point || 0)));
      if (!value) {
        return;
      }

      const targetPlayerIndex = Number.isInteger(playerIndex)
        ? Number(playerIndex)
        : currentPlayerIndex;

      onChangePlayerPoint(value, targetPlayerIndex, 0);
    },
    [
      currentPlayerIndex,
      gameSettings,
      isStarted,
      onChangePlayerPoint,
      playerSettings,
      winner,
    ],
  );

  const onSnookerFoul = useCallback(
    (point: number, foulingPlayerIndex?: number) => {
      if (
        !isStarted ||
        !playerSettings ||
        !gameSettings ||
        !isSnookerGame(gameSettings.category) ||
        winner
      ) {
        return;
      }

      const value = Math.max(0, Math.round(Number(point || 0)));
      const players = playerSettings.playingPlayers || [];
      if (!value || players.length < 2) {
        return;
      }

      const sourcePlayerIndex = Number.isInteger(foulingPlayerIndex)
        ? Number(foulingPlayerIndex)
        : currentPlayerIndex;
      const opponentIndex = sourcePlayerIndex === 0 ? 1 : 0;
      const opponent = players[opponentIndex];
      const nextOpponentScore = Number(opponent?.totalPoint || 0) + value;
      const snookerSetTarget = getSnookerSetPointTarget(
        gameSettings,
        playerSettings,
      );
      if (
        opponent &&
        snookerSetTarget > 0 &&
        nextOpponentScore >= snookerSetTarget
      ) {
        commitSnookerSetWinner(opponentIndex, 'auto');
        return;
      }

      setPlayerSettings(
        prev =>
          ({
            ...prev,
            playingPlayers: prev?.playingPlayers.map((player, playerIndex) => {
              if (playerIndex !== opponentIndex) {
                return player;
              }

              return {
                ...player,
                totalPoint: Math.max(0, Number(player.totalPoint || 0) + value),
              } as Player;
            }),
          }) as PlayerSettings,
      );

      _resetCountdown();
      setIsMatchPaused(false);
    },
    [
      _resetCountdown,
      commitSnookerSetWinner,
      currentPlayerIndex,
      gameSettings,
      isStarted,
      playerSettings,
      winner,
    ],
  );

  const applySnookerSetWinner = commitSnookerSetWinner;

  const onEndSnookerSet = useCallback(() => {
    if (
      !isStarted ||
      !playerSettings ||
      !gameSettings ||
      !isSnookerGame(gameSettings.category) ||
      winner
    ) {
      return;
    }

    const players = playerSettings.playingPlayers || [];
    if (players.length < 2) {
      return;
    }

    const leftScore = Number(players[0]?.totalPoint || 0);
    const rightScore = Number(players[1]?.totalPoint || 0);

    if (leftScore === rightScore) {
      Alert.alert('Điểm set đang bằng nhau', 'Chọn người thắng set:', [
        {
          text: players[0]?.name || 'Người chơi 1',
          onPress: () => applySnookerSetWinner(0),
        },
        {
          text: players[1]?.name || 'Người chơi 2',
          onPress: () => applySnookerSetWinner(1),
        },
        {text: i18n.t('txtCancel') || 'Hủy', style: 'cancel'},
      ]);
      return;
    }

    applySnookerSetWinner(leftScore > rightScore ? 0 : 1);
  }, [applySnookerSetWinner, gameSettings, isStarted, playerSettings, winner]);

  useEffect(() => {
    quickMatchRemoteStopRef.current = onStop;
  }, [onStop]);

  const onPressGiveMoreTime = useCallback(() => {
    const baseCountdown = Number(gameSettings?.mode?.countdownTime || 0);
    const configuredBonus = Number(gameSettings?.mode?.extraTimeBonus || 0);
    const currentSettings = playerSettingsRef.current ?? playerSettings;
    const currentPlayer = currentSettings?.playingPlayers?.[currentPlayerIndex];
    const settingExtraTimeTurns = gameSettings?.mode?.extraTimeTurns;
    const configuredExtraTimeTurns = Number(settingExtraTimeTurns);
    const isUnlimitedExtraTimeTurns = settingExtraTimeTurns === 'infinity';
    const playerRemainingTurns = currentPlayer?.proMode?.extraTimeTurns;
    const remainingTurns =
      typeof playerRemainingTurns === 'number'
        ? playerRemainingTurns
        : Number.isFinite(configuredExtraTimeTurns)
          ? configuredExtraTimeTurns
          : playerRemainingTurns;
    const hasLimitedExtraTimeTurns =
      !isUnlimitedExtraTimeTurns &&
      (typeof remainingTurns === 'number' ||
        Number.isFinite(configuredExtraTimeTurns));

    console.log('[Extension] press v12-limit-fix', {
      isStarted,
      baseCountdown,
      configuredBonus,
      currentCountdown: countdownTime,
      currentPlayerIndex,
      settingExtraTimeTurns,
      playerRemainingTurns,
      remainingTurns,
      hasLimitedExtraTimeTurns,
    });

    if (!isStarted || !currentSettings || !baseCountdown) {
      console.log('[Extension] blocked: invalid state');
      return;
    }

    if (hasLimitedExtraTimeTurns && Number(remainingTurns || 0) <= 0) {
      console.log('[Extension] blocked: no extra turns left');
      return;
    }

    const appliedBonus =
      configuredBonus > 0
        ? configuredBonus
        : baseCountdown > 0
          ? baseCountdown
          : 35;

    if (hasLimitedExtraTimeTurns) {
      const safeRemainingTurns = Math.max(0, Number(remainingTurns || 0));
      const nextRemainingTurns = Math.max(0, safeRemainingTurns - 1);

      const nextPlayerSettings = {
        ...currentSettings,
        playingPlayers: (currentSettings.playingPlayers || []).map(
          (player, index) => {
            if (index !== currentPlayerIndex) {
              return player;
            }

            return {
              ...player,
              proMode: {
                ...(player.proMode || {}),
                extraTimeTurns: nextRemainingTurns,
              },
            } as Player;
          },
        ),
      } as PlayerSettings;

      // Important: update playerSettingsRef synchronously before adding time.
      // Remote HID can fire very quickly; checking stale React state allowed
      // spamming Extension beyond the configured turn limit.
      setPlayerSettings(nextPlayerSettings);

      console.log('[Extension] extra turn consumed v12-limit-fix', {
        before: safeRemainingTurns,
        after: nextRemainingTurns,
      });
    }

    setCountdownTime(prev => {
      const safePrev = Number.isFinite(prev) ? prev : baseCountdown;
      const next = safePrev + appliedBonus;
      console.log('[Extension] countdown update', {
        safePrev,
        appliedBonus,
        next,
      });
      return next;
    });

    setIsMatchPaused(false);
  }, [
    countdownTime,
    currentPlayerIndex,
    gameSettings,
    isStarted,
    playerSettings,
    setCountdownTime,
    setIsMatchPaused,
    setPlayerSettings,
  ]);

  const onViolate = useCallback(
    (playerIndex: number, reset?: boolean) => {
      if (!isStarted || !playerSettings || winner) {
        return;
      }

      if (
        playerIndex < 0 ||
        playerIndex >= (playerSettings.playingPlayers?.length || 0)
      ) {
        return;
      }

      const players = playerSettings.playingPlayers || [];
      const triggeredPlayer = players[playerIndex];
      const oldFoulCount = Number(triggeredPlayer?.violate || 0);
      const nextViolate = reset ? 0 : oldFoulCount + 1;
      const opponentIndex = players.findIndex(
        (_, index) => index !== playerIndex,
      );
      const isThreeFoulPenalty =
        !reset && nextViolate >= 3 && opponentIndex >= 0;
      const opponentPlayer = isThreeFoulPenalty
        ? players[opponentIndex]
        : undefined;
      const opponentScoreBefore = Number(opponentPlayer?.totalPoint || 0);
      const opponentScoreDelta = isThreeFoulPenalty
        ? clampScoreDeltaToGoal(
            opponentScoreBefore,
            1,
            getTargetGoalValue(gameSettings),
          )
        : 0;
      const opponentScoreAfter = opponentScoreBefore + opponentScoreDelta;
      const matchPausedBefore = Boolean(isPaused || isMatchPaused);
      const timerRunningBefore = Boolean(
        isStarted && !isPaused && !isMatchPaused,
      );
      const recordingActiveBefore = Boolean(
        isRecordingRef.current ||
        isRecording ||
        shouldStartRecordingRef.current ||
        pendingStartRecordingRef.current,
      );

      const extraTimeTurns = gameSettings?.mode?.extraTimeTurns;
      const newPlayingPlayers = players.map((player, index) => {
        if (isThreeFoulPenalty) {
          return {
            ...player,
            totalPoint:
              index === opponentIndex
                ? Number(player.totalPoint || 0) +
                  clampScoreDeltaToGoal(
                    Number(player.totalPoint || 0),
                    1,
                    getTargetGoalValue(gameSettings),
                  )
                : player.totalPoint,
            violate: 0,
            scoredBalls: [],
            proMode: player.proMode
              ? {
                  ...player.proMode,
                  currentPoint: 0,
                  extraTimeTurns:
                    typeof extraTimeTurns === 'number'
                      ? extraTimeTurns
                      : player.proMode.extraTimeTurns,
                }
              : player.proMode,
          } as Player;
        }

        if (playerIndex === index) {
          return {
            ...player,
            violate: nextViolate,
          } as Player;
        }

        return player;
      });

      setPlayerSettings({...playerSettings, playingPlayers: newPlayingPlayers});

      if (!isThreeFoulPenalty) {
        return;
      }

      pendingNewGameAfterViolateRef.current = false;
      setWinner(undefined);
      setGameBreakEnabled(false);
      setWarmUpCountdownTime(undefined);
      clearInterval(warmUpCountdownInterval);

      if (gameSettings?.mode?.countdownTime) {
        const extraTimeBonus = isPoolGame(gameSettings?.category)
          ? gameSettings.mode?.extraTimeBonus || 0
          : 0;
        setCountdownTime(gameSettings.mode.countdownTime + extraTimeBonus);
      }

      if (isPoolGame(gameSettings?.category)) {
        setPoolBreakEnabled(!isPool15FreeGame(gameSettings?.category));
      }

      if (isPool15OnlyGame(gameSettings?.category)) {
        setPool8SetWinnerIndex(null);
        setPool8Trackers(prev =>
          resetPool8Trackers(getSafePool8Trackers(prev)),
        );
      }

      if (isPool15FreeGame(gameSettings?.category)) {
        setPool8FreeSetWinnerIndex(null);
        setPool8FreeHole10Scores(prev => prev.map(() => 0));
      }

      const playerNumber = Math.max(
        1,
        Number(gameSettings?.players?.playerNumber || players.length || 1),
      );
      const nextRackPlayerIndex =
        poolBreakPlayerIndex + 1 > playerNumber - 1
          ? 0
          : poolBreakPlayerIndex + 1;

      setPoolBreakPlayerIndex(nextRackPlayerIndex);
      setCurrentPlayerIndex(nextRackPlayerIndex);
      setIsPaused(false);
      setIsMatchPaused(false);

      const timerRunningAfter = true;
      const recordingActiveAfter = Boolean(
        isRecordingRef.current ||
        isRecording ||
        shouldStartRecordingRef.current ||
        pendingStartRecordingRef.current ||
        recordingActiveBefore,
      );

      console.log('[ThreeFoulPenalty]', {
        triggeredPlayerId: (triggeredPlayer as any)?.id ?? playerIndex,
        opponentPlayerId: (opponentPlayer as any)?.id ?? opponentIndex,
        oldFoulCount,
        opponentScoreBefore,
        opponentScoreAfter,
        matchPausedBefore,
        matchPausedAfter: false,
        timerRunningBefore,
        timerRunningAfter,
        recordingActiveBefore,
        recordingActiveAfter,
        calledPauseFunction: false,
        calledRecordingStop: false,
        newRackState: {
          currentPlayerIndex: nextRackPlayerIndex,
          poolBreakPlayerIndex: nextRackPlayerIndex,
          foulsReset: true,
          scoredBallsReset: true,
          matchContinues: true,
        },
      });

      console.log('[RecordingContinuity]', {
        reason: 'three-foul-penalty',
        historyRecordingStillActive: recordingActiveAfter,
        segmentNotFinalized: true,
        videoNotSplit: true,
        activeMatchId: matchSessionIdRef.current,
        webcamFolderName,
        activeSegmentIndex: currentReplaySegmentIndexRef.current,
        completedSegments: replayCompletedSegmentsRef.current,
      });
    },
    [
      gameSettings,
      isMatchPaused,
      isPaused,
      isRecording,
      isStarted,
      playerSettings,
      poolBreakPlayerIndex,
      webcamFolderName,
      winner,
    ],
  );

  const onSelectWinnerByIndex = useCallback(
    (playerIndex: number, addMatchPoint?: boolean) => {
      if (!playerSettings?.playingPlayers?.[playerIndex]) {
        return;
      }

      const targetPlayer = playerSettings.playingPlayers[playerIndex];

      if (addMatchPoint) {
        const targetGoal = getTargetGoalValue(gameSettings);
        const currentTotalPoint = Number(targetPlayer.totalPoint || 0);
        const actualAddedPoint = clampScoreDeltaToGoal(
          currentTotalPoint,
          1,
          targetGoal,
        );

        if (actualAddedPoint !== 0) {
          setPlayerSettings(
            prev =>
              ({
                ...prev,
                playingPlayers: prev?.playingPlayers.map(
                  (player, currentIndex) => {
                    if (playerIndex === currentIndex) {
                      return {
                        ...player,
                        totalPoint:
                          Number(player.totalPoint || 0) + actualAddedPoint,
                      } as Player;
                    }

                    return player;
                  },
                ),
              }) as PlayerSettings,
          );
        }

        // v13: ăn bi/chốt ván chỉ cộng điểm đến tối đa điểm mục tiêu;
        // chưa tự báo thắng trận, phải bấm Kết thúc mới hiện người thắng.
        setIsMatchPaused(true);
        return;
      }

      const announcedWinnerPlayer = targetPlayer;
      setWinner(announcedWinnerPlayer);
      setIsStarted(false);
      setIsPaused(false);
      setIsMatchPaused(true);

      showWinnerAlertAndGoBack(announcedWinnerPlayer);
    },
    [gameSettings, playerSettings, showWinnerAlertAndGoBack],
  );

  const onSelectWinner = useCallback(() => {
    onSelectWinnerByIndex(
      currentPlayerIndex,
      isPool9Game(gameSettings?.category) ||
        isPool10Game(gameSettings?.category),
    );
  }, [currentPlayerIndex, gameSettings?.category, onSelectWinnerByIndex]);

  const onClearWinner = useCallback(() => {
    if (!playerSettings) {
      return;
    }

    const newPlayingPlayers = playerSettings?.playingPlayers.map(player => {
      return {...player, scoredBalls: undefined} as Player;
    });

    winnerAlertShownRef.current = false;
    setPlayerSettings({...playerSettings, playingPlayers: newPlayingPlayers});
    setWinner(undefined);
  }, [playerSettings]);

  const onPool15OnlyScore = useCallback(
    (playerIndex: number) => {
      if (
        !isStarted ||
        !playerSettings ||
        !isPool15OnlyGame(gameSettings?.category) ||
        winner
      ) {
        return;
      }

      const targetPlayer = playerSettings.playingPlayers[playerIndex];
      if (!targetPlayer) {
        return;
      }

      const targetGoal = getTargetGoalValue(gameSettings);
      const maxPoint = targetGoal > 0 ? Math.min(8, targetGoal) : 8;
      const nextPoint = Math.min(
        maxPoint,
        Number(targetPlayer.totalPoint || 0) + 1,
      );
      const newPlayingPlayers = playerSettings.playingPlayers.map(
        (player, index) => {
          if (index === playerIndex) {
            return {
              ...player,
              totalPoint: nextPoint,
            } as Player;
          }

          return player;
        },
      );

      setPlayerSettings({...playerSettings, playingPlayers: newPlayingPlayers});

      if (nextPoint >= 8) {
        console.log(
          '[TargetScoreLimit] pool15-only point reached; wait for end button v13',
          {
            playerIndex,
            nextPoint,
          },
        );
        setIsMatchPaused(true);
      }
    },
    [
      gameSettings?.category,
      isStarted,
      playerSettings,
      winner,
      showWinnerAlertAndGoBack,
    ],
  );

  const onIncrementPool8FreeHole10 = useCallback((playerIndex: number) => {
    setPool8FreeHole10Scores(prev =>
      prev.map((score, index) => (index === playerIndex ? score + 1 : score)),
    );
  }, []);

  const onDecrementPool8FreeHole10 = useCallback((playerIndex: number) => {
    setPool8FreeHole10Scores(prev =>
      prev.map((score, index) =>
        index === playerIndex ? Math.max(0, score - 1) : score,
      ),
    );
  }, []);

  const onSwapPool8Groups = useCallback(() => {
    if (!isPool15OnlyGame(gameSettings?.category)) {
      return;
    }

    setPool8Trackers(prev => {
      const next =
        Array.isArray(prev) && prev.length >= 2
          ? [...prev]
          : buildDefaultPool8Trackers();
      return [next[1], next[0]];
    });
  }, [gameSettings?.category]);

  const onPressPool8Ball = useCallback(
    (playerIndex: number) => {
      if (
        !isStarted ||
        !playerSettings ||
        !isPool15OnlyGame(gameSettings?.category) ||
        winner ||
        poolBreakEnabled ||
        isPaused ||
        isMatchPaused ||
        pool8SetWinnerIndex !== null ||
        playerIndex !== currentPlayerIndex
      ) {
        return;
      }

      const tracker = pool8Trackers[playerIndex];
      const activeBall = tracker?.sequence?.[tracker.activeIndex];
      if (activeBall == null) {
        return;
      }

      if (activeBall === BallType.B8) {
        const targetGoal = getTargetGoalValue(gameSettings);
        const updatedPlayers = playerSettings.playingPlayers.map(
          (player, index) =>
            index === playerIndex
              ? ({
                  ...player,
                  totalPoint:
                    Number(player.totalPoint || 0) +
                    clampScoreDeltaToGoal(
                      Number(player.totalPoint || 0),
                      1,
                      targetGoal,
                    ),
                } as Player)
              : player,
        );

        setPlayerSettings({...playerSettings, playingPlayers: updatedPlayers});
        setPool8SetWinnerIndex(playerIndex);
        setIsMatchPaused(true);

        const setWinnerPlayer = updatedPlayers[playerIndex];

        if (
          Number(setWinnerPlayer?.totalPoint || 0) >= targetGoal &&
          targetGoal > 0
        ) {
          console.log(
            '[TargetScoreLimit] target reached; wait for end button v13',
            {
              playerIndex,
              targetGoal,
              score: Number(setWinnerPlayer?.totalPoint || 0),
            },
          );
        }

        return;
      }

      setPool8Trackers(prev =>
        prev.map((item, index) =>
          index === playerIndex
            ? {
                ...item,
                activeIndex: Math.min(
                  item.sequence.length - 1,
                  item.activeIndex + 1,
                ),
              }
            : item,
        ),
      );
    },
    [
      currentPlayerIndex,
      gameSettings?.category,
      gameSettings?.players?.goal?.goal,
      isMatchPaused,
      isPaused,
      isStarted,
      playerSettings,
      pool8SetWinnerIndex,
      pool8Trackers,
      poolBreakEnabled,
      showWinnerAlertAndGoBack,
      winner,
    ],
  );

  const onPoolScore = useCallback(
    (ball: PoolBallType) => {
      if (
        !isStarted ||
        !playerSettings ||
        !isPoolGame(gameSettings?.category) ||
        winner
      ) {
        return;
      }

      if (
        isPool15FreeGame(gameSettings?.category) &&
        pool8FreeSetWinnerIndex !== null
      ) {
        return;
      }

      if (isPool15OnlyGame(gameSettings?.category)) {
        return;
      }

      const newPlayingPlayers = playerSettings.playingPlayers.map(
        (player, index) => {
          if (currentPlayerIndex === index) {
            const nextScoredBalls = [...(player.scoredBalls || []), ball];
            return {
              ...player,
              scoredBalls: nextScoredBalls,
              totalPoint: isPool15FreeGame(gameSettings?.category)
                ? player.totalPoint
                : player.totalPoint,
            } as Player;
          }

          return player;
        },
      );

      if (isPool15FreeGame(gameSettings?.category)) {
        const nextCurrentPlayer = newPlayingPlayers[currentPlayerIndex];
        const scoredCount = nextCurrentPlayer?.scoredBalls?.length || 0;

        if (scoredCount >= 8) {
          const targetGoal = getTargetGoalValue(gameSettings);
          const updatedPlayers = newPlayingPlayers.map((player, index) =>
            index === currentPlayerIndex
              ? ({
                  ...player,
                  totalPoint:
                    Number(player.totalPoint || 0) +
                    clampScoreDeltaToGoal(
                      Number(player.totalPoint || 0),
                      1,
                      targetGoal,
                    ),
                } as Player)
              : player,
          );

          setPlayerSettings({
            ...playerSettings,
            playingPlayers: updatedPlayers,
          });
          setPool8FreeSetWinnerIndex(currentPlayerIndex);
          setIsMatchPaused(true);

          const setWinnerPlayer = updatedPlayers[currentPlayerIndex];
          if (
            Number(setWinnerPlayer?.totalPoint || 0) >= targetGoal &&
            targetGoal > 0
          ) {
            console.log(
              '[TargetScoreLimit] target reached; wait for end button v13',
              {
                playerIndex: currentPlayerIndex,
                targetGoal,
                score: Number(setWinnerPlayer?.totalPoint || 0),
              },
            );
          }
          return;
        }

        setPlayerSettings({
          ...playerSettings,
          playingPlayers: newPlayingPlayers,
        });
        return;
      }

      setPlayerSettings({...playerSettings, playingPlayers: newPlayingPlayers});

      switch (true) {
        case isPool9Game(gameSettings?.category):
        case isPool15OnlyGame(gameSettings?.category):
          if (ball.number === BallType.B9) {
            onSelectWinner();
          }
          break;
        case isPool10Game(gameSettings?.category):
          if (ball.number === BallType.B10) {
            onSelectWinner();
          }
          break;
        default:
          break;
      }
    },
    [
      currentPlayerIndex,
      gameSettings?.category,
      gameSettings?.players?.goal?.goal,
      isStarted,
      onSelectWinner,
      playerSettings,
      pool8FreeSetWinnerIndex,
      winner,
      showWinnerAlertAndGoBack,
    ],
  );

  const onSwitchTurn = useCallback(() => {
    _resetCountdown();

    const player0: Player = {
      ...playerSettings?.playingPlayers[0],
      color: playerSettings?.playingPlayers[1].color,
    } as Player;
    const player1: Player = {
      ...playerSettings?.playingPlayers[1],
      color: playerSettings?.playingPlayers[0].color,
    } as Player;

    setPlayerSettings({
      ...playerSettings,
      playingPlayers: [player0, player1],
    } as PlayerSettings);
  }, [_resetCountdown, playerSettings]);

  const onSwitchPoolBreakPlayerIndex = useCallback(
    (index: number, callback?: (playerIndex: number) => void) => {
      if (!gameSettings) {
        return;
      }
      let newPoolBreakPlayerIndex = 0;

      if (index + 1 > gameSettings.players.playerNumber - 1) {
        newPoolBreakPlayerIndex = 0;
      } else {
        newPoolBreakPlayerIndex = index + 1;
      }

      setPoolBreakPlayerIndex(newPoolBreakPlayerIndex);

      if (callback) {
        callback(newPoolBreakPlayerIndex);
      }
    },
    [gameSettings],
  );

  const onIncreaseTotalTurns = useCallback(() => {
    setTotalTurns(prev => prev + 1);
  }, []);

  const onDecreaseTotalTurns = useCallback(() => {
    setTotalTurns(prev => (prev > 1 ? prev - 1 : 1));
  }, []);

  const onToggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev);
  }, []);

  const onToggleProMode = useCallback(() => {
    if (
      isPoolGame(gameSettings?.category) ||
      isSnookerGame(gameSettings?.category)
    ) {
      return;
    }

    setProModeEnabled(prev => !prev);
  }, [gameSettings?.category]);

  const onPoolBreak = useCallback(() => {
    if (
      !isStarted ||
      isPaused ||
      !poolBreakEnabled ||
      !gameSettings
    ) {
      return;
    }

    if (gameSettings.mode?.mode !== 'quick_match') {
      if (!gameSettings.mode?.countdownTime) {
        return;
      }
      const extraTimeBonus = gameSettings.mode?.extraTimeBonus || 0;
      setCountdownTime(gameSettings.mode?.countdownTime! + extraTimeBonus);
    } else {
      setCountdownTime(0);
    }

    setPoolBreakEnabled(false);
    setIsMatchPaused(false);
    setIsStarted(true);

    if (isPool15OnlyGame(gameSettings?.category)) {
      setPool8Trackers(prev => resetPool8Trackers(getSafePool8Trackers(prev)));
      setPool8SetWinnerIndex(null);
    }
  }, [gameSettings, isStarted, isPaused, poolBreakEnabled]);

  const getWarmUpTimeString = useCallback(() => {
    if (!warmUpCountdownTime) {
      return '';
    }

    const minutes = Math.floor(warmUpCountdownTime / 60);
    const seconds = Math.floor(warmUpCountdownTime % 60);

    return `${minutes < 10 ? '0' : ''}${minutes}:${
      seconds < 10 ? '0' : ''
    }${seconds}`;
  }, [warmUpCountdownTime]);

  const getWarmUpNextPlayerIndex = useCallback(() => {
    const totalPlayers = getActiveGameplayPlayerCount(gameSettings, playerSettings);
    return currentPlayerIndex + 1 > totalPlayers - 1 ? 0 : currentPlayerIndex + 1;
  }, [currentPlayerIndex, gameSettings, playerSettings]);

  const onWarmUp = useCallback(() => {
    if (
      !gameSettings?.mode?.warmUpTime ||
      (typeof warmUpCountdownTime === 'number' && warmUpCountdownTime > 0) ||
      (typeof warmUpCount === 'number' && warmUpCount <= 0)
    ) {
      return;
    }

    if (isQuickMatchGameMode(gameSettings)) {
      const warmupTotalTurns =
        quickMatchWarmUpTotalTurnsRef.current ||
        getActiveGameplayPlayerCount(gameSettings, playerSettings);
      const remainingBefore = Math.max(
        0,
        Number(
          typeof warmUpCount === 'number' ? warmUpCount : warmupTotalTurns,
        ),
      );
      const currentTurn = Math.min(
        warmupTotalTurns,
        Math.max(1, warmupTotalTurns - remainingBefore + 1),
      );

      quickMatchWarmUpTotalTurnsRef.current = warmupTotalTurns;
      quickMatchWarmUpCurrentTurnRef.current = currentTurn;

      console.log(
        `[WarmupFlow] mode=fastCompetition playerCount=${warmupTotalTurns}`,
      );
      console.log(`[WarmupFlow] warmupTotalTurns=${warmupTotalTurns}`);
      console.log(
        `[WarmupFlow] warmup-start turn=${currentTurn} playerIndex=${currentPlayerIndex}`,
      );

      setWarmUpCount(Math.max(0, remainingBefore - 1));
      setWarmUpCountdownTime(gameSettings.mode.warmUpTime);
      return;
    }

    setWarmUpCount(prev => (prev ? prev - 1 : 0));
    setWarmUpCountdownTime(gameSettings?.mode?.warmUpTime);
  }, [currentPlayerIndex, gameSettings, playerSettings, warmUpCount, warmUpCountdownTime]);

  const onGameBreak = useCallback(() => {
    setGameBreakEnabled(true);
    setWarmUpCountdownTime(1);
  }, []);

  const onEndWarmUp = useCallback(() => {
    setWarmUpCountdownTime(undefined);
    setGameBreakEnabled(false);
    clearInterval(warmUpCountdownInterval);
  }, []);

  const moveWarmUpToNextPlayer = useCallback(() => {
    const nextPlayerIndex = getWarmUpNextPlayerIndex();

    setCurrentPlayerIndex(nextPlayerIndex);
    setPoolBreakPlayerIndex(nextPlayerIndex);
  }, [getWarmUpNextPlayerIndex]);

  const onQuickMatchWarmUpNext = useCallback(() => {
    if (gameSettings?.mode?.mode !== 'quick_match') {
      onEndWarmUp();
      return;
    }

    const hasRunningWarmUp =
      typeof warmUpCountdownTime === 'number' && warmUpCountdownTime > 0;
    if (!hasRunningWarmUp) {
      onWarmUp();
      return;
    }

    clearInterval(warmUpCountdownInterval);
    setGameBreakEnabled(false);
    setWarmUpCountdownTime(undefined);

    const currentTurn = quickMatchWarmUpCurrentTurnRef.current || 1;
    console.log(`[WarmupFlow] warmup-finish turn=${currentTurn}`);

    const remainingWarmUps = Math.max(0, Number(warmUpCount || 0));
    if (remainingWarmUps <= 0) {
      setWarmUpCount(0);
      console.log('[WarmupFlow] all-warmup-finished');
      return;
    }

    const nextPlayerIndex = getWarmUpNextPlayerIndex();
    const nextTurn = currentTurn + 1;
    quickMatchWarmUpCurrentTurnRef.current = nextTurn;
    setCurrentPlayerIndex(nextPlayerIndex);
    setPoolBreakPlayerIndex(nextPlayerIndex);
    setWarmUpCount(Math.max(0, remainingWarmUps - 1));
    setWarmUpCountdownTime(gameSettings?.mode?.warmUpTime);
    console.log(
      `[WarmupFlow] warmup-next turn=${nextTurn} playerIndex=${nextPlayerIndex}`,
    );
    console.log(
      `[WarmupFlow] warmup-start turn=${nextTurn} playerIndex=${nextPlayerIndex}`,
    );
  }, [gameSettings, getWarmUpNextPlayerIndex, onEndWarmUp, onWarmUp, warmUpCount, warmUpCountdownTime]);

  useEffect(() => {
    if (gameSettings?.mode?.mode !== 'quick_match') {
      return;
    }

    if (warmUpCountdownTime !== 0) {
      return;
    }

    clearInterval(warmUpCountdownInterval);
    setWarmUpCountdownTime(undefined);
    setGameBreakEnabled(false);

    const currentTurn = quickMatchWarmUpCurrentTurnRef.current || 1;
    console.log(`[WarmupFlow] warmup-finish turn=${currentTurn}`);

    const remainingWarmUps = Math.max(0, Number(warmUpCount || 0));
    if (remainingWarmUps <= 0) {
      setWarmUpCount(0);
      console.log('[WarmupFlow] all-warmup-finished');
      return;
    }

    const nextPlayerIndex = getWarmUpNextPlayerIndex();
    const nextTurn = currentTurn + 1;
    quickMatchWarmUpCurrentTurnRef.current = nextTurn;
    setCurrentPlayerIndex(nextPlayerIndex);
    setPoolBreakPlayerIndex(nextPlayerIndex);
    setWarmUpCount(Math.max(0, remainingWarmUps - 1));
    setWarmUpCountdownTime(gameSettings?.mode?.warmUpTime);
    console.log(
      `[WarmupFlow] warmup-next turn=${nextTurn} playerIndex=${nextPlayerIndex}`,
    );
    console.log(
      `[WarmupFlow] warmup-start turn=${nextTurn} playerIndex=${nextPlayerIndex}`,
    );
  }, [gameSettings?.mode?.mode, gameSettings?.mode?.warmUpTime, getWarmUpNextPlayerIndex, warmUpCount, warmUpCountdownTime]);

  const onEndTurn = useCallback(
    (isPrevious?: boolean) => {
      if (!gameSettings || !isStarted) {
        return;
      }

      const totalPlayers = Math.max(
        2,
        playerSettings?.playingPlayers?.length ||
          gameSettings.players?.playingPlayers?.length ||
          0,
      );

      let nextPlayerIndex = 0,
        newTotalTurns: number | null = null;

      switch (true) {
        case isPrevious && currentPlayerIndex - 1 < 0:
          nextPlayerIndex = totalPlayers - 1;
          newTotalTurns = totalTurns + 1;
          break;
        case isPrevious:
          nextPlayerIndex = currentPlayerIndex - 1;
          break;
        case !isPrevious && currentPlayerIndex + 1 > totalPlayers - 1:
          nextPlayerIndex = 0;
          newTotalTurns = totalTurns + 1;
          break;
        default:
          nextPlayerIndex = currentPlayerIndex + 1;
          break;
      }

      const completedTurns = Math.max(1, totalTurns + 1);

      setIsMatchPaused(false);
      setCurrentPlayerIndex(nextPlayerIndex);
      _resetCountdown();

      setPlayerSettings(
        prev =>
          ({
            ...prev,
            playingPlayers: prev?.playingPlayers.map((player, playerIndex) => {
              if (playerIndex === currentPlayerIndex) {
                const currentPoint = Number(player.proMode?.currentPoint || 0);
                const {highestRate, secondHighestRate} = getTopTwoRuns(
                  player,
                  currentPoint,
                );
                const average = Number(
                  (Number(player.totalPoint || 0) / completedTurns).toFixed(2),
                );

                return {
                  ...player,
                  proMode: {
                    ...player.proMode,
                    highestRate,
                    secondHighestRate,
                    average,
                    currentPoint: 0,
                  },
                };
              }

              return {
                ...player,
                proMode: {
                  ...player.proMode,
                  currentPoint: 0,
                },
              };
            }),
          }) as PlayerSettings,
      );

      if (newTotalTurns !== null) {
        setTotalTurns(newTotalTurns);
      }
    },
    [
      isStarted,
      currentPlayerIndex,
      totalTurns,
      gameSettings,
      playerSettings,
      _resetCountdown,
    ],
  );

  const onResetTurn = useCallback(() => {
    if (!gameSettings || !isStarted) {
      return;
    }

    _resetCountdown();

    setTotalTurns(totalTurns + 1);
    setIsMatchPaused(false);
  }, [isStarted, gameSettings, totalTurns, _resetCountdown]);

  const onSwapPlayers = useCallback(() => {
    setPlayerSettings(currentSettings => {
      const playingPlayers = currentSettings?.playingPlayers || [];
      if (playingPlayers.length < 2) {
        return currentSettings;
      }

      const nextPlayers = playingPlayers.map(player => ({...player}));
      const firstName = nextPlayers[0]?.name || '';
      const secondName = nextPlayers[1]?.name || '';

      nextPlayers[0] = {
        ...nextPlayers[0],
        name: secondName,
      } as Player;
      nextPlayers[1] = {
        ...nextPlayers[1],
        name: firstName,
      } as Player;

      return {
        ...currentSettings,
        playingPlayers: nextPlayers,
      } as PlayerSettings;
    });
  }, []);

  const dismissYouTubeLiveOverlay = useCallback(() => {
    setYoutubeLiveOverlay(null);
  }, []);

  const openYouTubeLiveLogin = useCallback(() => {
    setYoutubeLiveOverlay(null);
  }, []);

  const buildYouTubeLiveOverlay = useCallback(
    (
      eligibility: YouTubeEligibilityResponse | null,
      fallbackMessage?: string,
    ): YouTubeLiveOverlayState => {
      const subscriberCount = eligibility?.subscriberCount;
      const hiddenSubscriberCount = Boolean(eligibility?.hiddenSubscriberCount);
      const liveEnabled = eligibility?.liveEnabled;
      const liveEnabledReason =
        eligibility?.liveEnabledReason || fallbackMessage || '';

      const subscriberCheck: YouTubeEligibilityCheck = {
        key: 'subscribers',
        label: i18n.t('youtubeLiveSubscriberRequirement'),
        status:
          typeof subscriberCount === 'number'
            ? subscriberCount >= 50
              ? 'pass'
              : 'fail'
            : hiddenSubscriberCount
              ? 'unknown'
              : 'unknown',
        detail:
          typeof subscriberCount === 'number'
            ? i18n.t('youtubeLiveSubscriberCountDetail', {
                count: subscriberCount,
              })
            : hiddenSubscriberCount
              ? i18n.t('youtubeLiveHiddenSubscriberDetail')
              : i18n.t('youtubeLiveUnknownSubscriberDetail'),
      };

      const liveEnabledCheck: YouTubeEligibilityCheck = {
        key: 'liveEnabled',
        label: i18n.t('youtubeLiveEnabledRequirement'),
        status:
          liveEnabled === true
            ? 'pass'
            : liveEnabled === false
              ? 'fail'
              : 'unknown',
        detail:
          liveEnabled === true
            ? i18n.t('youtubeLiveEnabledDetail')
            : liveEnabled === false
              ? liveEnabledReason || i18n.t('youtubeLiveDisabledDetail')
              : i18n.t('youtubeLiveUnknownEnabledDetail'),
      };

      return {
        visible: true,
        title: i18n.t('youtubeLiveEligibilityTitle'),
        message:
          fallbackMessage ||
          eligibility?.message ||
          i18n.t('youtubeLiveEligibilityDefaultMessage'),
        checks: [subscriberCheck, liveEnabledCheck],
      };
    },
    [language],
  );

  const showYouTubeLiveFailure = useCallback(
    (
      eligibility: YouTubeEligibilityResponse | null,
      fallbackMessage?: string,
    ) => {
      const overlayState = buildYouTubeLiveOverlay(
        eligibility,
        fallbackMessage,
      );
      console.log('[YouTubeLiveEligibilityOverlay]', {
        visible: true,
        title: overlayState.title,
        checks: overlayState.checks?.map(check => ({
          key: check.key,
          label: check.label,
          status: check.status,
          detail: check.detail,
        })),
        willReturnToSetup: true,
      });
      setYoutubeLiveOverlay(overlayState);
    },
    [buildYouTubeLiveOverlay],
  );

  const onStart = useCallback(async () => {
    if (isStarted) {
      return;
    }

    const quickMatchWarmUpStillRunning =
      isQuickMatchModeActive &&
      (
        (typeof warmUpCountdownTime === 'number' && warmUpCountdownTime > 0) ||
        Number(warmUpCount || 0) > 0
      );

    if (quickMatchWarmUpStillRunning) {
      console.log('[QuickMatch] start blocked until warm-up is finished', {
        warmUpCount,
        warmUpCountdownTime,
        rule: 'block only while warmup seconds > 0 or remaining turns > 0',
      });
      return;
    }

    if (isQuickMatchModeActive) {
      console.log('[QuickMatch] start accepted after warm-up', {
        warmUpCount,
        warmUpCountdownTime,
      });
    }

    const freeDisk =
      (await DeviceInfo.getFreeDiskStorage()) / (1024 * 1024 * 1024);

    console.log('Free disk storae ' + freeDisk);

    if (freeDisk <= 10) {
      Alert.alert(i18n.t('txtwarn'), i18n.t('msgOutOfMemory'), [
        {
          text: i18n.t('txtCancel'),
          style: 'cancel',
        },
        {
          text: i18n.t('btnHistory'),
          onPress: () => {
            navigate(screens.history);
          },
        },
      ]);
      return;
    }

    const activeCameraBackendForRecording = getActiveCameraBackend();
    const usbStartSourceActive = isUsbWebcamGameplaySourceActive();
    const cameraReadyForRecording = isCameraReady || usbStartSourceActive;

    console.log('[Replay] onStart pressed');
    logRecorderFlow('match-start', {
      selectedLivestreamPlatform,
      saveToDeviceWhileStreaming,
      cameraReady: isCameraReady,
      cameraReadyForRecording,
      activeCameraBackend: activeCameraBackendForRecording,
    });
    console.log('[YouTube Live] start button pressed');
    console.log('[Live Flow] start pressed');
    console.log(
      '[Live Flow] selectedPlatform=' +
        String(selectedLivestreamPlatform || 'none'),
    );
    console.log('[Live Flow] youtubeConnected=unknown-before-api-check');
    console.log(
      '[Live Flow] shouldCreateYouTubeLive=' + String(shouldUseYouTubeLive),
    );
    console.log(
      '[Live Flow] routePlatform=' +
        String(routeParams.livestreamPlatform || 'none'),
    );
    console.log('[Live] selected platform:', selectedLivestreamPlatform, {
      saveToDeviceWhileStreaming,
      shouldUseYouTubeLive,
      shouldUseLocalRecordingOnly,
    });

    const usbGameplaySourceActive = usbStartSourceActive;
    let currentSource = getCurrentCameraSource();
    if (usbGameplaySourceActive) {
      currentSource = 'external';
      (globalThis as any).__APLUS_ACTIVE_CAMERA_SOURCE_KIND__ = 'usb';
      (globalThis as any).__APLUS_CURRENT_CAMERA_SOURCE__ = 'external';
      (globalThis as any).__APLUS_AVAILABLE_CAMERA_SOURCES__ = ['external'];
      (globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ = 'usb';
      (globalThis as any).__APLUS_ACTIVE_CAMERA_BACKEND__ = 'uvc';
      (globalThis as any).__APLUS_USB_GAMEPLAY_READY__ = true;
      console.log('[GameplayStart] enabled=true source=usb', {
        cameraReady: isCameraReady,
        cameraReadyForRecording,
        activeCameraBackend: activeCameraBackendForRecording,
      });
      console.log('[GameplayStart] pressed source=usb', {
        currentSource,
        cameraReady: isCameraReady,
        cameraReadyForRecording,
        activeCameraBackend: activeCameraBackendForRecording,
      });
      recordDebugLog('GameplayStart', 'enabled=true source=usb', {
        cameraReady: isCameraReady,
        cameraReadyForRecording,
        activeCameraBackend: activeCameraBackendForRecording,
      });
      recordDebugLog('GameplayStart', 'pressed source=usb', {
        currentSource,
        cameraReady: isCameraReady,
        cameraReadyForRecording,
        activeCameraBackend: activeCameraBackendForRecording,
      });
    }

    const activeReplaySourceForMatch: GameplayCameraSourceKey = usbGameplaySourceActive
      ? 'usb'
      : shouldUseRtspRecorderNow()
        ? 'rtsp'
        : getActiveGameplayCameraSource();
    const activeReplay = setActiveReplaySource(activeReplaySourceForMatch);
    const activeReplayState = ensureReplayRuntimeState(activeReplaySourceForMatch);
    activeReplayState.recordingStarted = false;
    activeReplayState.recorderReady = false;
    activeReplayState.replayReady = false;
    activeReplayState.currentSegmentPath = undefined;
    activeReplayState.latestReplayPath = undefined;
    activeReplayState.segmentRegistry = [];
    activeReplayState.bufferStartAt = 0;
    activeReplayState.lastError = undefined;
    replayStateByKeyRef.current[activeReplay.key] = activeReplayState;
    recordDebugLog('ReplayPath', 'source=' + activeReplaySourceForMatch + ' historyDir=Saved Videos/' + webcamFolderName + '/' + activeReplaySourceForMatch + ' replayDir=ReplayBuffer/' + webcamFolderName + '/' + activeReplaySourceForMatch, {
      source: activeReplaySourceForMatch,
      matchId: webcamFolderName,
      replayKey: activeReplay.key,
      historyDir: `Saved Videos/${webcamFolderName}/${activeReplaySourceForMatch}`,
      replayDir: `ReplayBuffer/${webcamFolderName}/${activeReplaySourceForMatch}`,
    });

    const availableSources = normalizeAvailableCameraSources(
      getAvailableCameraSources(),
    );
    const hasExternalSource =
      (hasDetectedUvcSource() || usbGameplaySourceActive) &&
      (availableSources.includes('external') || usbGameplaySourceActive);

    const lockedLiveSource = usbGameplaySourceActive
      ? 'external'
      : resolveLockedLiveSource(
          currentSource,
          availableSources,
        );

    logRecorderFlow('start-button-pressed', {
      source: currentSource,
      availableSources,
      hasExternalSource,
      lockedLiveSource,
      usbGameplaySourceActive,
      activeCameraBackend: activeCameraBackendForRecording,
      selectedCameraMode: String((globalThis as any).__APLUS_SELECTED_CAMERA_MODE__ || ''),
      uvcPresent: (globalThis as any).__APLUS_UVC_PRESENT__ === true,
    });
    if (usbGameplaySourceActive) {
      console.log('[USBWebcam] start-button-accepted', {
        source: currentSource,
        lockedLiveSource,
        hasExternalSource,
        cameraReady: isCameraReady,
      });
    }

    if (currentSource === 'external' && !hasExternalSource) {
      console.log('[USBWebcam] start-button-blocked', {
        reason: 'external-source-missing',
        source: currentSource,
        availableSources,
        activeCameraBackend: activeCameraBackendForRecording,
        uvcPresent: (globalThis as any).__APLUS_UVC_PRESENT__ === true,
      });
      Alert.alert(
        i18n.t('cameraUsbMissingTitle'),
        i18n.t('cameraUsbMissingMessage'),
      );
      return;
    }

    if (!lockedLiveSource) {
      Alert.alert(
        i18n.t('cameraNotFoundTitle'),
        i18n.t('cameraNotFoundMessage'),
      );
      return;
    }

    const nativeSourceType =
      lockedLiveSource === 'external' ? 'webcam' : 'phone';
    const nativePhoneFacing = lockedLiveSource === 'front' ? 'front' : 'back';

    if (!shouldUseYouTubeLive) {
      console.log(
        '[Live Flow] skip create reason=selectedPlatform is not youtube',
        {
          selectedLivestreamPlatform,
          currentSource,
          availableSources,
          lockedLiveSource,
        },
      );
      console.log(
        '[Live Flow] local recording active reason=selectedPlatform is not youtube',
      );
      console.log('[Live] local recording mode only:', {
        selectedLivestreamPlatform,
        currentSource,
        availableSources,
        lockedLiveSource,
      });

      pendingYouTubeNativeStartRef.current = null;
      activeYouTubeBroadcastIdRef.current = '';
      setYoutubeLiveOverlay(null);
      setYoutubeLivePreparing(false);
      setYoutubeLivePreviewActive(false);
      setYouTubeNativeCameraLock(false);
      setYouTubeSourceLock(null);
      setActiveGameplaySessionSync({
        matchSessionId: matchSessionIdRef.current,
        webcamFolderName,
        savedAt: Date.now(),
        source: 'on-start-local-recording',
      });
      // Windows: ngắt hẳn gói ghi hình/replay cục bộ để không còn cảnh báo/lỗi đỏ
      // "Windows camera preview is not ready for recording" khi chỉ dùng bảng điểm.
      console.log(
        `[GameMode] currentMode=${currentGameplayModeLabel} event=start-accepted`,
        {rawMode: currentGameplayModeCode},
      );
      console.log(
        `[VideoPipeline] mode=${currentGameplayModeLabel} cameraEnabled=true replayEnabled=${videoPipelineEnabledForCurrentMode} historyEnabled=${videoPipelineEnabledForCurrentMode}`,
      );
      shouldStartRecordingRef.current = shouldUseLocalMatchRecording(
        videoPipelineEnabledForCurrentMode,
      );
      pendingStartRecordingRef.current = shouldStartRecordingRef.current;
      if (isQuickMatchModeActive || isFastModeActive) {
        setPoolBreakEnabled(false);
      }
      setCountdownTime(shouldSuppressMatchCountdown ? 0 : countdownTime);
      setIsStarted(true);
      return;
    }

    if (Platform.OS === 'windows' && shouldUseYouTubeLive) {
      console.log('[LiveWindowsMode]', {
        selectedMode: 'ffmpeg-local-oauth',
        usesNgrok: false,
        usesMetro: false,
        usesRenderForAuth: true,
        usesRenderForStream: false,
      });

      shouldStartRecordingRef.current = shouldUseLocalMatchRecording(
        saveToDeviceWhileStreaming && videoPipelineEnabledForCurrentMode,
      );
      pendingStartRecordingRef.current = shouldStartRecordingRef.current;
      pendingYouTubeNativeStartRef.current = null;
      setYoutubeLiveOverlay(null);
      setYoutubeLivePreparing(true);
      setYoutubeLivePreviewActive(false);
      setYouTubeNativeCameraLock(false);
      setYouTubeSourceLock(null);

      const firstPlayerName =
        playerSettingsRef.current?.playingPlayers?.[0]?.name?.trim() ||
        playerSettings?.playingPlayers?.[0]?.name?.trim() ||
        'Player 1';
      const secondPlayerName =
        playerSettingsRef.current?.playingPlayers?.[1]?.name?.trim() ||
        playerSettings?.playingPlayers?.[1]?.name?.trim() ||
        'Player 2';
      const youtubeTitle = `${firstPlayerName} vs ${secondPlayerName} - ${new Date().toLocaleString()}`;

      const resolveIngestion = (session: any) => {
        const streamUrlWithKey = String(session?.streamUrlWithKey || '').trim();
        const streamUrl = String(
          session?.streamUrl ||
            session?.ingestionAddress ||
            session?.cdn?.ingestionInfo?.ingestionAddress ||
            '',
        ).trim();
        const streamName = String(
          session?.streamName ||
            session?.streamKey ||
            session?.cdn?.ingestionInfo?.streamName ||
            '',
        ).trim();

        if (streamUrl && streamName) {
          return {
            rtmpUrl: streamUrl.replace(/\/+$/g, ''),
            streamKey: streamName,
          };
        }

        if (streamUrlWithKey) {
          const clean = streamUrlWithKey.replace(/\/+$/g, '');
          const lastSlash = clean.lastIndexOf('/');
          if (lastSlash > 0) {
            return {
              rtmpUrl: clean.slice(0, lastSlash),
              streamKey: clean.slice(lastSlash + 1),
            };
          }
        }

        return {
          rtmpUrl: streamUrl || DEFAULT_YOUTUBE_RTMP_URL,
          streamKey: streamName,
        };
      };

      const prepareWindowsFfmpegYouTubeLive = async () => {
        let liveResponse: any = null;

        try {
          const selectedLiveVisibility =
            await readYouTubeVisibilityFromStorage();

          liveResponse = await createYouTubeLiveSession({
            title: youtubeTitle,
            description: i18n.t('youtubeLiveDescription', {
              firstPlayerName,
              secondPlayerName,
            }) as string,
            privacyStatus: selectedLiveVisibility,
            enableAutoStart: true,
            enableAutoStop: true,
            enableDvr: true,
            recordFromStart: true,
            resolution: '1080p',
            frameRate: '30fps',
          });

          const ingestion = resolveIngestion(liveResponse?.session);
          activeYouTubeBroadcastIdRef.current =
            liveResponse?.session?.broadcastId ||
            liveResponse?.session?.id ||
            '';

          console.log('[YouTube Live] created for Windows FFmpeg:', {
            broadcastId: liveResponse?.session?.broadcastId || '',
            streamId: liveResponse?.session?.streamId || '',
            hasRtmpUrl: Boolean(ingestion.rtmpUrl),
            streamKeyMasked: maskStreamKey(ingestion.streamKey),
            watchUrl: liveResponse?.session?.watchUrl || '',
          });

          if (!ingestion.streamKey) {
            throw new Error(i18n.t('youtubeBackendMissingStreamKey'));
          }

          const liveConfigItems = await AsyncStorage.multiGet([
            'WindowsFfmpegPath',
            'WindowsFfmpegCameraDevice',
            'WindowsFfmpegAudioDevice',
          ]);
          const liveConfigLookup = liveConfigItems.reduce<
            Record<string, string>
          >((acc, [key, value]) => ({...acc, [key]: value || ''}), {});

          const windowsLiveConfig: WindowsFfmpegLiveConfig = {
            platform: 'youtube',
            rtmpUrl: ingestion.rtmpUrl || DEFAULT_YOUTUBE_RTMP_URL,
            streamKey: ingestion.streamKey,
            ffmpegPath: liveConfigLookup.WindowsFfmpegPath || '',
            cameraDeviceName: liveConfigLookup.WindowsFfmpegCameraDevice || '',
            audioDeviceName: liveConfigLookup.WindowsFfmpegAudioDevice || '',
            useAudio: Boolean(liveConfigLookup.WindowsFfmpegAudioDevice),
            fps: 30,
            bitrate: '6000k',
          };

          const snapshot = createWindowsFfmpegSnapshotFromGameState({
            gameSettings,
            playerSettings: playerSettingsRef.current || playerSettings,
            currentPlayerIndex,
            countdownTime,
            totalTurns,
          });

          const startResult = await startWindowsFfmpegYouTubeLive(
            windowsLiveConfig,
            snapshot,
          );

          if (!startResult?.ok) {
            const activeYouTubeBroadcastId =
              activeYouTubeBroadcastIdRef.current;
            activeYouTubeBroadcastIdRef.current = '';

            if (activeYouTubeBroadcastId) {
              try {
                await stopYouTubeLiveSession(activeYouTubeBroadcastId);
                console.log(
                  '[YouTube Live] stopped broadcast after FFmpeg start failed:',
                  activeYouTubeBroadcastId,
                );
              } catch (youtubeStopError) {
                console.log(
                  '[YouTube Live] stop after FFmpeg start failed:',
                  youtubeStopError,
                );
              }
            }

            throw new Error(
              startResult?.error || i18n.t('youtubeFfmpegStartFailed'),
            );
          }

          setYoutubeLivePreparing(false);
          setYoutubeLivePreviewActive(false);
          setIsStarted(true);
          setActiveGameplaySessionSync({
            matchSessionId: matchSessionIdRef.current,
            webcamFolderName,
            savedAt: Date.now(),
            source: 'windows-ffmpeg-oauth-live-start',
          });
        } catch (error: any) {
          console.log(
            '[YouTube Live] Windows FFmpeg OAuth/create/start failed:',
            {
              message: error?.message || String(error),
              hasSession: Boolean(liveResponse?.session),
            },
          );

          pendingYouTubeNativeStartRef.current = null;
          activeYouTubeBroadcastIdRef.current = '';
          setYoutubeLivePreparing(false);
          setYoutubeLivePreviewActive(false);
          setIsStarted(false);
          setYouTubeSourceLock(null);

          try {
            await stopWindowsFfmpegYouTubeLive('start-failed');
          } catch {}

          const payload = error?.payload as
            | YouTubeEligibilityResponse
            | undefined;
          const fallbackMessage =
            payload?.message ||
            error?.message ||
            i18n.t('youtubeFfmpegInitFailed');

          try {
            const eligibility =
              payload?.checks?.length || payload?.subscriberCount !== undefined
                ? payload
                : await getYouTubeLiveEligibility();

            showYouTubeLiveFailure(eligibility, fallbackMessage);
          } catch (eligibilityError: any) {
            console.log('[YouTube Live] eligibility failed:', eligibilityError);

            showYouTubeLiveFailure(
              null,
              fallbackMessage ||
                eligibilityError?.message ||
                i18n.t('youtubeEligibilityCheckFailed'),
            );
          }
        }
      };

      void prepareWindowsFfmpegYouTubeLive();
      return;
    }

    setYouTubeSourceLock(lockedLiveSource);
    console.log('[YouTube Live] source resolved:', {
      currentSource,
      availableSources,
      lockedLiveSource,
      nativeSourceType,
      nativePhoneFacing,
    });
    const youtubeNativeModuleMounted = isYouTubeNativeLiveEngineMounted();
    const youtubeNativePreviewAvailable = isYouTubeNativePreviewViewAvailable();
    const youtubeNativeReady = isYouTubeNativeLiveReady();

    console.log(
      '[YouTube Live] native engine mounted=' + youtubeNativeModuleMounted,
    );
    console.log(
      '[YouTube Live] native preview view available=' +
        youtubeNativePreviewAvailable,
    );
    console.log('[YouTube Live] native ready=' + youtubeNativeReady);

    if (!youtubeNativeReady) {
      console.log(
        '[YouTube Live] fallback reason=native module/view manager missing',
        {
          youtubeNativeModuleMounted,
          youtubeNativePreviewAvailable,
        },
      );
      pendingYouTubeNativeStartRef.current = null;
      activeYouTubeBroadcastIdRef.current = '';
      setYoutubeLivePreparing(false);
      setYoutubeLivePreviewActive(false);
      setIsCameraReady(false);
      setIsStarted(false);
      setYouTubeNativeCameraLock(false);
      setYouTubeSourceLock(null);
      setYoutubeLiveOverlay({
        visible: true,
        title: i18n.t('youtubeLiveNotReadyTitle'),
        message: i18n.t('youtubeNativeModuleMissing'),
        checks: [],
      });
      return;
    }

    shouldStartRecordingRef.current = false;
    pendingStartRecordingRef.current = false;
    pendingYouTubeNativeStartRef.current = null;
    setYoutubeLiveOverlay(null);
    setYoutubeLivePreparing(true);
    setYoutubeLivePreviewActive(false);
    setIsCameraReady(false);
    setIsStarted(true);

    const firstPlayerName =
      playerSettings?.playingPlayers?.[0]?.name?.trim() || 'Player 1';
    const secondPlayerName =
      playerSettings?.playingPlayers?.[1]?.name?.trim() || 'Player 2';

    const youtubeTitle = `${firstPlayerName} vs ${secondPlayerName} - ${new Date().toLocaleString()}`;

    const prepareYouTubeLive = async () => {
      try {
        await stopYouTubeNativeLive();
        await stopVideoRecording(false);

        const selectedLiveVisibility = await readYouTubeVisibilityFromStorage();

        const liveResponse = await createYouTubeLiveSession({
          title: youtubeTitle,
          description: i18n.t('youtubeLiveDescription', {
            firstPlayerName,
            secondPlayerName,
          }) as string,
          privacyStatus: selectedLiveVisibility,
          enableAutoStart: true,
          enableAutoStop: true,
        });

        console.log('[YouTube Live] created:', liveResponse?.session);
        console.log(
          '[YouTube Live] broadcastId=' +
            String(liveResponse?.session?.broadcastId || ''),
        );
        console.log(
          '[YouTube Live] streamId=' +
            String(liveResponse?.session?.streamId || ''),
        );
        console.log(
          '[YouTube Live] rtmpUrl exists=' +
            Boolean(liveResponse?.session?.streamUrl),
        );
        console.log(
          '[YouTube Live] streamKey exists=' +
            Boolean(liveResponse?.session?.streamName),
        );
        console.log(
          '[YouTube Live] rtmpUrl received=' +
            Boolean(liveResponse?.session?.streamUrlWithKey),
        );

        activeYouTubeBroadcastIdRef.current =
          liveResponse?.session?.broadcastId || liveResponse?.session?.id || '';
        console.log(
          '[YouTube Live] active broadcast:',
          activeYouTubeBroadcastIdRef.current,
        );
        pendingYouTubeNativeStartRef.current = {
          url: liveResponse.session.streamUrlWithKey,
          options: {
            width: 1920,
            height: 1080,
            fps: 30,
            bitrate: 8000 * 1024,
            audioBitrate: 128 * 1024,
            sampleRate: 44100,
            isStereo: true,
            cameraFacing: nativePhoneFacing,
            sourceType: nativeSourceType,
            rotationDegrees: 0,
          },
        };

        setYoutubeLivePreviewActive(true);
        setYoutubeLivePreparing(false);
        setYoutubeNativeStartNonce(value => value + 1);
      } catch (error: any) {
        console.log('[YouTube Live] create failed:', error);

        pendingYouTubeNativeStartRef.current = null;
        activeYouTubeBroadcastIdRef.current = '';
        setYoutubeLivePreparing(false);
        setYoutubeLivePreviewActive(false);
        setIsCameraReady(false);
        setIsStarted(false);
        setYouTubeSourceLock(null);

        try {
          await stopYouTubeNativeLive();
        } catch {}

        const payload = error?.payload as
          | YouTubeEligibilityResponse
          | undefined;
        const fallbackMessage =
          payload?.message ||
          error?.message ||
          i18n.t('youtubeLiveCannotStart');

        try {
          const eligibility =
            payload?.checks?.length || payload?.subscriberCount !== undefined
              ? payload
              : await getYouTubeLiveEligibility();

          showYouTubeLiveFailure(eligibility, fallbackMessage);
        } catch (eligibilityError: any) {
          console.log('[YouTube Live] eligibility failed:', eligibilityError);

          showYouTubeLiveFailure(
            null,
            fallbackMessage ||
              eligibilityError?.message ||
              i18n.t('youtubeEligibilityCheckFailed'),
          );
        }
      }
    };

    void prepareYouTubeLive();
  }, [
    countdownTime,
    currentGameplayModeCode,
    currentGameplayModeLabel,
    currentPlayerIndex,
    ensureReplayRuntimeState,
    gameSettings,
    getActiveCameraBackend,
    getActiveGameplayCameraSource,
    isUsbWebcamGameplaySourceActive,
    isCameraReady,
    isFastModeActive,
    isQuickMatchModeActive,
    isStarted,
    logRecorderFlow,
    playerSettings,
    readYouTubeVisibilityFromStorage,
    saveToDeviceWhileStreaming,
    routeParams.livestreamPlatform,
    selectedLivestreamPlatform,
    shouldSuppressMatchCountdown,
    shouldUseLocalRecordingOnly,
    shouldUseRtspRecorderNow,
    shouldUseYouTubeLive,
    setActiveReplaySource,
    showYouTubeLiveFailure,
    totalTurns,
    videoPipelineEnabledForCurrentMode,
    warmUpCount,
    warmUpCountdownTime,
    webcamFolderName,
  ]);

  const onToggleCountDown = useCallback(() => {
    if (!isStarted || isPaused) {
      return;
    }

    setIsMatchPaused(prev => !prev);
  }, [isStarted, isPaused]);

  const startNewGameAfterViolate = useCallback(() => {
    if (!playerSettings || !gameSettings) {
      return;
    }

    const refreshedPlayerSettings = {
      ...playerSettings,
      playingPlayers: playerSettings.playingPlayers.map(player => ({
        ...player,
        violate: 0,
        scoredBalls: [],
        proMode: {
          ...player.proMode,
          currentPoint: 0,
          extraTimeTurns: gameSettings?.mode?.extraTimeTurns,
        },
      })),
    } as PlayerSettings;

    setPlayerSettings(refreshedPlayerSettings);
    setWinner(undefined);
    setGameBreakEnabled(false);
    setWarmUpCountdownTime(undefined);
    clearInterval(warmUpCountdownInterval);

    if (gameSettings?.mode?.countdownTime) {
      const extraTimeBonus = isPoolGame(gameSettings?.category)
        ? gameSettings.mode?.extraTimeBonus || 0
        : 0;
      setCountdownTime(gameSettings.mode.countdownTime + extraTimeBonus);
    }

    if (isPoolGame(gameSettings?.category)) {
      setPoolBreakEnabled(!isPool15FreeGame(gameSettings?.category));
    }

    setIsMatchPaused(false);
    setPool8FreeSetWinnerIndex(null);

    onSwitchPoolBreakPlayerIndex(poolBreakPlayerIndex, playerIndex => {
      setCurrentPlayerIndex(playerIndex);
    });
  }, [
    gameSettings,
    playerSettings,
    poolBreakPlayerIndex,
    onSwitchPoolBreakPlayerIndex,
  ]);

  const serializeReplayFileForRoute = useCallback((file: any): PreparedVarReplayFile => ({
    name: String(file?.name || file?.path?.split('/')?.pop?.() || 'replay.mp4'),
    path: String(file?.path || ''),
    size: Number(file?.size || 0) || undefined,
    segmentIndex: Number.isFinite(Number(file?.segmentIndex))
      ? Number(file.segmentIndex)
      : undefined,
    segmentStartedAt: Number(file?.segmentStartedAt || 0) || undefined,
    createdAtMs: Number(file?.createdAtMs || 0) || undefined,
    durationSeconds: Number(file?.durationSeconds || 0) || undefined,
    sourceFileName: file?.sourceFileName ? String(file.sourceFileName) : undefined,
    playbackFileName: file?.playbackFileName ? String(file.playbackFileName) : undefined,
    smoothPlaybackFileName: file?.smoothPlaybackFileName ? String(file.smoothPlaybackFileName) : undefined,
    containerType: file?.containerType ? String(file.containerType) : undefined,
    playbackContainerType: file?.playbackContainerType ? String(file.playbackContainerType) : undefined,
    smoothPlaybackContainerType: file?.smoothPlaybackContainerType ? String(file.smoothPlaybackContainerType) : undefined,
  }), []);

  const resetPreparedVarReplay = useCallback((source?: GameplayCameraSourceKey) => {
    const resolvedSource = source || getLockedGameplayCameraSource();
    const replayKey = getReplayKeyForSource(resolvedSource);
    varReplayPreparePromiseByKeyRef.current[replayKey] = null;
    varReplayPayloadByKeyRef.current[replayKey] = null;
    isVarReplayReadyByKeyRef.current[replayKey] = false;

    if (!activeReplayKeyRef.current || activeReplayKeyRef.current === replayKey) {
      varReplayPreparePromiseRef.current = null;
      varReplayPayloadRef.current = null;
      isVarReplayReadyRef.current = false;
      setIsVarReplayPreparing(false);
      setIsVarReplayReady(false);
    }
  }, [getLockedGameplayCameraSource, getReplayKeyForSource]);

  const prepareVarReplayAfterPause = useCallback(async (
    pauseStartedAt: number,
    finalizedPath?: string,
    explicitSource?: GameplayCameraSourceKey,
  ): Promise<PreparedVarReplayPayload | null> => {
    const prepareStartedAt = Date.now();
    const replaySource = explicitSource || getLockedGameplayCameraSource();
    const replayKey = getReplayKeyForSource(replaySource);
    const replayState = ensureReplayRuntimeState(replaySource);
    console.log(
      `[ReplayVAR] mode=${currentGameplayModeLabel} prepare-start`,
      {webcamFolderName, finalizedPath, replaySource, replayKey},
    );
    recordDebugLog('ReplayVAR', 'prepare-start', {
      mode: currentGameplayModeLabel,
      rawMode: currentGameplayModeCode,
      webcamFolderName,
      finalizedPath,
      source: replaySource,
      replayKey,
    });
    recordDebugLog('VARLatency', 'prepare-var-start', {
      t: prepareStartedAt,
      durationMsFromPause: prepareStartedAt - pauseStartedAt,
      webcamFolderName,
      matchSessionId: matchSessionIdRef.current,
      finalizedPath,
      source: replaySource,
      replayKey,
    });

    try {
      // Build the RTSP/USB replay exactly as a video output, not as a playlist.
      // RTSP used to work because one long segment could be tailed by the player;
      // USB writes short chunks, so both sources now go through the same
      // single-file builder: pick the last 30s window then remux/concat to
      // replay_latest.mp4 before playback.
      const targetReplayDurationMs = Math.min(
        30 * 1000,
        Math.max(0, Number(totalTimeRef.current || 0) * 1000),
      );
      const replayLatestFile = await buildReplayLatestForSource(
        webcamFolderName,
        {source: replaySource, requestedWindowMs: targetReplayDurationMs || 30 * 1000},
      );
      let sourceWindowFiles = replayLatestFile?.path ? [replayLatestFile as any] : [];
      let payloadFiles = sourceWindowFiles.map(serializeReplayFileForRoute);

      if (replaySource === 'usb') {
        recordDebugLog('USBReplayDuration', 'recordingStartedAtMs=' + String(Math.max(0, currentReplaySegmentWallStartMsRef.current || 0)), {
          source: 'usb',
          replayKey,
          recordingStartedAtMs: Math.max(0, currentReplaySegmentWallStartMsRef.current || 0),
        });
        recordDebugLog('USBReplayDuration', 'nowMs=' + String(Date.now()), {source: 'usb', replayKey, nowMs: Date.now()});
        recordDebugLog('USBReplayDuration', 'elapsedMs=' + String(Math.max(0, Number(totalTimeRef.current || 0) * 1000)), {source: 'usb', replayKey, elapsedMs: Math.max(0, Number(totalTimeRef.current || 0) * 1000)});
        recordDebugLog('USBReplayDuration', 'targetReplayDurationMs=' + String(targetReplayDurationMs), {source: 'usb', replayKey, targetReplayDurationMs});
      }

      if (payloadFiles.length === 0) {
        const files = await listReplayFiles(webcamFolderName, {
          mode: 'var',
          source: replaySource,
        });
        sourceWindowFiles = files.filter(file => String(file?.path || '').length > 0);
        payloadFiles = sourceWindowFiles.map(serializeReplayFileForRoute);
      }

      if (payloadFiles.length === 0 && finalizedPath) {
        const finalizedInfo = await inspectRecordedVideoFile(finalizedPath, replaySource);
        const replayLogTag = replaySource === 'usb' ? 'USBReplay' : replaySource === 'rtsp' ? 'RTSPReplay' : 'ReplayVAR';
        recordDebugLog(replayLogTag, finalizedInfo.usable ? 'replay-ready path=' + finalizedPath + ' size=' + String(finalizedInfo.size) : 'replay-not-ready reason=finalized-path-not-usable', {
          path: finalizedPath,
          fileExists: finalizedInfo.exists,
          fileSize: finalizedInfo.size,
          source: replaySource,
          replayKey,
        });
        if (finalizedInfo.usable) {
          sourceWindowFiles = [
            {
              name: finalizedPath.split(/[\/]/).pop() || 'replay.mp4',
              path: finalizedPath,
              size: finalizedInfo.size,
              mtime: new Date(currentReplaySegmentWallStartMsRef.current || Date.now()),
              ctime: new Date(currentReplaySegmentWallStartMsRef.current || Date.now()),
              isFile: () => true,
              isDirectory: () => false,
              segmentIndex: currentReplaySegmentIndexRef.current,
              segmentStartedAt: currentReplaySegmentWallStartMsRef.current || Date.now(),
              createdAtMs: currentReplaySegmentWallStartMsRef.current || Date.now(),
              durationSeconds: Math.max(0, totalTimeRef.current - currentReplaySegmentStartTotalTimeRef.current),
              containerType: finalizedPath.split('.').pop()?.toLowerCase() || 'mp4',
              source: replaySource,
            } as any,
          ];
          payloadFiles = sourceWindowFiles.map(serializeReplayFileForRoute);
        }
      }

      const selectedReplayDurationSeconds = payloadFiles.reduce((sum, file) => {
        const explicitDuration = Number(file.durationSeconds || 0);
        if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
          return sum + explicitDuration;
        }
        return sum + (replaySource === 'usb' ? 5 : 30);
      }, 0);
      const actualReplayDurationMs = Math.min(
        30 * 1000,
        Math.max(0, Math.round(selectedReplayDurationSeconds * 1000)),
      );
      const elapsedMsForReplay = Math.max(0, Number(totalTimeRef.current || 0) * 1000);

      if (replaySource === 'usb') {
        recordDebugLog('USBReplayBuffer', 'windowMs=30000', {
          source: 'usb',
          replayKey,
          windowMs: 30 * 1000,
          webcamFolderName,
        });
        recordDebugLog('USBReplayBuffer', 'elapsedMs=' + String(elapsedMsForReplay), {
          source: 'usb',
          replayKey,
          elapsedMs: elapsedMsForReplay,
          totalTime: totalTimeRef.current,
        });
        recordDebugLog('USBReplayBuffer', 'segmentCount=' + String(payloadFiles.length), {
          source: 'usb',
          replayKey,
          segmentCount: payloadFiles.length,
        });
        recordDebugLog('USBReplayBuffer', 'selectedSegments=' + JSON.stringify(payloadFiles.map(file => file.path)), {
          source: 'usb',
          replayKey,
          selectedSegments: payloadFiles.map(file => ({
            path: file.path,
            size: file.size,
            durationSeconds: file.durationSeconds,
            segmentIndex: file.segmentIndex,
          })),
        });
        recordDebugLog('USBReplay', 'requestedDurationMs=30000', {
          source: 'usb',
          replayKey,
          requestedDurationMs: 30 * 1000,
        });
        recordDebugLog('USBReplay', 'actualDurationMs=' + String(actualReplayDurationMs), {
          source: 'usb',
          replayKey,
          actualDurationMs: actualReplayDurationMs,
          reason: elapsedMsForReplay < 30 * 1000 ? 'match-shorter-than-window' : 'rolling-window',
        });
      }

      if (sourceWindowFiles.length > 0) {
        if (payloadFiles.length === 1 && String(payloadFiles[0]?.path || '').toLowerCase().endsWith('/replay_latest.mp4')) {
          recordDebugLog('ReplayPlayer', 'playingSingleFile=true', {
            source: replaySource,
            replayKey,
            path: payloadFiles[0].path,
            size: Number(payloadFiles[0]?.size || 0),
            reason: 'prebuilt-replay-latest',
          });
        } else {
          const replayLatestFallback = await buildReplayLatestFile(
            webcamFolderName,
            sourceWindowFiles as any,
            {source: replaySource, requestedWindowMs: 30 * 1000},
          );
          if (replayLatestFallback?.path) {
            payloadFiles = [serializeReplayFileForRoute(replayLatestFallback as any)];
            recordDebugLog('ReplayPlayer', 'playingSingleFile=true', {
              source: replaySource,
              replayKey,
              path: replayLatestFallback.path,
              size: Number((replayLatestFallback as any)?.size || 0),
            });
          } else {
            payloadFiles = [];
            recordDebugLog('ReplayPlayer', 'playingSingleFile=false', {
              source: replaySource,
              replayKey,
              reason: 'replay_latest_build_failed',
              selectedSegments: sourceWindowFiles.map(file => file.path),
            });
          }
        }
      }

      const latestPath = payloadFiles[payloadFiles.length - 1]?.path || finalizedPath;
      const doneAt = Date.now();

      const payload: PreparedVarReplayPayload | null = payloadFiles.length > 0
        ? {
            mode: 'var',
            webcamFolderName,
            matchSessionId: matchSessionIdRef.current,
            preparedAt: doneAt,
            files: payloadFiles,
            latestPath,
            source: 'pause-prepared',
          }
        : null;

      replayState.replayReady = Boolean(payload);
      replayState.latestReplayPath = latestPath;
      replayState.lastError = payload ? undefined : 'no-var-payload';
      replayStateByKeyRef.current[replayKey] = replayState;

      recordDebugLog('ReplayRegistry', 'key=' + replayKey + ' segmentCount=' + String(payloadFiles.length), {
        key: replayKey,
        source: replaySource,
        matchId: webcamFolderName,
        segmentCount: payloadFiles.length,
        latestPath,
      });

      recordDebugLog('VARLatency', 'prepare-var-done', {
        t: doneAt,
        durationMs: doneAt - prepareStartedAt,
        totalMsFromPause: doneAt - pauseStartedAt,
        webcamFolderName,
        matchSessionId: matchSessionIdRef.current,
        fileCount: payloadFiles.length,
        latestPath,
        paths: payloadFiles.map(file => file.path),
        ready: Boolean(payload),
        source: replaySource,
        replayKey,
      });

      if (payload) {
        console.log(
          `[ReplayVAR] mode=${currentGameplayModeLabel} ready`,
          {fileCount: payloadFiles.length, latestPath},
        );
        recordDebugLog('ReplayVAR', 'ready', {
          mode: currentGameplayModeLabel,
          rawMode: currentGameplayModeCode,
          totalMsFromPause: doneAt - pauseStartedAt,
          fileCount: payloadFiles.length,
          latestPath,
        });
        recordDebugLog('VARLatency', 'var-ready', {
          totalMsFromPause: doneAt - pauseStartedAt,
          fileCount: payloadFiles.length,
          latestPath,
        });
      }

      return payload;
    } catch (error) {
      recordDebugLog('VARLatency', 'prepare-var-failed', {
        t: Date.now(),
        durationMs: Date.now() - prepareStartedAt,
        webcamFolderName,
        error: String((error as any)?.message || error),
      });
      return null;
    }
  }, [
    currentGameplayModeCode,
    currentGameplayModeLabel,
    ensureReplayRuntimeState,
    getLockedGameplayCameraSource,
    getReplayKeyForSource,
    inspectRecordedVideoFile,
    serializeReplayFileForRoute,
    webcamFolderName,
  ]);

  const onPause = useCallback(() => {
    if (isPaused) {
      void setReplayResumeSnapshot(null);
      setReplayReturnRequestSync(null);

      if (pendingNewGameAfterViolateRef.current) {
        pendingNewGameAfterViolateRef.current = false;
        startNewGameAfterViolate();
        resetPreparedVarReplay();
        setIsPaused(false);

        shouldStartRecordingRef.current = shouldUseLocalMatchRecording(
          videoPipelineEnabledForCurrentMode,
        );
        pendingStartRecordingRef.current = shouldStartRecordingRef.current;
        return;
      }

      _resetCountdown(true);
      resetPreparedVarReplay();
      setIsPaused(false);

      shouldStartRecordingRef.current = shouldUseLocalMatchRecording(
        videoPipelineEnabledForCurrentMode,
      );
      pendingStartRecordingRef.current = shouldStartRecordingRef.current;
      return;
    }

    clearInterval(countdownInterval);
    const pauseClickedAt = Date.now();
    const pauseReplaySource = getLockedGameplayCameraSource();
    const pauseReplayKey = getReplayKeyForSource(pauseReplaySource);
    setActiveReplaySource(pauseReplaySource);
    console.log(
      `[ReplayVAR] mode=${currentGameplayModeLabel} prepare-start`,
      {reason: 'pause', webcamFolderName, source: pauseReplaySource, replayKey: pauseReplayKey},
    );
    recordDebugLog('VARLatency', 'pause-clicked', {
      t: pauseClickedAt,
      webcamFolderName,
      matchSessionId: matchSessionIdRef.current,
      source: pauseReplaySource,
      replayKey: pauseReplayKey,
    });
    shouldStartRecordingRef.current = false;
    pendingStartRecordingRef.current = false;
    resetPreparedVarReplay(pauseReplaySource);
    setIsPaused(true);
    recordDebugLog('GameplaySession', 'pause-for-replay sessionId=' + String(matchSessionIdRef.current), {
      sessionId: matchSessionIdRef.current,
      webcamFolderName,
      source: pauseReplaySource,
      replayKey: pauseReplayKey,
      started: isStarted,
      score: getScoreSnapshotFromPlayerSettings(playerSettingsRef.current || playerSettings),
      timer: totalTimeRef.current || totalTime,
      turn: totalTurnsRef.current || totalTurns,
    });

    logRecorderFlow('pause-stop-request', {
      backend: getActiveCameraBackend(),
      source: pauseReplaySource,
      replayKey: pauseReplayKey,
    });
    recordDebugLog('VARLatency', 'stop-recording-start', {
      t: Date.now(),
      webcamFolderName,
      activeBackend: getActiveCameraBackend(),
    });

    const stopStartedAt = Date.now();
    const pauseFinalizeRawPromise = stopVideoRecording(false)
      .then(path => {
        const stopDoneAt = Date.now();
        recordDebugLog('VARLatency', 'stop-recording-done', {
          t: stopDoneAt,
          durationMs: stopDoneAt - stopStartedAt,
          totalMsFromPause: stopDoneAt - pauseClickedAt,
          webcamFolderName,
          path,
          source: pauseReplaySource,
          replayKey: pauseReplayKey,
        });
        recordDebugLog('VARLatency', 'register-segment-done', {
          t: stopDoneAt,
          durationMs: stopDoneAt - stopStartedAt,
          totalMsFromPause: stopDoneAt - pauseClickedAt,
          webcamFolderName,
          path,
          source: pauseReplaySource,
          replayKey: pauseReplayKey,
        });
        logRecorderFlow(path ? 'replay-ready' : 'stop-failed', {
          backend: getActiveCameraBackend(),
          source: pauseReplaySource,
          replayKey: pauseReplayKey,
          path,
          reason: path
            ? undefined
            : 'pause stop did not produce a valid segment',
        });
        return path;
      })
      .catch(error => {
        logRecorderFlow('stop-failed', {
          backend: getActiveCameraBackend(),
          error,
          reason: 'pause stop threw error',
        });
        recordDebugLog('RecorderFlow', 'pause-stop-async-failed', {
          error: String((error as any)?.message || error),
        });
        return undefined;
      })
      .finally(() => {
        if (recordingFinalizePromiseRef.current === pauseFinalizeRawPromise) {
          recordingFinalizePromiseRef.current = null;
        }
      });

    recordingFinalizePromiseRef.current = pauseFinalizeRawPromise;
    setIsVarReplayPreparing(true);

    // Long-match replay must never wait for the current recorder stop/finalize.
    // A 1-hour USB match already has a rolling buffer of finalized 4-5s chunks;
    // blocking on the current UVC segment can leave the UI stuck at
    // "Đang chuẩn bị..." when MediaCodec starts a 0-byte segment near the end.
    // Build replay_latest.mp4 immediately from the last 30s rolling buffer, then
    // refresh it in the background if the current stop later produces a segment.
    recordDebugLog('VARLatency', 'prepare-from-rolling-buffer-start', {
      t: Date.now(),
      webcamFolderName,
      matchSessionId: matchSessionIdRef.current,
      source: pauseReplaySource,
      replayKey: pauseReplayKey,
      reason: 'do-not-block-on-current-segment-stop',
    });

    const quickPreparePromise = prepareVarReplayAfterPause(
      pauseClickedAt,
      undefined,
      pauseReplaySource,
    );

    const preparePromise = quickPreparePromise
      .then(async quickPayload => {
        if (quickPayload?.files?.length) {
          recordDebugLog('VARLatency', 'prepare-from-rolling-buffer-done', {
            t: Date.now(),
            durationMs: Date.now() - pauseClickedAt,
            webcamFolderName,
            matchSessionId: matchSessionIdRef.current,
            fileCount: quickPayload.files.length,
            latestPath: quickPayload.files[quickPayload.files.length - 1]?.path,
            source: pauseReplaySource,
            replayKey: pauseReplayKey,
            ready: true,
          });
          return quickPayload;
        }

        // Short matches may not have a finalized chunk yet. Wait briefly for the
        // stop result, but cap the wait so replay never hangs forever.
        const finalizedPath = await withVarReplayPrepareTimeout(
          pauseFinalizeRawPromise,
          pauseReplaySource === 'usb' ? 2500 : 3500,
          'pauseFinalizeForReplay',
        );
        recordDebugLog('VARLatency', 'prepare-after-short-finalize', {
          t: Date.now(),
          webcamFolderName,
          matchSessionId: matchSessionIdRef.current,
          finalizedPath,
          source: pauseReplaySource,
          replayKey: pauseReplayKey,
        });
        return prepareVarReplayAfterPause(
          pauseClickedAt,
          finalizedPath,
          pauseReplaySource,
        );
      })
      .then(payload => {
        varReplayPayloadByKeyRef.current[pauseReplayKey] = payload;
        isVarReplayReadyByKeyRef.current[pauseReplayKey] = Boolean(payload?.files?.length);
        if (activeReplayKeyRef.current === pauseReplayKey) {
          varReplayPayloadRef.current = payload;
          isVarReplayReadyRef.current = Boolean(payload?.files?.length);
          setIsVarReplayReady(Boolean(payload?.files?.length));
        }
        return payload;
      })
      .catch(error => {
        recordDebugLog('VARLatency', 'prepare-var-failed', {
          t: Date.now(),
          webcamFolderName,
          error: String((error as any)?.message || error),
          source: pauseReplaySource,
          replayKey: pauseReplayKey,
        });
        varReplayPayloadByKeyRef.current[pauseReplayKey] = null;
        isVarReplayReadyByKeyRef.current[pauseReplayKey] = false;
        if (activeReplayKeyRef.current === pauseReplayKey) {
          varReplayPayloadRef.current = null;
          isVarReplayReadyRef.current = false;
          setIsVarReplayReady(false);
        }
        return null;
      })
      .finally(() => {
        varReplayPreparePromiseByKeyRef.current[pauseReplayKey] = null;
        if (activeReplayKeyRef.current === pauseReplayKey) {
          setIsVarReplayPreparing(false);
        }
      });

    // If the current stop later succeeds, rebuild the 30s output in background
    // so the freshest finalized chunk is available for a second replay tap. This
    // never holds the UI in the preparing state.
    void pauseFinalizeRawPromise.then(path => {
      if (!path) {
        return;
      }
      void prepareVarReplayAfterPause(Date.now(), path, pauseReplaySource)
        .then(payload => {
          if (!payload?.files?.length) {
            return;
          }
          varReplayPayloadByKeyRef.current[pauseReplayKey] = payload;
          isVarReplayReadyByKeyRef.current[pauseReplayKey] = true;
          if (activeReplayKeyRef.current === pauseReplayKey) {
            varReplayPayloadRef.current = payload;
            isVarReplayReadyRef.current = true;
            setIsVarReplayReady(true);
          }
          recordDebugLog('VARLatency', 'background-refresh-after-finalize-done', {
            t: Date.now(),
            webcamFolderName,
            matchSessionId: matchSessionIdRef.current,
            fileCount: payload.files.length,
            latestPath: payload.files[payload.files.length - 1]?.path,
            source: pauseReplaySource,
            replayKey: pauseReplayKey,
          });
        })
        .catch(error => {
          recordDebugLog('VARLatency', 'background-refresh-after-finalize-failed', {
            error: String((error as any)?.message || error),
            source: pauseReplaySource,
            replayKey: pauseReplayKey,
          });
        });
    });

    varReplayPreparePromiseByKeyRef.current[pauseReplayKey] = preparePromise;
    varReplayPreparePromiseRef.current = preparePromise;
  }, [
    isPaused,
    _resetCountdown,
    currentGameplayModeLabel,
    videoPipelineEnabledForCurrentMode,
    getActiveCameraBackend,
    getActiveGameplayCameraSource,
    getReplayKeyForSource,
    logRecorderFlow,
    prepareVarReplayAfterPause,
    resetPreparedVarReplay,
    setActiveReplaySource,
    startNewGameAfterViolate,
    webcamFolderName,
    youtubeLiveNativeMode,
  ]);

  const onReplay = useCallback(async () => {
    if (!isStarted || !webcamFolderName) {
      return;
    }

    if (!isPaused) {
      Alert.alert(
        i18n.t('txtwarn'),
        i18n.t('msgReplayPauseFirst') ||
          'Tạm dừng trận rồi bấm Xem lại để mở video.',
      );
      return;
    }

    try {
      shouldStartRecordingRef.current = false;
      pendingStartRecordingRef.current = false;

      const replayClickedAt = Date.now();
      const replaySource = getLockedGameplayCameraSource();
      const replayKey = getReplayKeyForSource(replaySource);
      const usbReplaySourceActive = replaySource === 'usb';
      const replayLogTag = replaySource === 'usb' ? 'USBReplay' : replaySource === 'rtsp' ? 'RTSPReplay' : 'ReplayVAR';
      setActiveReplaySource(replaySource);
      recordDebugLog(replayLogTag, 'replay-request key=' + replayKey, {
        source: replaySource,
        replayKey,
        webcamFolderName,
        matchSessionId: matchSessionIdRef.current,
        isRecording: isRecordingRef.current,
        isStopping: isStoppingRecordingRef.current,
        pendingFinalize: Boolean(recordingFinalizePromiseRef.current),
      });
      recordDebugLog('VARLatency', 'replay-clicked', {
        t: replayClickedAt,
        webcamFolderName,
        matchSessionId: matchSessionIdRef.current,
        source: replaySource,
        replayKey,
      });

      await flushReplayScoreboardTimeline(webcamFolderName);

      let preparedPayload = varReplayPayloadByKeyRef.current[replayKey] || null;
      const preparePromiseForKey = varReplayPreparePromiseByKeyRef.current[replayKey] || null;
      recordDebugLog('VARLatency', 'cached-payload-exists', {
        exists: Boolean(preparedPayload),
        ready: Boolean(isVarReplayReadyByKeyRef.current[replayKey]),
        preparing: Boolean(preparePromiseForKey),
        fileCount: preparedPayload?.files?.length || 0,
        source: replaySource,
        replayKey,
      });

      if (!preparedPayload && preparePromiseForKey) {
        const waitStartedAt = Date.now();
        const maxPrepareWaitMs = usbReplaySourceActive ? 1500 : 1500;
        recordDebugLog('VARLatency', 'wait-prepare-start', {
          t: waitStartedAt,
          maxWaitMs: maxPrepareWaitMs,
          source: replaySource,
          replayKey,
        });
        preparedPayload =
          (await withVarReplayPrepareTimeout(
            preparePromiseForKey,
            maxPrepareWaitMs,
            'prepareVarReplay',
          )) || null;
        recordDebugLog('VARLatency', 'wait-prepare-done', {
          t: Date.now(),
          durationMs: Date.now() - waitStartedAt,
          success: Boolean(preparedPayload),
          fileCount: preparedPayload?.files?.length || 0,
          source: replaySource,
          replayKey,
        });
      }

      if (!preparedPayload) {
        // Last-resort quick read of the current source/key only. Do not wait for
        // a USB-specific first segment and do not let USB state affect RTSP.
        preparedPayload = await prepareVarReplayAfterPause(replayClickedAt, undefined, replaySource);
        if (preparedPayload) {
          varReplayPayloadByKeyRef.current[replayKey] = preparedPayload;
          isVarReplayReadyByKeyRef.current[replayKey] = true;
          if (activeReplayKeyRef.current === replayKey) {
            varReplayPayloadRef.current = preparedPayload;
            isVarReplayReadyRef.current = true;
            setIsVarReplayReady(true);
          }
        }
      }

      const replayFolderPath = `ReplayBuffer/${webcamFolderName}/${replaySource}`;
      const playableCount = preparedPayload?.files?.length || 0;

      recordDebugLog('ReplayReadyCheck', 'open-replay-ready-check', {
        webcamFolderName,
        matchSessionId: matchSessionIdRef.current,
        source: replaySource,
        replayKey,
        replayFolder: replayFolderPath,
        replayBufferCount: playableCount,
        replayFileCount: playableCount,
        playableCount,
        selectedSource: playableCount > 0 ? 'prepared-var-payload' : 'not-ready',
        selectedPaths: preparedPayload?.files?.map(file => file.path) || [],
        isRecording: isRecordingRef.current,
        isStopping: isStoppingRecordingRef.current,
        pendingFinalize: Boolean(recordingFinalizePromiseRef.current),
        activeCameraBackend: getActiveCameraBackend(),
        startOffsetMs: 30 * 1000,
        reasonIfNotReady:
          playableCount === 0
            ? 'var payload not ready yet; wait for pause prepare to finish'
            : undefined,
      });

      if (!preparedPayload || playableCount === 0) {
        const expectedUsbPath = usbReplaySourceActive
          ? String((globalThis as any).__APLUS_USB_RECORDING_OUTPUT_PATH__ || '').trim()
          : '';
        const expectedUsbInfo = expectedUsbPath
          ? await inspectRecordedVideoFile(expectedUsbPath, 'usb')
          : {exists: false, size: 0, usable: false};
        let usbPreviewStatus: any = null;
        if (usbReplaySourceActive) {
          try {
            usbPreviewStatus = await getUvcPreviewStatus();
          } catch (statusError) {
            usbPreviewStatus = {statusError: String((statusError as any)?.message || statusError)};
          }
        }
        const usbPreviewHasFrame = usbPreviewStatus?.previewFirstFrameReceived === true || Number(usbPreviewStatus?.lastFrameAgeMs ?? -1) >= 0;
        const usbRecorderHasFrame = usbPreviewStatus?.recorderFirstFrameReceived === true || Number(expectedUsbInfo.size || 0) > 0 || Number(usbPreviewStatus?.recordingFileSize || 0) > 0;
        const currentBufferDurationMs = Math.max(0, Date.now() - Math.max(0, currentReplaySegmentWallStartMsRef.current || Date.now()));
        if (usbReplaySourceActive) {
          recordDebugLog('USBReplay', 'current-buffer-duration-ms=' + String(currentBufferDurationMs), {
            source: 'usb',
            replayKey,
            currentBufferDurationMs,
          });
          recordDebugLog('USBReplay', 'current-recording-file-size=' + String(Number(expectedUsbInfo.size || usbPreviewStatus?.recordingFileSize || 0)), {
            source: 'usb',
            replayKey,
            expectedUsbPath,
            fileSize: Number(expectedUsbInfo.size || usbPreviewStatus?.recordingFileSize || 0),
          });
        }
        const notReadyReason = usbReplaySourceActive
          ? 'Video USB đang chuẩn bị, vui lòng bấm lại sau giây lát.'
          : 'Đang chuẩn bị video xem lại, thử lại sau giây lát.';

        const runtimeState = ensureReplayRuntimeState(replaySource);
        runtimeState.replayReady = false;
        runtimeState.lastError = usbReplaySourceActive ? 'no-frame-yet' : 'payload-not-ready';
        replayStateByKeyRef.current[replayKey] = runtimeState;

        recordDebugLog(replayLogTag, 'not-ready reason=' + (usbReplaySourceActive ? 'no-frame-yet' : 'payload-not-ready'), {
          source: replaySource,
          replayKey,
          webcamFolderName,
          expectedUsbPath,
          fileExists: expectedUsbInfo.exists,
          fileSize: expectedUsbInfo.size,
          usbPreviewStatus,
          usbPreviewHasFrame,
          usbRecorderHasFrame,
          currentBufferDurationMs,
          playableCount,
          pendingFinalize: Boolean(recordingFinalizePromiseRef.current),
          isRecording: isRecordingRef.current,
          isStopping: isStoppingRecordingRef.current,
        });
        if (usbReplaySourceActive && usbPreviewHasFrame && !usbRecorderHasFrame) {
          recordDebugLog('USBReplay', 'not-ready reason=preview-has-frame-but-recorder-has-no-frame', {
            source: 'usb',
            replayKey,
            expectedUsbPath,
            fileExists: expectedUsbInfo.exists,
            fileSize: expectedUsbInfo.size,
            usbPreviewStatus,
          });
        }

        Alert.alert(
          i18n.t('txtwarn'),
          notReadyReason,
        );
        return;
      }

      const latestReplayFile = preparedPayload.files[preparedPayload.files.length - 1];
      recordDebugLog(replayLogTag, 'instant-path-used', {
        source: replaySource,
        replayKey,
        webcamFolderName,
        fileCount: playableCount,
        paths: preparedPayload.files.map(file => file.path),
      });
      if (usbReplaySourceActive) {
        const currentBufferDurationMs = Math.max(0, Date.now() - Math.max(0, currentReplaySegmentWallStartMsRef.current || Date.now()));
        recordDebugLog('USBReplay', 'current-buffer-duration-ms=' + String(currentBufferDurationMs), {
          source: 'usb',
          replayKey,
          currentBufferDurationMs,
        });
        recordDebugLog('USBReplay', 'current-recording-file-size=' + String(Number(latestReplayFile?.size || 0)), {
          source: 'usb',
          replayKey,
          path: latestReplayFile?.path || preparedPayload.latestPath,
          fileSize: Number(latestReplayFile?.size || 0),
        });
        recordDebugLog('USBReplay', 'create-short-clip', {
          source: 'usb',
          replayKey,
          duration: latestReplayFile?.durationSeconds,
          path: latestReplayFile?.path || preparedPayload.latestPath,
        });
      }
      const replayRuntimeState = ensureReplayRuntimeState(replaySource);
      replayRuntimeState.replayReady = true;
      replayRuntimeState.latestReplayPath = latestReplayFile?.path || preparedPayload.latestPath;
      replayRuntimeState.segmentRegistry = preparedPayload.files.map(file => String(file.path || '')).filter(Boolean);
      replayStateByKeyRef.current[replayKey] = replayRuntimeState;
      const preparedPayloadDurationMs = Math.min(
        30 * 1000,
        Math.max(
          0,
          Math.round(
            preparedPayload.files.reduce((sum, file) => {
              const explicitDuration = Number(file.durationSeconds || 0);
              return sum + (explicitDuration > 0 ? explicitDuration : replaySource === 'usb' ? 5 : 30);
            }, 0) * 1000,
          ),
        ),
      );
      recordDebugLog(replayLogTag, 'replay-ready path=' + String(latestReplayFile?.path || preparedPayload.latestPath || '') + ' size=' + String(latestReplayFile?.size || 0) + ' duration=' + String(preparedPayloadDurationMs), {
        source: replaySource,
        replayKey,
        path: latestReplayFile?.path || preparedPayload.latestPath,
        fileSize: latestReplayFile?.size || 0,
        playableCount,
        durationMs: preparedPayloadDurationMs,
      });

      const latestPlayerSettingsForReplay =
        playerSettingsRef.current || playerSettings;
      const latestWinnerForReplay = winnerRef.current || winner;
      const replayScoreSnapshot = getScoreSnapshotFromPlayerSettings(
        latestPlayerSettingsForReplay,
      );

      setActiveGameplaySessionSync({
        matchSessionId: matchSessionIdRef.current,
        webcamFolderName,
        savedAt: Date.now(),
        source: 'open-replay',
      });
      recordDebugLog('GameplaySession', 'open-replay sessionId=' + String(matchSessionIdRef.current), {
        sessionId: matchSessionIdRef.current,
        webcamFolderName,
        source: replaySource,
        replayKey,
        started: isStarted,
        paused: isPaused,
        score: replayScoreSnapshot,
        timer: totalTimeRef.current || totalTime,
        turn: totalTurnsRef.current || totalTurns,
      });

      console.log('[ReplayReturnFlow]', {
        event: 'openReplay',
        scoreBeforeReplay: replayScoreSnapshot,
        scoreAfterReplayClose: undefined,
        matchIdBeforeReplay: matchSessionIdRef.current,
        matchIdAfterReplayClose: undefined,
        historyPathBeforeReplay:
          lastRecordedVideoPathRef.current || preparedPayload.latestPath,
        historyPathAfterReplayClose: undefined,
        replayCleanupTouchedHistory: false,
        replayCleanupTouchedScore: false,
      });

      await setReplayResumeSnapshot({
        matchSessionId: matchSessionIdRef.current,
        webcamFolderName,
        currentPlayerIndex,
        poolBreakPlayerIndex,
        totalTurns,
        totalTime,
        countdownTime,
        warmUpCount,
        warmUpCountdownTime,
        playerSettings: cloneReplayValue(latestPlayerSettingsForReplay),
        winner: cloneReplayValue(latestWinnerForReplay),
        // VAR replay is only opened from a paused, already-started match.  Do not
        // persist a stale false value from a pre-render closure; otherwise the
        // GamePlay screen rejects the resume snapshot and initializes a new match
        // when returning from Playback.  Keep the countdown-pause state separate:
        // opening replay pauses the gameplay screen, but it must not force the
        // match countdown itself to stay paused after pressing "Tiếp tục trận đấu".
        isStarted: true,
        isPaused: true,
        isMatchPaused,
        matchCountdownPausedBeforeReplay: isMatchPaused,
        gameBreakEnabled,
        poolBreakEnabled,
        soundEnabled,
        proModeEnabled,
        restoreOnNextFocus: true,
        savedAt: Date.now(),
        aplusLiveMatchIdentity: currentAplusLiveMatchIdentity || undefined,
        cameraSource: replaySource,
      });

      const navigateAt = Date.now();
      recordDebugLog('VARLatency', 'navigate-playback', {
        t: navigateAt,
        replayClickToNavigateMs: navigateAt - replayClickedAt,
        fileCount: preparedPayload.files.length,
        latestPath: preparedPayload.latestPath,
      });
      recordDebugLog('VARLatency', 'replay-click-to-navigate', {
        durationMs: navigateAt - replayClickedAt,
      });

      push(screens.playback, {
        webcamFolderName,
        merged: false,
        returnToMatch: true,
        matchSessionId: matchSessionIdRef.current,
        preparedVarReplayFiles: preparedPayload.files,
        preparedVarReplayAt: preparedPayload.preparedAt,
        replayClickAt: replayClickedAt,
      });
    } catch (error) {
      console.log('[Replay] open replay failed:', error);
      Alert.alert(i18n.t('txtError'), i18n.t('msgReplayOpenFailed'));
    }
  }, [
    countdownTime,
    currentPlayerIndex,
    gameBreakEnabled,
    isMatchPaused,
    isPaused,
    isStarted,
    playerSettings,
    poolBreakEnabled,
    poolBreakPlayerIndex,
    proModeEnabled,
    soundEnabled,
    totalTime,
    totalTurns,
    warmUpCount,
    warmUpCountdownTime,
    webcamFolderName,
    winner,
    ensureReplayRuntimeState,
    getActiveCameraBackend,
    getLockedGameplayCameraSource,
    getReplayKeyForSource,
    inspectRecordedVideoFile,
    prepareVarReplayAfterPause,
    setActiveReplaySource,
    youtubeLivePreviewActive,
  ]);

  const onStop = useCallback(async () => {
    // v14: Nếu chưa bắt đầu trận thì nút Kết thúc vẫn là thoát trận như cũ.
    // Khi trận đã bắt đầu, nút Kết thúc chỉ chốt người thắng và hiện thông báo/overlay.
    // Người dùng bấm nút Kết thúc trong thông báo/overlay thì mới thoát khỏi trận.
    if (!isStarted) {
      Alert.alert(i18n.t('stop'), i18n.t('msgStopGame'), [
        {
          text: i18n.t('txtCancel'),
          style: 'cancel',
        },
        {
          text: i18n.t('stop'),
          onPress: () => {
            void setReplayResumeSnapshot(null);
            void setLiveMatchSnapshot(null);
            setReplayReturnRequestSync(null);
            navigateBackAfterWinner();
          },
        },
      ]);
      return;
    }

    if (isEndingGameRef.current) {
      return;
    }

    isEndingGameRef.current = true;
    setIsEndingGame(true);

    const endClickAt = Date.now();
    console.log('[END] click', endClickAt);

    const latestSettingsAtClick = playerSettingsRef.current || playerSettings;
    const optimisticFinalSettings = commitCurrentRunStatsForPlayers(
      cloneReplayValue(latestSettingsAtClick),
      totalTurnsRef.current || totalTurns,
    );
    const optimisticScore = isSnookerGame(gameSettings?.category)
      ? getSnookerSetScoreSnapshot(
          optimisticFinalSettings || latestSettingsAtClick,
        )
      : getFinalScoreSnapshot(optimisticFinalSettings || latestSettingsAtClick);
    const optimisticWinnerPlayer =
      winnerRef.current ||
      deriveWinnerPlayerFromScore(
        optimisticFinalSettings || latestSettingsAtClick,
        optimisticScore,
      );

    // Optimistic UI: phản hồi ngay, khoá điều khiển/nút trước khi làm các tác vụ nặng.
    if (optimisticFinalSettings) {
      setPlayerSettings(optimisticFinalSettings);
    }
    if (optimisticWinnerPlayer?.name) {
      const optimisticWinnerForUi = cloneReplayValue(optimisticWinnerPlayer);
      winnerRef.current = optimisticWinnerForUi;
      setWinner(optimisticWinnerForUi);

      const shouldUseCaromWinnerSummaryNow =
        isCaromGame(gameSettings?.category) &&
        gameSettings?.mode?.mode === 'pro' &&
        (optimisticFinalSettings?.playingPlayers?.length || 0) === 2;

      if (!shouldUseCaromWinnerSummaryNow && !winnerAlertShownRef.current) {
        winnerAlertShownRef.current = true;
        endWinnerPromptDisplayedRef.current = true;
        recordDebugLog('HistoryFinalize', 'winner-alert-shown-immediate', {
          winner: optimisticWinnerForUi.name,
          optimisticScore,
          matchSessionId: matchSessionIdRef.current,
          webcamFolderName,
        });
        Alert.alert(
          i18n.t('txtWin'),
          i18n.t('msgWinner', {player: optimisticWinnerForUi.name}),
          [
            {
              text: i18n.t('stop'),
              onPress: () => {
                // Do not reset winnerAlertShownRef here. The finalizer below may
                // finish after navigation; keeping the flag prevents the same
                // winner modal from popping later on the History screen.
                navigateBackAfterWinner();
              },
            },
          ],
          {cancelable: false},
        );
      }
    }
    // Do not set isStarted=false here. That made the first Kết thúc tap reset
    // the UI to the pre-start state while recorder/history finalization was
    // still running. Keep the match visibly paused/ending until finalization
    // completes and the winner prompt has already been shown.
    setIsPaused(true);
    setIsMatchPaused(true);
    console.log('[END] local ending/finalizing', Date.now());

    const aplusLiveScoreConfig = (gameSettings as any)?.aplusLiveScore;
    if (aplusLiveScoreConfig?.enabled && aplusLiveScoreConfig?.matchId) {
      console.log('[END] api start', Date.now());
      void finishAplusLiveScoreMatch(
        aplusLiveScoreConfig,
        Number(optimisticScore?.[0] || 0),
        Number(optimisticScore?.[1] || 0),
        {timeoutMs: 3000, fast: true},
      )
        .then(() => {
          console.log('[END] api done', Date.now());
        })
        .catch(error => {
          console.log('[END] api failed/queued', {
            at: Date.now(),
            message: (error as Error)?.message || String(error),
          });
        });
    }

    try {
      void setReplayResumeSnapshot(null);
      void setLiveMatchSnapshot(null);
      setReplayReturnRequestSync(null);
      shouldStartRecordingRef.current = false;
      pendingStartRecordingRef.current = false;
      pendingYouTubeNativeStartRef.current = null;
      setYoutubeLivePreparing(false);

      const activeYouTubeBroadcastId = activeYouTubeBroadcastIdRef.current;
      activeYouTubeBroadcastIdRef.current = '';
      setYoutubeLivePreviewActive(false);
      setIsCameraReady(false);

      // Không chờ stop YouTube/FFmpeg/camera trên nút Kết thúc.
      // Các cleanup này chạy nền để UI và LiveScore ended phản hồi ngay.
      void (async () => {
        console.log('[END] cleanup start', Date.now());
        try {
          await withEndMatchTimeout(
            stopYouTubeNativeLive(),
            1500,
            'stopYouTubeNativeLive',
          );
          if (Platform.OS === 'windows') {
            await withEndMatchTimeout(
              stopWindowsFfmpegYouTubeLive('end-match'),
              2500,
              'stopWindowsFfmpegYouTubeLive',
            );
          }
          if (activeYouTubeBroadcastId) {
            await withEndMatchTimeout(
              stopYouTubeLiveSession(activeYouTubeBroadcastId),
              2500,
              'stopYouTubeLiveSession',
            );
            console.log(
              '[YouTube Live] stopped broadcast:',
              activeYouTubeBroadcastId,
            );
          }
        } catch (youtubeStopError) {
          console.log(
            '[YouTube Live] background stop failed:',
            youtubeStopError,
          );
        } finally {
          console.log('[END] cleanup done', Date.now());
        }
      })();

      logRecorderFlow('end-stop-final-segment', {
        backend: getActiveCameraBackend(),
      });
      const stoppedRecordingPath = await withEndMatchTimeout(
        stopVideoRecording(false),
        15000,
        'stopVideoRecording',
      );
      const recordedPath =
        stoppedRecordingPath ??
        lastRecordedVideoPathRef.current ??
        (await withEndMatchTimeout(
          getLatestReplaySegmentPath(),
          800,
          'getLatestReplaySegmentPath',
        ));

      let finalVideoExists = false;
      let finalVideoSize = 0;
      if (recordedPath) {
        try {
          finalVideoExists = await RNFS.exists(recordedPath);
          if (finalVideoExists) {
            const stat = await RNFS.stat(recordedPath);
            finalVideoSize = Number(stat?.size || 0);
          }
        } catch (statError) {
          recordDebugLog('HistoryFinalize', 'final-video-stat-failed', {
            error: String((statError as any)?.message || statError),
          });
        }
      }

      console.log('[Replay] recorded path before endGame:', recordedPath);
      console.log('[EndMatchAfterReplay]', {
        currentScoreAtEnd: getScoreSnapshotFromPlayerSettings(
          playerSettingsRef.current || playerSettings,
        ),
        finalCommittedScore: getScoreSnapshotFromPlayerSettings(
          playerSettingsRef.current || playerSettings,
        ),
        historyVideoPath: recordedPath,
        replayVideoPath: undefined,
        usedVideoPathForHistory: recordedPath,
        isUsingReplayPathForHistory: false,
        showedVideoNotAvailable: false,
        reasonIfVideoUnavailable: recordedPath
          ? undefined
          : 'no-history-or-recording-file-found-yet',
      });
      console.log('[VideoAvailabilityMessage]', {
        context: 'end-match-v14-winner-first',
        messageShown: false,
        checkedPath: recordedPath,
        checkedPathType: 'history',
        exists: finalVideoExists,
        size: finalVideoSize,
        shouldShowToUser: false,
      });

      let overlayLastSettings: PlayerSettings | undefined;
      let overlayLastSnapshotScore: number[] = [];
      try {
        if (webcamFolderName) {
          await flushReplayScoreboardTimeline(webcamFolderName);
          const replayTimeline =
            await loadReplayScoreboardTimeline(webcamFolderName);
          const overlayLastSnapshot = replayTimeline?.entries?.length
            ? replayTimeline.entries[replayTimeline.entries.length - 1]
            : undefined;
          overlayLastSettings = overlayLastSnapshot?.playerSettings as
            | PlayerSettings
            | undefined;
          overlayLastSnapshotScore = isSnookerGame(gameSettings?.category)
            ? getSnookerSetScoreSnapshot(overlayLastSettings)
            : getFinalScoreSnapshot(overlayLastSettings);
        }
      } catch (timelineError) {
        recordDebugLog('HistoryFinalize', 'replay-timeline-load-failed-v14', {
          error: String((timelineError as any)?.message || timelineError),
        });
      }

      const scoreBeforeFinalize = isSnookerGame(gameSettings?.category)
        ? getSnookerSetScoreSnapshot(playerSettings)
        : getFinalScoreSnapshot(playerSettings);
      const latestStatePlayerSettings =
        playerSettingsRef.current || playerSettings;
      const latestStateScore = isSnookerGame(gameSettings?.category)
        ? getSnookerSetScoreSnapshot(latestStatePlayerSettings)
        : getFinalScoreSnapshot(latestStatePlayerSettings);
      const useOverlayAsFinal =
        overlayLastSettings &&
        getScoreSnapshotTotal(overlayLastSnapshotScore) >=
          getScoreSnapshotTotal(latestStateScore);
      const finalPlayerSettings = commitCurrentRunStatsForPlayers(
        cloneReplayValue(
          useOverlayAsFinal ? overlayLastSettings : latestStatePlayerSettings,
        ),
        totalTurnsRef.current || totalTurns,
      );
      const finalCommittedScore = isSnookerGame(gameSettings?.category)
        ? getSnookerSetScoreSnapshot(finalPlayerSettings)
        : getFinalScoreSnapshot(finalPlayerSettings);
      const finalWinnerPlayer =
        winnerRef.current ||
        deriveWinnerPlayerFromScore(finalPlayerSettings, finalCommittedScore);
      const finalWinnerName = finalWinnerPlayer?.name;
      const finalTurn = totalTurnsRef.current;
      const finalDurationSeconds = Math.max(
        0,
        Number(totalTimeRef.current || totalTime || 0),
      );
      const exportOptions = {
        finalScore: finalCommittedScore,
        winnerName: finalWinnerName,
        finalPlayers: finalPlayerSettings?.playingPlayers,
        finalTurn,
        endedAt: Date.now(),
        durationMs: finalDurationSeconds * 1000,
      };

      const historySourceAtEnd = getLockedGameplayCameraSource();
      const replayFilesBeforeExport = webcamFolderName
        ? await waitForReplayFiles(webcamFolderName, 1, 10000, {
            source: historySourceAtEnd,
          })
        : [];
      recordDebugLog('HistoryFinalize', 'replay-file-count-before-export', {
        matchId: webcamFolderName,
        source: historySourceAtEnd,
        replayFileCount: replayFilesBeforeExport.length,
        replayFiles: replayFilesBeforeExport.map(file => ({
          path: file.path,
          size: Number(file.size || 0),
        })),
      });

      const historyReplayKeyAtEnd = getReplayKeyForSource(historySourceAtEnd);
      const historyRuntimeState = ensureReplayRuntimeState(historySourceAtEnd);
      const fallbackHistoryVideoPaths = Array.from(new Set([
        recordedPath,
        stoppedRecordingPath,
        lastRecordedVideoPathRef.current,
        historyRuntimeState.currentSegmentPath,
        historyRuntimeState.latestReplayPath,
        ...(historyRuntimeState.segmentRegistry || []),
        ...replayFilesBeforeExport.map(file => String(file?.path || '')).filter(Boolean),
      ].map(path => String(path || '').trim()).filter(Boolean)));

      recordDebugLog(historySourceAtEnd === 'usb' ? 'USBHistory' : 'HistoryFinalize', 'finish-request source=' + historySourceAtEnd + ' matchId=' + webcamFolderName, {
        source: historySourceAtEnd,
        matchId: webcamFolderName,
        replayKey: historyReplayKeyAtEnd,
        fallbackVideoPathCount: fallbackHistoryVideoPaths.length,
        fallbackVideoPaths: fallbackHistoryVideoPaths,
      });

      if (webcamFolderName) {
        if (Platform.OS === 'windows') {
          try {
            console.log(`[HistoryFinalize] mode=${currentGameplayModeLabel} export-start`, {matchId: webcamFolderName, platform: Platform.OS});
            recordDebugLog('HistoryFinalize', 'export-start', {
              mode: currentGameplayModeLabel,
              rawMode: currentGameplayModeCode,
              historyEnabled: videoPipelineEnabledForCurrentMode,
              matchId: webcamFolderName,
              platform: Platform.OS,
            });
            const historyFolder = await exportMatchToArchive(
              webcamFolderName,
              {
                ...exportOptions,
                source: historySourceAtEnd,
                fallbackVideoPaths: fallbackHistoryVideoPaths,
              },
            );
            const archiveFiles = historyFolder
              ? await listArchiveFiles(webcamFolderName, {source: historySourceAtEnd})
              : [];
            if (isUsbWebcamGameplaySourceActive() && archiveFiles.length > 0) {
              const lastArchiveFile = archiveFiles[archiveFiles.length - 1];
              recordDebugLog('USBHistory', 'saved path=' + String(lastArchiveFile?.path || historyFolder || '') + ' size=' + String(Number((lastArchiveFile as any)?.size || 0)), {
                source: 'usb',
                path: lastArchiveFile?.path || historyFolder,
                fileSize: Number((lastArchiveFile as any)?.size || 0),
                matchId: webcamFolderName,
              });
            }
            if (historyFolder && archiveFiles.length > 0) {
              await deleteReplayFolder(webcamFolderName, {
                includeArchive: false,
              });
              recordDebugLog(
                'HistoryFinalize',
                'delete-replay-buffer-after-success',
                {
                  matchId: webcamFolderName,
                  archiveFileCount: archiveFiles.length,
                  exportSuccess: true,
                  deleteReplayBufferAfterSuccess: true,
                },
              );
            } else {
              recordDebugLog(
                'HistoryFinalize',
                'keep-replay-buffer-after-export-failed',
                {
                  matchId: webcamFolderName,
                  historyFolder,
                  archiveFileCount: archiveFiles.length,
                  exportSuccess: false,
                  deleteReplayBufferAfterSuccess: false,
                },
              );
            }
            if (historyFolder && archiveFiles.length > 0) {
              console.log(`[HistoryFinalize] mode=${currentGameplayModeLabel} export-success`, {
                matchId: webcamFolderName,
                historyFolder,
                archiveFileCount: archiveFiles.length,
              });
              recordDebugLog('HistoryFinalize', 'export-success', {
                mode: currentGameplayModeLabel,
                rawMode: currentGameplayModeCode,
                matchId: webcamFolderName,
                historyFolder,
                archiveFileCount: archiveFiles.length,
              });
            }
            console.log('[History] savedVideoPath =', historyFolder);
            recordDebugLog('HistoryFinalize', 'history-record-summary', {
              matchId: webcamFolderName,
              scoreBeforeFinalize,
              overlayLastSnapshotScore,
              finalCommittedScore,
              savedHistoryScore: finalCommittedScore,
              winner: finalWinnerName,
              historyRecordPath: historyFolder,
              finalVideoPath: recordedPath,
              finalVideoExists,
              finalVideoSize,
              marker: 'v14-end-button-winner-alert-before-exit',
            });
          } catch (exportError) {
            console.log('[HistoryVideo] error', exportError);
          }
        } else if (Platform.OS === 'android') {
          try {
            console.log(`[HistoryFinalize] mode=${currentGameplayModeLabel} export-start`, {matchId: webcamFolderName, platform: Platform.OS});
            recordDebugLog('HistoryFinalize', 'export-start', {
              mode: currentGameplayModeLabel,
              rawMode: currentGameplayModeCode,
              historyEnabled: videoPipelineEnabledForCurrentMode,
              matchId: webcamFolderName,
              platform: Platform.OS,
            });
            const historyFolder = await exportMatchToArchive(
              webcamFolderName,
              {
                ...exportOptions,
                source: historySourceAtEnd,
                fallbackVideoPaths: fallbackHistoryVideoPaths,
              },
            );
            const archiveFiles = historyFolder
              ? await listArchiveFiles(webcamFolderName, {source: historySourceAtEnd})
              : [];
            if (isUsbWebcamGameplaySourceActive() && archiveFiles.length > 0) {
              const lastArchiveFile = archiveFiles[archiveFiles.length - 1];
              recordDebugLog('USBHistory', 'saved path=' + String(lastArchiveFile?.path || historyFolder || '') + ' size=' + String(Number((lastArchiveFile as any)?.size || 0)), {
                source: 'usb',
                path: lastArchiveFile?.path || historyFolder,
                fileSize: Number((lastArchiveFile as any)?.size || 0),
                matchId: webcamFolderName,
              });
            }
            if (historyFolder && archiveFiles.length > 0) {
              await deleteReplayFolder(webcamFolderName, {
                includeArchive: false,
              });
              recordDebugLog(
                'HistoryFinalize',
                'delete-replay-buffer-after-success',
                {
                  matchId: webcamFolderName,
                  archiveFileCount: archiveFiles.length,
                  exportSuccess: true,
                  deleteReplayBufferAfterSuccess: true,
                },
              );
            } else {
              recordDebugLog(
                'HistoryFinalize',
                'keep-replay-buffer-after-export-failed',
                {
                  matchId: webcamFolderName,
                  historyFolder,
                  archiveFileCount: archiveFiles.length,
                  exportSuccess: false,
                  deleteReplayBufferAfterSuccess: false,
                },
              );
            }
            if (historyFolder && archiveFiles.length > 0) {
              console.log(`[HistoryFinalize] mode=${currentGameplayModeLabel} export-success`, {
                matchId: webcamFolderName,
                historyFolder,
                archiveFileCount: archiveFiles.length,
              });
              recordDebugLog('HistoryFinalize', 'export-success', {
                mode: currentGameplayModeLabel,
                rawMode: currentGameplayModeCode,
                matchId: webcamFolderName,
                historyFolder,
                archiveFileCount: archiveFiles.length,
              });
            }
            recordDebugLog('HistoryFinalize', 'history-record-summary', {
              matchId: webcamFolderName,
              scoreBeforeFinalize,
              overlayLastSnapshotScore,
              finalCommittedScore,
              savedHistoryScore: finalCommittedScore,
              winner: finalWinnerName,
              historyRecordPath: historyFolder,
              finalVideoPath: recordedPath,
              finalVideoExists,
              finalVideoSize,
              marker: 'v14-end-button-winner-alert-before-exit',
            });
          } catch (exportError) {
            console.log('[Replay] export full match failed:', exportError);
          }
        }
      }

      if (gameSettings) {
        dispatch(
          gameActions.endGame({
            realm,
            gameSettings: {
              ...gameSettings,
              players: finalPlayerSettings || playerSettings,
              totalTime: finalDurationSeconds || totalTime,
              webcamFolderName,
              replayPath: recordedPath,
              saveToDeviceWhileStreaming,
            },
          }),
        );
      }

      clearActiveGameplaySessionSync();
      setReplayResumeSnapshotSync(null);
      setLiveMatchSnapshotSync(null);

      if (finalPlayerSettings) {
        setPlayerSettings(finalPlayerSettings);
      }

      if (finalWinnerPlayer?.name) {
        const finalWinnerForUi = cloneReplayValue(finalWinnerPlayer);
        winnerRef.current = finalWinnerForUi;
        setWinner(finalWinnerForUi);
        setIsStarted(false);
        setIsPaused(false);
        setIsMatchPaused(true);

        const shouldUseCaromWinnerSummary =
          isCaromGame(gameSettings?.category) &&
          gameSettings?.mode?.mode === 'pro' &&
          (finalPlayerSettings?.playingPlayers?.length || 0) === 2;

        console.log(
          '[EndMatchWinner] v14-end-button-winner-alert-before-exit',
          {
            winner: finalWinnerName,
            finalCommittedScore,
            showCaromSummary: shouldUseCaromWinnerSummary,
          },
        );

        isEndingGameRef.current = false;
        setIsEndingGame(false);

        if (shouldUseCaromWinnerSummary) {
          return;
        }

        if (
          endWinnerPromptDisplayedRef.current ||
          winnerAlertShownRef.current
        ) {
          recordDebugLog(
            'HistoryFinalize',
            'winner-alert-final-skip-duplicate',
            {
              winner: finalWinnerForUi.name,
              finalCommittedScore,
              alreadyDisplayed: endWinnerPromptDisplayedRef.current,
            },
          );
          return;
        }

        winnerAlertShownRef.current = true;
        endWinnerPromptDisplayedRef.current = true;
        Alert.alert(
          i18n.t('txtWin'),
          i18n.t('msgWinner', {player: finalWinnerForUi.name}),
          [
            {
              text: i18n.t('stop'),
              onPress: () => {
                navigateBackAfterWinner();
              },
            },
          ],
          {cancelable: false},
        );
        return;
      }

      // Nếu hòa hoặc thiếu tên người chơi, vẫn không thoát âm thầm ngay.
      // Người dùng phải xác nhận Kết thúc trong thông báo này.
      isEndingGameRef.current = false;
      setIsEndingGame(false);
      Alert.alert(
        i18n.t('stop'),
        i18n.t('msgStopGame'),
        [
          {
            text: i18n.t('stop'),
            onPress: () => {
              navigateBackAfterWinner();
            },
          },
        ],
        {cancelable: false},
      );
    } catch (error) {
      isEndingGameRef.current = false;
      setIsEndingGame(false);
      console.error(JSON.stringify(error));
    }
  }, [
    currentGameplayModeCode,
    currentGameplayModeLabel,
    dispatch,
    realm,
    totalTime,
    totalTurns,
    gameSettings,
    playerSettings,
    saveToDeviceWhileStreaming,
    videoPipelineEnabledForCurrentMode,
    webcamFolderName,
    isStarted,
    navigateBackAfterWinner,
  ]);

  const onReset = useCallback(() => {
    pendingNewGameAfterViolateRef.current = false;
    void setReplayResumeSnapshot(null);
    void setLiveMatchSnapshot(null);
    setReplayReturnRequestSync(null);
    const shouldResetRackScore = false;

    const safePlayingPlayers = Array.isArray(playerSettings?.playingPlayers)
      ? playerSettings.playingPlayers
      : [];

    const newPlayerSettings = {
      ...playerSettings,
      playingPlayers: safePlayingPlayers.map(player => ({
        ...player,
        totalPoint: shouldResetRackScore ? 0 : player.totalPoint,
        violate: 0,
        scoredBalls: [],
        proMode: {
          ...player.proMode,
          highestRate: 0,
          secondHighestRate: 0,
          average: 0,
          currentPoint: 0,
          extraTimeTurns: gameSettings?.mode?.extraTimeTurns,
        },
      })),
    } as PlayerSettings;

    setPlayerSettings(newPlayerSettings);
    setWinner(undefined);

    if (isPoolGame(gameSettings?.category)) {
      if (isQuickMatchGameMode(gameSettings) || isFastGameMode(gameSettings)) {
        setCountdownTime(0);
        setPoolBreakEnabled(false);
      } else if (gameSettings?.mode?.countdownTime) {
        const extraTimeBonus = gameSettings.mode?.extraTimeBonus || 0;
        setCountdownTime(gameSettings.mode?.countdownTime! + extraTimeBonus);
        setPoolBreakEnabled(!isPool15FreeGame(gameSettings?.category));
      }
    }

    if (isPool15OnlyGame(gameSettings?.category)) {
      setPool8SetWinnerIndex(null);
      setPool8Trackers(prev => resetPool8Trackers(getSafePool8Trackers(prev)));
      setIsMatchPaused(false);
      setPoolBreakEnabled(false);
      return;
    }

    if (isPool15FreeGame(gameSettings?.category)) {
      setPool8FreeSetWinnerIndex(null);
      setIsMatchPaused(false);
      return;
    }

    onSwitchPoolBreakPlayerIndex(poolBreakPlayerIndex, playerIndex => {
      setCurrentPlayerIndex(playerIndex);
    });
  }, [
    poolBreakPlayerIndex,
    gameSettings,
    playerSettings,
    onSwitchPoolBreakPlayerIndex,
  ]);

  const getLatestReplaySegmentPath = async () => {
    try {
      const activeSource = getLockedGameplayCameraSource();
      const replayKey = getReplayKeyForSource(activeSource);
      const replayFiles = await listReplayFiles(webcamFolderName, {
        mode: 'var',
        source: activeSource,
      });
      const sourcePrefix = activeSource === 'rtsp' || activeSource === 'usb' || activeSource === 'builtInCamera'
        ? `${activeSource}_`
        : '';
      const knownSourcePrefixPattern = /^(rtsp|usb|builtInCamera)_/;
      const sourceMatchedFiles = sourcePrefix
        ? replayFiles.filter(file => String(file?.name || file?.path?.split('/')?.pop?.() || '').startsWith(sourcePrefix))
        : [];
      const neutralFiles = replayFiles.filter(file => {
        const name = String(file?.name || file?.path?.split('/')?.pop?.() || '');
        return !knownSourcePrefixPattern.test(name);
      });
      const activeReplayFiles = sourceMatchedFiles.length > 0
        ? sourceMatchedFiles
        : activeSource === 'rtsp'
          ? neutralFiles
          : [];
      const latestReplayPath = activeReplayFiles[activeReplayFiles.length - 1]?.path;

      if (latestReplayPath) {
        recordDebugLog('ReplayReadyCheck', 'latest-replay-segment-selected', {
          outputPath: latestReplayPath,
          source: activeSource,
          replayKey,
          webcamFolderName,
        });
        return latestReplayPath;
      }

      const historyFiles = await listPlayableFiles(webcamFolderName, true, {
        source: activeSource,
      });
      const latestHistoryPath = historyFiles[historyFiles.length - 1]?.path;

      if (latestHistoryPath) {
        recordDebugLog('ReplayReadyCheck', 'latest-history-segment-selected', {
          outputPath: latestHistoryPath,
          source: activeSource,
          replayKey,
          fallback: 'HistoryArchiveFallback',
          webcamFolderName,
        });
        return latestHistoryPath;
      }

      return undefined;
    } catch (error) {
      console.log(
        '[Replay] Failed to get latest replay/history segment:',
        error,
      );
      return undefined;
    }
  };

  const registerCompletedReplaySegment = async (
    finalPath?: string,
    meta: {durationSeconds?: number; segmentStartedAt?: number} = {},
  ) => {
    if (!finalPath) {
      return undefined;
    }

    const segmentSource = getLockedGameplayCameraSource();
    const replayKey = getReplayKeyForSource(segmentSource);
    const replayLogTag = segmentSource === 'usb' ? 'USBReplay' : segmentSource === 'rtsp' ? 'RTSPReplay' : 'ReplayVAR';
    const runtimeState = ensureReplayRuntimeState(segmentSource);

    const registeringSegmentIndex = currentReplaySegmentIndexRef.current;
    const wallDurationSeconds = Math.max(
      0,
      (Date.now() -
        Math.max(0, currentReplaySegmentWallStartMsRef.current || Date.now())) /
        1000,
    );
    const matchClockDurationSeconds = Math.max(
      0,
      totalTimeRef.current - currentReplaySegmentStartTotalTimeRef.current,
    );
    const resolvedDurationSeconds = Math.max(
      Number(meta.durationSeconds || 0),
      wallDurationSeconds,
      matchClockDurationSeconds,
    );
    const resolvedSegmentStartedAt =
      Number(meta.segmentStartedAt || 0) ||
      currentReplaySegmentWallStartMsRef.current ||
      Date.now() - resolvedDurationSeconds * 1000;

    logRecorderFlow('register-segment-start', {
      path: finalPath,
      segmentIndex: registeringSegmentIndex,
      wallDurationSeconds,
      matchClockDurationSeconds,
      resolvedDurationSeconds,
      segmentStartedAt: resolvedSegmentStartedAt,
      source: segmentSource,
      replayKey,
    });

    recordDebugLog('SegmentLifecycle', 'registerFromGameplayHelper', {
      segmentIndex: registeringSegmentIndex,
      path: finalPath,
      wallDurationSeconds,
      matchClockDurationSeconds,
      resolvedDurationSeconds,
      segmentStartedAt: resolvedSegmentStartedAt,
      source: segmentSource,
      replayKey,
    });

    recordDebugLog(replayLogTag, 'buffer-start', {
      source: segmentSource,
      replayKey,
      rawPath: finalPath,
      webcamFolderName,
      segmentIndex: registeringSegmentIndex,
    });

    const registeredPath = await registerReplaySegment(
      webcamFolderName,
      finalPath,
      {
        keepFullMatch: true,
        matchSessionId: matchSessionIdRef.current,
        segmentIndex: registeringSegmentIndex,
        mode: gameSettings?.category,
        playerNames: playerSettings?.playingPlayers
          ?.map(player => String(player?.name || ''))
          .filter(Boolean) as string[],
        segmentStartedAt: resolvedSegmentStartedAt,
        durationSeconds: resolvedDurationSeconds,
        source: segmentSource,
      },
    );

    if (!registeredPath) {
      logRecorderFlow('register-segment-failed', {
        path: finalPath,
        segmentIndex: registeringSegmentIndex,
        reason: 'registerReplaySegment returned undefined',
      });
      console.log('[Replay] invalid segment skipped:', finalPath);
      return undefined;
    }

    logRecorderFlow('register-segment-success', {
      path: registeredPath,
      segmentIndex: registeringSegmentIndex,
      source: segmentSource,
      replayKey,
    });

    const registeredInfo = await inspectRecordedVideoFile(registeredPath, segmentSource);
    runtimeState.segmentRegistry = Array.from(new Set([
      ...(runtimeState.segmentRegistry || []),
      registeredPath,
    ]));
    runtimeState.currentSegmentPath = registeredPath;
    runtimeState.latestReplayPath = registeredPath;
    runtimeState.replayReady = registeredInfo.usable;
    runtimeState.lastError = registeredInfo.usable ? undefined : 'registered-file-not-usable';
    replayStateByKeyRef.current[replayKey] = runtimeState;
    recordDebugLog(replayLogTag, 'segment-registered path=' + registeredPath + ' size=' + String(registeredInfo.size), {
      source: segmentSource,
      replayKey,
      path: registeredPath,
      fileExists: registeredInfo.exists,
      fileSize: registeredInfo.size,
      usable: registeredInfo.usable,
      webcamFolderName,
      segmentIndex: registeringSegmentIndex,
    });
    recordDebugLog('ReplayRegistry', 'key=' + replayKey + ' segmentCount=' + String(runtimeState.segmentRegistry.length), {
      key: replayKey,
      source: segmentSource,
      segmentCount: runtimeState.segmentRegistry.length,
      latestPath: registeredPath,
    });

    replayCompletedSegmentsRef.current = Math.max(
      replayCompletedSegmentsRef.current,
      registeringSegmentIndex + 1,
    );

    const completedSegments = replayCompletedSegmentsRef.current;
    if (
      completedSegments - lastPruneCompletedSegmentsRef.current >=
      REPLAY_PRUNE_EVERY_N_SEGMENTS
    ) {
      lastPruneCompletedSegmentsRef.current = completedSegments;
      setTimeout(() => {
        void pruneReplayStorage(
          maxReplayStorageBytesRef.current || MAX_REPLAY_STORAGE_BYTES,
          [webcamFolderName],
        ).catch(error => {
          console.log('[Replay] deferred prune failed:', error);
        });
      }, 1500);
    }

    return registeredPath;
  };

  const scheduleRecordingRotation = () => {
    if (recordingRotateTimeoutRef.current) {
      clearTimeout(recordingRotateTimeoutRef.current);
    }

    const activeSource = getLockedGameplayCameraSource();
    const activeBackend = getActiveCameraBackend();
    const rotationMs = activeSource === 'usb' || activeBackend === 'uvc'
      ? USB_INSTANT_REPLAY_SEGMENT_MS
      : Math.max(
          30 * 1000,
          recordingSegmentDurationMsRef.current || RECORDING_SEGMENT_DURATION_MS,
        );

    recordDebugLog(activeSource === 'usb' ? 'USBReplay' : activeSource === 'rtsp' ? 'RTSPReplay' : 'ReplayVAR', 'rotation-scheduled', {
      source: activeSource,
      backend: activeBackend,
      rotationMs,
      reason: activeSource === 'usb' || activeBackend === 'uvc'
        ? 'usb-instant-replay-short-rolling-segment'
        : 'configured-segment-duration',
    });

    recordingRotateTimeoutRef.current = setTimeout(
      async () => {
        if (!isRecordingRef.current || isStoppingRecordingRef.current) {
          return;
        }

        try {
          const rotateSource = getLockedGameplayCameraSource();
          recordDebugLog(rotateSource === 'usb' ? 'USBReplay' : rotateSource === 'rtsp' ? 'RTSPReplay' : 'ReplayVAR', 'rotation-stop-current-segment', {
            source: rotateSource,
            backend: getActiveCameraBackend(),
            rotationMs,
          });
          pendingStartRecordingRef.current = true;
          await stopVideoRecording(true);
        } catch (rotationError) {
          console.log('[Recording] rotate skipped/error:', rotationError);
        }
      },
      rotationMs,
    );
  };

  const resetRecordingStartState = () => {
    isStartingRecordingRef.current = false;
    isRecordingRef.current = false;
    setIsRecording(false);
    isStoppingRecordingRef.current = false;
    recordingFinishedResolverRef.current?.(undefined);
    recordingFinishedResolverRef.current = null;
    recordingFinishedPromiseRef.current = null;
  };

  const startVideoRecording = async () => {
    if (isRecordingRef.current) {
      recordDebugLog('RecorderFlow', 'start-skipped-already-recording');
      return true;
    }

    if (isStartingRecordingRef.current) {
      recordDebugLog('RecorderFlow', 'start-skipped-already-starting');
      return false;
    }

    if (isStoppingRecordingRef.current) {
      recordDebugLog('RecorderFlow', 'start-skipped-stopping-in-progress');
      return false;
    }

    const activeCameraBackend = getActiveCameraBackend();
    const useRtspRecorder = shouldUseRtspRecorderNow();
    const resolvedBackend = useRtspRecorder
      ? 'rtsp'
      : activeCameraBackend || 'unknown';

    logRecorderFlow('start-request', {
      backend: resolvedBackend,
      cameraReady: isCameraReady,
      cameraRefExists: Boolean(cameraRef.current),
      nativeRecorderReady: Boolean(cameraRef.current || useRtspRecorder),
      activeCameraBackend,
      rtspRecordingEnabled: rtspRecordingEnabledRef.current,
      rtspCandidateCount: rtspRecordingUrlsRef.current.length,
      activeRtspUrl: String(
        (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ || '',
      ).trim()
        ? 'present'
        : 'empty',
    });

    isStartingRecordingRef.current = true;

    try {
      restartAfterStopRef.current = false;
      isStoppingRecordingRef.current = false;
      lastRecordedVideoPathRef.current = undefined;

      if (recordingRotateTimeoutRef.current) {
        clearTimeout(recordingRotateTimeoutRef.current);
        recordingRotateTimeoutRef.current = null;
      }

      currentReplaySegmentIndexRef.current = replayCompletedSegmentsRef.current;
      currentReplaySegmentStartTotalTimeRef.current = totalTimeRef.current;
      currentReplaySegmentWallStartMsRef.current = Date.now();
      replayTimelineSignatureRef.current = '';
      lastReplayTimelineWriteSignatureRef.current = '';

      recordingFinishedPromiseRef.current = new Promise(resolve => {
        recordingFinishedResolverRef.current = resolve;
      });

      if (useRtspRecorder) {
        const activePreviewUrl = String(
          (globalThis as any).__APLUS_ACTIVE_RTSP_URL__ || '',
        ).trim();
        const activePreviewCandidates = Array.isArray(
          (globalThis as any).__APLUS_RTSP_CANDIDATES__,
        )
          ? ((globalThis as any).__APLUS_RTSP_CANDIDATES__ as string[])
          : [];
        const rtspUrls = Array.from(
          new Set(
            [
              activePreviewUrl,
              ...activePreviewCandidates,
              ...rtspRecordingUrlsRef.current,
            ].filter(Boolean),
          ),
        );

        logRecorderFlow('backend=rtsp', {
          segmentIndex: currentReplaySegmentIndexRef.current,
          candidateCount: rtspUrls.length,
        });

        const started = await startRtspSegmentRecording({
          rtspUrls,
          webcamFolderName,
          segmentIndex: currentReplaySegmentIndexRef.current,
        });

        if (!started) {
          logRecorderFlow('start-failed', {
            backend: 'rtsp',
            reason: 'startRtspSegmentRecording returned false',
          });
          resetRecordingStartState();
          shouldStartRecordingRef.current = true;
          pendingStartRecordingRef.current = true;
          return false;
        }

        isRecordingRef.current = true;
        setIsRecording(true);
        isStartingRecordingRef.current = false;
        scheduleRecordingRotation();
        logRecorderFlow('start-success', {
          backend: 'rtsp',
          segmentIndex: currentReplaySegmentIndexRef.current,
          candidateCount: rtspUrls.length,
        });
        return true;
      }

      if (!cameraRef.current) {
        logRecorderFlow('start-failed', {
          backend: resolvedBackend,
          reason: 'cameraRef null',
          cameraReady: isCameraReady,
        });
        resetRecordingStartState();
        shouldStartRecordingRef.current = true;
        pendingStartRecordingRef.current = true;
        return false;
      }

      const cameraRecordingInfo = (
        cameraRef.current as any
      )?.getRecordingInfo?.();
      const cameraBackend = String(
        cameraRecordingInfo?.source === 'external'
          ? 'uvc'
          : cameraRecordingInfo?.backend || activeCameraBackend || 'vision',
      );

      logRecorderFlow('backend=' + cameraBackend, {
        cameraRecordingInfo,
        cameraReady: isCameraReady,
        cameraRefExists: true,
      });

      if (cameraBackend === 'uvc') {
        recordDebugLog('USBReplay', 'buffer-start', {
          source: 'usb',
          webcamFolderName,
          segmentIndex: currentReplaySegmentIndexRef.current,
          cameraReady: isCameraReady,
        });
        recordDebugLog('USBWebcamRecorder', 'start-request', {
          source: 'usb',
          webcamFolderName,
          segmentIndex: currentReplaySegmentIndexRef.current,
        });
      }

      const startResult = await Promise.resolve(
        (cameraRef.current as any).startRecording({
          webcamFolderName,
          segmentIndex: currentReplaySegmentIndexRef.current,
          fileType: 'mp4',
          videoCodec: 'h264',
          onRecordingFinished: async video => {
            const rawPath = video?.path;
            const fileInfo = await inspectRecordedVideoFile(rawPath, cameraBackend === 'uvc' ? 'usb' : cameraBackend);

            logRecorderFlow('native-file-path', {
              backend: String(
                (cameraRef.current as any)?.getRecordingInfo?.()?.backend ||
                  cameraBackend,
              ),
              path: rawPath,
              fileExists: fileInfo.exists,
              fileSize: fileInfo.size,
              minValidBytes: getMinValidRecordingBytesForSource(cameraBackend === 'uvc' ? 'usb' : cameraBackend),
              normalMinValidBytes: MIN_VALID_RECORDING_BYTES,
              usbShortReplayMinBytes: MIN_USB_SHORT_REPLAY_BYTES,
              durationSeconds: Number((video as any)?.durationSeconds || 0),
            });
            recordDebugLog('RecorderFlow', 'recording-finished-callback', {
              path: rawPath,
            });

            if (recordingRotateTimeoutRef.current) {
              clearTimeout(recordingRotateTimeoutRef.current);
              recordingRotateTimeoutRef.current = null;
            }

            let finalPath: string | undefined;

            try {
              if (!rawPath || !fileInfo.usable) {
                logRecorderFlow('stop-failed', {
                  backend: cameraBackend,
                  path: rawPath,
                  fileExists: fileInfo.exists,
                  fileSize: fileInfo.size,
                  reason: !rawPath
                    ? 'native returned no path'
                    : 'file missing or too small',
                });
              } else {
                const registeringSegmentIndex =
                  currentReplaySegmentIndexRef.current;
                const nativeDurationSeconds = Number(
                  (video as any)?.durationSeconds || 0,
                );
                const wallDurationSeconds = Math.max(
                  0,
                  (Date.now() -
                    Math.max(
                      0,
                      currentReplaySegmentWallStartMsRef.current || Date.now(),
                    )) /
                    1000,
                );
                const matchClockDurationSeconds = Math.max(
                  0,
                  totalTimeRef.current -
                    currentReplaySegmentStartTotalTimeRef.current,
                );
                const resolvedDurationSeconds = Math.max(
                  nativeDurationSeconds,
                  wallDurationSeconds,
                  matchClockDurationSeconds,
                );
                const resolvedSegmentStartedAt =
                  Number((video as any)?.nativeStartResolvedAtMs || 0) ||
                  currentReplaySegmentWallStartMsRef.current ||
                  Date.now() - resolvedDurationSeconds * 1000;

                recordDebugLog('SegmentLifecycle', 'registerFromGameplay', {
                  segmentIndex: registeringSegmentIndex,
                  path: rawPath,
                  nativeDurationSeconds,
                  wallDurationSeconds,
                  matchClockDurationSeconds,
                  resolvedDurationSeconds,
                  segmentStartedAt: resolvedSegmentStartedAt,
                });

                finalPath = await registerCompletedReplaySegment(rawPath, {
                  durationSeconds: resolvedDurationSeconds,
                  segmentStartedAt: resolvedSegmentStartedAt,
                });
              }
            } catch (segmentError) {
              recordDebugLog('RecorderFlow', 'register-segment-exception', {
                error: String((segmentError as any)?.message || segmentError),
              });
              finalPath = undefined;
            } finally {
              lastRecordedVideoPathRef.current = finalPath;
              recordingFinishedResolverRef.current?.(finalPath);
              recordingFinishedResolverRef.current = null;
              recordingFinishedPromiseRef.current = null;

              if (restartAfterStopRef.current) {
                restartAfterStopRef.current = false;
                pendingStartRecordingRef.current = true;
              }

              isRecordingRef.current = false;
              setIsRecording(false);
              isStoppingRecordingRef.current = false;
              recordDebugLog('RecorderFlow', 'replay-recorder', {
                event: 'segment-registration-finished',
                path: finalPath,
                nextSegmentIndex: replayCompletedSegmentsRef.current,
                restartPending: pendingStartRecordingRef.current,
              });
            }
          },
          onRecordingError: error => {
            logRecorderFlow('start-failed', {
              backend: String(
                (cameraRef.current as any)?.getRecordingInfo?.()?.backend ||
                  cameraBackend,
              ),
              error,
            });
            recordDebugLog('RecorderFlow', 'recording-callback-error', {
              error: String((error as any)?.message || error),
            });
            isRecordingRef.current = false;
            setIsRecording(false);
            isStoppingRecordingRef.current = false;
            isStartingRecordingRef.current = false;

            if (recordingRotateTimeoutRef.current) {
              clearTimeout(recordingRotateTimeoutRef.current);
              recordingRotateTimeoutRef.current = null;
            }

            recordingFinishedResolverRef.current?.(undefined);
            recordingFinishedResolverRef.current = null;
            recordingFinishedPromiseRef.current = null;

            if (cameraBackend === 'uvc') {
              shouldStartRecordingRef.current = false;
              pendingStartRecordingRef.current = false;
              recordDebugLog('USBWebcamRecorder', 'retry-disabled-after-native-failure', {
                source: 'usb',
                reason: String((error as any)?.message || error),
              });
            } else if (isStarted && !isPaused) {
              shouldStartRecordingRef.current = true;
              pendingStartRecordingRef.current = true;
            }
          },
        }),
      );

      if (startResult === false) {
        logRecorderFlow('start-failed', {
          backend: cameraBackend,
          reason: 'camera controller returned false',
        });
        resetRecordingStartState();
        if (cameraBackend === 'uvc') {
          shouldStartRecordingRef.current = false;
          pendingStartRecordingRef.current = false;
          recordDebugLog('USBWebcamRecorder', 'retry-disabled-after-controller-false', {
            source: 'usb',
            backend: cameraBackend,
          });
        } else {
          shouldStartRecordingRef.current = true;
          pendingStartRecordingRef.current = true;
        }
        return false;
      }

      isRecordingRef.current = true;
      setIsRecording(true);
      isStartingRecordingRef.current = false;
      scheduleRecordingRotation();
      logRecorderFlow('start-success', {
        backend: cameraBackend,
        segmentIndex: currentReplaySegmentIndexRef.current,
      });
      return true;
    } catch (error) {
      recordDebugLog('RecorderFlow', 'recording-start-skipped-error', {
        error: String((error as any)?.message || error),
      });
      logRecorderFlow('start-failed', {
        backend: resolvedBackend,
        reason: String((error as any)?.message || error),
      });
      resetRecordingStartState();
      shouldStartRecordingRef.current = true;
      pendingStartRecordingRef.current = true;
      return false;
    } finally {
      isStartingRecordingRef.current = false;
    }
  };

  const stopVideoRecording = async (restartAfterStop = false) => {
    if (recordingRotateTimeoutRef.current) {
      clearTimeout(recordingRotateTimeoutRef.current);
      recordingRotateTimeoutRef.current = null;
    }

    restartAfterStopRef.current = restartAfterStop;

    if (isStartingRecordingRef.current && recordingFinishedPromiseRef.current) {
      logRecorderFlow('stop-waiting-for-start', {
        backend: getActiveCameraBackend() || 'unknown',
      });
    }

    if (isStoppingRecordingRef.current) {
      recordDebugLog('RecorderFlow', 'stop-skipped-already-stopping');
      return await Promise.race([
        recordingFinishedPromiseRef.current || Promise.resolve(undefined),
        new Promise<string | undefined>(resolve =>
          setTimeout(() => resolve(undefined), 15000),
        ),
      ]);
    }

    if (
      Platform.OS === 'android' &&
      (isRtspSegmentRecording() || shouldUseRtspRecorderNow())
    ) {
      if (!isRecordingRef.current) {
        await cancelRtspSegmentRecording('stop-request-while-not-recording');
        isStartingRecordingRef.current = false;
        isStoppingRecordingRef.current = false;
        shouldStartRecordingRef.current = false;
        pendingStartRecordingRef.current = false;
        logRecorderFlow('stop-failed', {
          backend: 'rtsp',
          reason: 'not-recording',
        });
        recordDebugLog('RecorderFlow', 'rtsp-stop-skipped-not-recording');
        recordingFinishedResolverRef.current?.(undefined);
        recordingFinishedResolverRef.current = null;
        recordingFinishedPromiseRef.current = null;
        return undefined;
      }

      isStoppingRecordingRef.current = true;
      logRecorderFlow('stop-start', {
        backend: 'rtsp',
        info: getRtspSegmentRecordingInfo(),
      });

      try {
        const rawSegmentPath = await stopRtspSegmentRecording();
        const rawFileInfo = await inspectRecordedVideoFile(rawSegmentPath, 'rtsp');
        logRecorderFlow('stop-result', {
          backend: 'rtsp',
          path: rawSegmentPath,
          fileExists: rawFileInfo.exists,
          fileSize: rawFileInfo.size,
        });
        const registeredPath = rawFileInfo.usable
          ? await registerCompletedReplaySegment(rawSegmentPath)
          : undefined;

        lastRecordedVideoPathRef.current = registeredPath;
        recordingFinishedResolverRef.current?.(registeredPath);
        recordingFinishedResolverRef.current = null;
        recordingFinishedPromiseRef.current = null;

        if (restartAfterStopRef.current) {
          restartAfterStopRef.current = false;
          pendingStartRecordingRef.current = true;
        }

        isRecordingRef.current = false;
        setIsRecording(false);
        isStoppingRecordingRef.current = false;

        logRecorderFlow(registeredPath ? 'replay-ready' : 'stop-failed', {
          backend: 'rtsp',
          rawSegmentPath,
          registeredPath,
          reason: registeredPath
            ? undefined
            : 'rtsp stop produced no registered segment',
        });

        return registeredPath;
      } catch (error) {
        logRecorderFlow('stop-failed', {
          backend: 'rtsp',
          error,
        });
        recordDebugLog('RecorderFlow', 'rtsp-stop-skipped-error', {
          error: String((error as any)?.message || error),
        });
        isRecordingRef.current = false;
        setIsRecording(false);
        isStoppingRecordingRef.current = false;
        restartAfterStopRef.current = false;
        recordingFinishedResolverRef.current?.(undefined);
        recordingFinishedResolverRef.current = null;
        recordingFinishedPromiseRef.current = null;
        return undefined;
      }
    }

    if (!cameraRef.current || !isRecordingRef.current) {
      logRecorderFlow('stop-failed', {
        backend: getActiveCameraBackend() || 'unknown',
        reason: !cameraRef.current ? 'cameraRef-null' : 'not-recording',
      });
      recordDebugLog('RecorderFlow', 'stop-skipped-not-recording');
      return undefined;
    }

    isStoppingRecordingRef.current = true;
    logRecorderFlow('stop-start', {
      backend: getActiveCameraBackend() || 'vision/uvc',
    });
    console.log('Stopping recording...');

    try {
      const waitForFinish =
        recordingFinishedPromiseRef.current || Promise.resolve(undefined);

      await Promise.race([
        Promise.resolve((cameraRef.current as any).stopRecording()),
        new Promise(resolve => setTimeout(resolve, 15000)),
      ]);

      const recordedPath = await Promise.race([
        waitForFinish,
        new Promise<string | undefined>(resolve =>
          setTimeout(() => resolve(undefined), 15000),
        ),
      ]);

      const fileInfo = await inspectRecordedVideoFile(recordedPath, getActiveCameraBackend() === 'uvc' ? 'usb' : getActiveCameraBackend());
      logRecorderFlow(
        recordedPath && fileInfo.usable ? 'replay-ready' : 'stop-failed',
        {
          backend: getActiveCameraBackend() || 'vision/uvc',
          path: recordedPath,
          fileExists: fileInfo.exists,
          fileSize: fileInfo.size,
          reason:
            recordedPath && fileInfo.usable
              ? undefined
              : 'camera stop did not return a registered usable file',
        },
      );
      recordDebugLog('RecorderFlow', 'stopVideoRecording-finished', {
        path: recordedPath,
      });

      if (!recordedPath || !fileInfo.usable) {
        isRecordingRef.current = false;
        setIsRecording(false);
        isStoppingRecordingRef.current = false;
        restartAfterStopRef.current = false;
        return undefined;
      }

      return recordedPath;
    } catch (error) {
      logRecorderFlow('stop-failed', {
        backend: getActiveCameraBackend() || 'vision/uvc',
        error,
      });
      recordDebugLog('RecorderFlow', 'recording-stop-skipped-error', {
        error: String((error as any)?.message || error),
      });
      isRecordingRef.current = false;
      setIsRecording(false);
      isStoppingRecordingRef.current = false;
      restartAfterStopRef.current = false;
      return undefined;
    }
  };

  const resolveAplusTargetScoreFromSettings = useCallback(() => {
    const rawTarget =
      (gameSettings as any)?.players?.goal?.goal ??
      (gameSettings as any)?.players?.goal ??
      (gameSettings as any)?.goal ??
      (gameSettings as any)?.targetScore ??
      (playerSettings as any)?.goal ??
      (playerSettings as any)?.targetScore ??
      (playerSettings?.playingPlayers?.[0] as any)?.goal ??
      (playerSettings?.playingPlayers?.[1] as any)?.goal ??
      0;

    const num = Number(rawTarget);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }, [gameSettings, playerSettings]);

  const resolveAplusSnookerSetTargetFromSettings = useCallback(() => {
    return getSnookerSetPointTarget(gameSettings, playerSettings);
  }, [gameSettings, playerSettings]);

  const resolveAplusCountdownBaseTimeFromSettings = useCallback(() => {
    const rawBase =
      (gameSettings as any)?.mode?.countdownTime ??
      (gameSettings as any)?.countdownTime ??
      (gameSettings as any)?.countdown?.time ??
      (gameSettings as any)?.timerDuration ??
      countdownTime ??
      40;

    const num = Number(rawBase);
    return Number.isFinite(num) && num > 0 ? num : 40;
  }, [gameSettings, countdownTime]);

  const aplusLiveScoreLastSignatureRef = useRef('');
  const aplusLiveScoreLastPushAtRef = useRef(0);

  useEffect(() => {
    aplusLiveScoreLastSignatureRef.current = '';
    aplusLiveScoreLastPushAtRef.current = 0;
  }, [
    (gameSettings as any)?.aplusLiveScore?.tournamentId,
    (gameSettings as any)?.aplusLiveScore?.matchId,
    (gameSettings as any)?.aplusLiveScore?.matchNumber,
  ]);

  const pushAplusLiveScoreSnapshot = useCallback(
    async (reason: string, force = false) => {
      if (!gameSettings?.aplusLiveScore?.enabled) {
        return;
      }

      const players = playerSettings?.playingPlayers || [];
      const score1 = Number(players[0]?.totalPoint || 0);
      const score2 = Number(players[1]?.totalPoint || 0);
      const snookerSetScore1 = getSnookerSetScore(players[0]);
      const snookerSetScore2 = getSnookerSetScore(players[1]);
      const safeCountdownTime = Math.max(
        0,
        Math.round(Number(countdownTime ?? 0)),
      );
      const safeCountdownBaseTime = resolveAplusCountdownBaseTimeFromSettings();
      const safeTargetScore = resolveAplusTargetScoreFromSettings();
      const safeSnookerSetTarget = resolveAplusSnookerSetTargetFromSettings();
      const safeTurns = Math.max(0, Math.round(Number(totalTurns ?? 0)));
      const safeTotalTime = Math.max(0, Math.round(Number(totalTime ?? 0)));
      const running = Boolean(
        isStarted && !isPaused && !isMatchPaused && !winner,
      );

      const signature = [
        gameSettings?.aplusLiveScore?.matchId || '',
        score1,
        score2,
        snookerSetScore1,
        snookerSetScore2,
        safeTurns,
        safeTotalTime,
        safeCountdownTime,
        safeCountdownBaseTime,
        safeTargetScore,
        safeSnookerSetTarget,
        currentPlayerIndex,
        winner ? 'winner' : '',
        isStarted ? 'started' : 'not-started',
        isPaused ? 'paused' : 'not-paused',
        isMatchPaused ? 'match-paused' : 'match-not-paused',
        running ? 'timer-running' : 'timer-stopped',
      ].join('|');

      const now = Date.now();
      const sameAsLast = signature === aplusLiveScoreLastSignatureRef.current;
      const elapsedSinceLastPush = now - aplusLiveScoreLastPushAtRef.current;

      // Không gửi lại cùng một snapshot đã dừng/kết thúc. Bản cũ force 350ms
      // vẫn bắn PATCH liên tục kể cả status=finished, nên khi đổi T3 -> T6
      // trạng thái cũ bị đẩy lặp vào trận mới.
      if (sameAsLast && !running) {
        return;
      }

      // Khi đang chạy countdown, chỉ cần gửi khi state đổi hoặc tối đa khoảng 1 giây/lần.
      // Tránh spam 2-3 request giống hệt nhau trong cùng một giây.
      if (sameAsLast && elapsedSinceLastPush < 900) {
        return;
      }

      if (!force && sameAsLast) {
        return;
      }

      aplusLiveScoreLastSignatureRef.current = signature;
      aplusLiveScoreLastPushAtRef.current = now;

      try {
        await pushAplusLiveScoreUpdate({
          gameSettings,
          playerSettings,
          totalTurns: safeTurns,
          totalTime: safeTotalTime,
          countdownTime: safeCountdownTime,
          countdownBaseTime: safeCountdownBaseTime,
          targetScore: safeTargetScore,
          currentPlayerIndex,
          winner,
          isStarted,
          isPaused,
          isMatchPaused,
        });

        console.log('[AplusLiveScore] push ok:', {
          reason,
          score1,
          score2,
          setScore1: snookerSetScore1,
          setScore2: snookerSetScore2,
          turnCount: safeTurns,
          countdownTime: safeCountdownTime,
          countdownBaseTime: safeCountdownBaseTime,
          targetScore: safeTargetScore,
          snookerSetTarget: safeSnookerSetTarget,
          running,
        });
      } catch (error: any) {
        console.log('[AplusLiveScore] push failed:', error?.message || error);
      }
    },
    [
      gameSettings,
      playerSettings,
      totalTurns,
      totalTime,
      countdownTime,
      currentPlayerIndex,
      winner,
      isStarted,
      isEndingGame,
      isPaused,
      isMatchPaused,
      resolveAplusCountdownBaseTimeFromSettings,
      resolveAplusTargetScoreFromSettings,
      resolveAplusSnookerSetTargetFromSettings,
    ],
  );

  // Push ngay khi điểm/lượt/timer thay đổi, giảm độ trễ so với debounce cũ.
  useEffect(() => {
    const timeout = setTimeout(() => {
      void pushAplusLiveScoreSnapshot('state-change-fast', false);
    }, 45);

    return () => clearTimeout(timeout);
  }, [pushAplusLiveScoreSnapshot]);

  // Push nhịp 350ms để web nhận live score + countdown song song với app,
  // kể cả lúc React không render đúng nhịp hoặc API/web polling bị lệch.
  useEffect(() => {
    if (!gameSettings?.aplusLiveScore?.enabled) {
      return;
    }

    const timer = setInterval(() => {
      void pushAplusLiveScoreSnapshot('parallel-fast-350ms-sync', true);
    }, 350);

    return () => clearInterval(timer);
  }, [gameSettings?.aplusLiveScore?.enabled, pushAplusLiveScoreSnapshot]);

  return useMemo(() => {
    return {
      matchCountdownRef,
      winner,
      currentPlayerIndex,
      poolBreakPlayerIndex,
      totalTime,
      totalTurns,
      playerSettings,
      gameSettings,
      countdownTime,
      warmUpCount,
      warmUpCountdownTime,
      updateGameSettings,
      isStarted,
      isEndingGame,
      isPaused,
      isVarReplayPreparing,
      isVarReplayReady,
      isMatchPaused,
      soundEnabled,
      gameBreakEnabled,
      poolBreakEnabled,
      proModeEnabled,
      webcamFolderName,
      onEditPlayerName,
      onChangePlayerPoint,
      onSnookerScore,
      onSnookerFoul,
      onEndSnookerSet,
      onPressGiveMoreTime,
      onViolate,
      getWarmUpTimeString,
      onGameBreak,
      onWarmUp,
      onEndWarmUp,
      onQuickMatchWarmUpNext,
      onSwitchTurn,
      onSwitchPoolBreakPlayerIndex,
      onSwapPlayers,
      onIncreaseTotalTurns,
      onDecreaseTotalTurns,
      onToggleSound,
      onToggleProMode,
      updateWebcamFolderName,
      onPool15OnlyScore,
      onPoolScore,
      pool8Trackers,
      pool8SetWinnerIndex,
      onSwapPool8Groups,
      onPressPool8Ball,
      pool8FreeHole10Scores,
      pool8FreeSetWinnerIndex,
      onIncrementPool8FreeHole10,
      onDecrementPool8FreeHole10,
      onSelectWinner,
      onClearWinner,
      onCloseWinnerSummary,
      onPoolBreak,
      onStart,
      onEndTurn,
      onToggleCountDown,
      onPause,
      onReplay,
      onStop,
      onReset,
      onResetTurn,
      youtubeLiveOverlay,
      youtubeLivePreviewActive,
      dismissYouTubeLiveOverlay,
      openYouTubeLiveLogin,
      cameraRef,
      setIsCameraReady,
      isCameraReady,
      isRecording,
      cameraSessionNonce,
      language,
      //isPreview,
      //setIsPreview,
      //pauseVideoRecording,
      //resumeVideoRecording,
      // stopVideoRecording,
      // videoUri,
      // setVideoUri
    };
  }, [
    matchCountdownRef,
    winner,
    currentPlayerIndex,
    poolBreakPlayerIndex,
    totalTime,
    totalTurns,
    playerSettings,
    gameSettings,
    countdownTime,
    warmUpCount,
    warmUpCountdownTime,
    updateGameSettings,
    isStarted,
    isEndingGame,
    isPaused,
    isVarReplayPreparing,
    isVarReplayReady,
    isMatchPaused,
    soundEnabled,
    gameBreakEnabled,
    poolBreakEnabled,
    proModeEnabled,
    webcamFolderName,
    onEditPlayerName,
    onChangePlayerPoint,
    onSnookerScore,
    onSnookerFoul,
    onEndSnookerSet,
    onPressGiveMoreTime,
    onViolate,
    getWarmUpTimeString,
    onGameBreak,
    onWarmUp,
    onEndWarmUp,
    onQuickMatchWarmUpNext,
    onSwitchTurn,
    onSwitchPoolBreakPlayerIndex,
    onSwapPlayers,
    onIncreaseTotalTurns,
    onDecreaseTotalTurns,
    onToggleSound,
    onToggleProMode,
    updateWebcamFolderName,
    onPool15OnlyScore,
    onPoolScore,
    pool8Trackers,
    pool8SetWinnerIndex,
    onSwapPool8Groups,
    onPressPool8Ball,
    pool8FreeHole10Scores,
    pool8FreeSetWinnerIndex,
    onIncrementPool8FreeHole10,
    onDecrementPool8FreeHole10,
    onSelectWinner,
    onClearWinner,
    onCloseWinnerSummary,
    onPoolBreak,
    onStart,
    onEndTurn,
    onToggleCountDown,
    onPause,
    onReplay,
    onStop,
    onReset,
    onResetTurn,
    youtubeLiveOverlay,
    youtubeLivePreviewActive,
    dismissYouTubeLiveOverlay,
    openYouTubeLiveLogin,
    cameraRef,
    isPaused,
    setIsCameraReady,
    isCameraReady,
    isRecording,
    cameraSessionNonce,
    language,
    // isPreview,
    // setIsPreview,
    // videoUri,
    // setVideoUri
    //pauseVideoRecording,
    // videoUri,
    //resumeVideoRecording,
    //stopVideoRecording,
  ]);
};

export default GamePlayViewModel;
