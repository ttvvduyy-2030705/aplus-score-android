import {PLAYER_COLOR} from 'constants/player';
import {gameActions} from 'data/redux/actions/game';
import i18n from 'i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert} from 'react-native';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import {screens} from 'scenes/screens';
import {BilliardCategory} from 'types/category';
import {Navigation} from 'types/navigation';
import {PlayerNumber, PlayerSettings} from 'types/player';
import {
  GameCountDownTime,
  GameExtraTimeBonus,
  GameExtraTimeTurns,
  GameMode,
  GameSettingsMode,
  GameWarmUpTime,
} from 'types/settings';
import {isCarom3CGame, isCaromLikeGame, isPoolGame, isSnookerGame} from 'utils/game';
import {DEFAULT_PLAYERS, GAME_SETTINGS, PLAYER_SETTINGS} from './constants';
import {GAME_EXTRA_TIME_BONUS} from 'constants/game-settings';
import {COUNTRIES, CountryItem} from './player/countries';

type AplusTournament = any;
type AplusLiveMatch = any;
const fetchAplusTournaments = async (): Promise<AplusTournament[]> => [];
const fetchAplusMatchByNumber = async (): Promise<AplusLiveMatch> => {
  throw new Error('LiveScore đã được tắt trong bản Android offline.');
};
const lockAplusLiveScoreMatch = async (match: AplusLiveMatch): Promise<AplusLiveMatch> => match;
const clearStoredYouTubeConnection = async () => undefined;
const createYouTubeLiveSession = async () => {
  throw new Error('Livestream đã được tắt trong bản Android offline.');
};
const getYouTubeLiveStatus = async () => null;
const isYouTubeNotConnectedError = () => false;
const stopYouTubeLiveSession = async () => undefined;
const DEFAULT_YOUTUBE_RTMP_URL = '';
type WindowsFfmpegLiveConfig = Record<string, unknown>;
const createWindowsFfmpegSnapshotFromGameState = (_params: any) => ({});
const getWindowsFfmpegLiveStatus = async () => ({status: 'stopped'});
const startWindowsFfmpegYouTubeLive = async () => ({ok: false, error: 'disabled'});
const stopWindowsFfmpegYouTubeLive = async () => undefined;

const formatVietnamLiveTitleTime = (date: Date = new Date()): string => {
  const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(vietnamTime.getUTCDate())}/${pad(
    vietnamTime.getUTCMonth() + 1,
  )}/${vietnamTime.getUTCFullYear()} ${pad(vietnamTime.getUTCHours())}:${pad(
    vietnamTime.getUTCMinutes(),
  )}:${pad(vietnamTime.getUTCSeconds())} GMT+7`;
};

type LivestreamRouteParams = {
  livestreamPlatform?: 'facebook' | 'youtube' | 'tiktok' | 'device' | null;
  saveToDeviceWhileStreaming?: boolean;
  liveVisibility?: 'public' | 'private' | 'unlisted';
  liveAccountName?: string;
  liveAccountId?: string;
  liveSetupToken?: string;
  tournamentName?: string;
  selectedTournamentName?: string;
  competitionName?: string;
  eventName?: string;
  leagueName?: string;
  title?: string;
  tournament?: {name?: string; title?: string};
  selectedTournament?: {name?: string; title?: string};
};

export interface Props extends Navigation, LivestreamRouteParams {
  route?: {
    params?: LivestreamRouteParams;
  };
}

type SettingsDraftSnapshot = {
  category: BilliardCategory;
  gameSettingsMode: GameSettingsMode;
  playerSettings: PlayerSettings;
  savedAt?: number;
};

const normalizeLivestreamPlatform = (
  value?: string | null,
): 'facebook' | 'youtube' | 'tiktok' | 'device' | null => {
  if (
    value === 'facebook' ||
    value === 'youtube' ||
    value === 'tiktok' ||
    value === 'device'
  ) {
    return value;
  }

  return null;
};




const normalizeAplusTournamentGameType = (value?: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();

  if (!raw) return '';
  if (raw.includes('snooker')) return 'snooker';
  if (raw.includes('libre') || raw.includes('free')) return 'libre';
  if (raw.includes('carom') || raw.includes('carambole') || raw.includes('3c') || raw.includes('3-cushion') || raw.includes('3 cushion')) return 'carom';
  if (raw.includes('pool') || raw.includes('9-ball') || raw.includes('10-ball') || raw.includes('8-ball')) return 'pool';

  if (raw === 'snooker' || raw === 'libre' || raw === 'carom' || raw === 'pool') return raw;
  return raw;
};

const getCurrentAplusGameType = (category: BilliardCategory) => {
  const raw = String(category || '').trim().toLowerCase();

  if (raw.includes('libre') || raw.includes('free')) return 'libre';
  if (isSnookerGame(category)) return 'snooker';
  if (isPoolGame(category)) return 'pool';
  if (isCaromLikeGame(category)) return 'carom';

  return raw || 'unknown';
};

const APLUS_GAME_TYPE_LABELS: Record<string, string> = {
  pool: 'Pool',
  carom: 'Carom',
  libre: 'Libre',
  snooker: 'Snooker',
};

const getAplusGameTypeLabel = (value?: unknown) => {
  const normalized = normalizeAplusTournamentGameType(value);
  return APLUS_GAME_TYPE_LABELS[normalized] || String(value || '').trim() || 'Không rõ';
};


const normalizeAplusMatchNumberInput = (value?: unknown) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Za-z_-]/g, '')
    .toUpperCase();

  if (!cleaned) {
    return '';
  }

  return `T${cleaned.replace(/^T+/i, '')}`;
};

const getAplusMatchBlockAlert = (error: any) => {
  const code = String(error?.code || error?.data?.code || '').toUpperCase();
  const message = String(error?.message || error?.data?.message || error || 'Không thể vào trận này.');
  const lower = message.toLowerCase();

  if (
    code === 'MATCH_FINISHED' ||
    lower.includes('đã kết thúc') ||
    lower.includes('da ket thuc') ||
    lower.includes('kết thúc rồi') ||
    lower.includes('ket thuc roi') ||
    lower.includes('finished') ||
    lower.includes('completed')
  ) {
    return {
      title: 'Trận đã kết thúc',
      message,
    };
  }

  if (
    code === 'MATCH_LOCKED' ||
    lower.includes('đang diễn ra') ||
    lower.includes('dang dien ra') ||
    lower.includes('máy khác') ||
    lower.includes('may khac') ||
    lower.includes('locked')
  ) {
    return {
      title: 'Trận đang diễn ra',
      message,
    };
  }

  return null;
};

const getAplusTournamentModeError = (
  tournament: AplusTournament | undefined,
  category: BilliardCategory,
) => {
  const tournamentGameType = normalizeAplusTournamentGameType(
    tournament?.gameType ||
      tournament?.raw?.gameType ||
      tournament?.raw?.type ||
      tournament?.raw?.gameMode ||
      tournament?.raw?.category ||
      tournament?.raw?.discipline,
  );

  // Old tournaments may not have gameType yet. Do not block them.
  if (!tournamentGameType) {
    return '';
  }

  const currentGameType = getCurrentAplusGameType(category);


  if (currentGameType !== tournamentGameType) {
    return `Sai chế độ, hãy chọn lại. App đang chọn ${getAplusGameTypeLabel(currentGameType)}, còn giải này là ${getAplusGameTypeLabel(tournamentGameType)}.`;
  }

  return '';
};

const normalizeYouTubeIngestUrlForFfmpeg = (value?: string) =>
  String(value || DEFAULT_YOUTUBE_RTMP_URL).trim().replace(/\/+$/g, '');

const resolveYouTubeIngestion = (session?: any) => {
  const streamUrl = String(session?.streamUrl || '').trim();
  const streamName = String(session?.streamName || '').trim();
  const streamUrlWithKey = String(session?.streamUrlWithKey || '').trim();

  if (streamUrl && streamName) {
    return {
      rtmpUrl: normalizeYouTubeIngestUrlForFfmpeg(streamUrl),
      streamKey: streamName,
    };
  }

  if (streamUrlWithKey) {
    const clean = streamUrlWithKey.replace(/\/+$/g, '');
    const lastSlash = clean.lastIndexOf('/');
    if (lastSlash > 0) {
      return {
        rtmpUrl: normalizeYouTubeIngestUrlForFfmpeg(clean.slice(0, lastSlash)),
        streamKey: clean.slice(lastSlash + 1),
      };
    }
  }

  return {
    rtmpUrl: normalizeYouTubeIngestUrlForFfmpeg(streamUrl || DEFAULT_YOUTUBE_RTMP_URL),
    streamKey: streamName,
  };
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRedundantYouTubeTransitionError = (error: any) => {
  const message = String(error?.message || error?.payload?.message || error || '');
  return message.toLowerCase().includes('redundant transition');
};


const kickYouTubeGoLiveInBackground = (broadcastId: string) => {
  const id = String(broadcastId || '').trim();
  if (!id) {
    return;
  }

  void (async () => {
    let lastBroadcastStatus = '';
    let lastStreamStatus = '';

    // Keep poking the backend transition endpoint in the background.  This does
    // not block gameplay, but it avoids the case where the app enters the match
    // while YouTube remains stuck at ready/offline because the single early check
    // happened before liveStream.status became active.
    for (let attempt = 1; attempt <= 90; attempt += 1) {
      try {
        const ffmpegStatus = await getWindowsFfmpegLiveStatus().catch(() => null);
        if (ffmpegStatus?.status === 'stopped' || ffmpegStatus?.status === 'error') {
          console.log('[YouTube Live Background GoLive] stop polling because FFmpeg stopped', {
            attempt,
            broadcastId: id,
            ffmpegStatus: ffmpegStatus?.status,
            ffmpegError: ffmpegStatus?.stderrSummary || ffmpegStatus?.error || '',
          });
          return;
        }

        const status: any = await getYouTubeLiveStatus(id);
        lastBroadcastStatus = String(status?.broadcast?.status?.lifeCycleStatus || '');
        lastStreamStatus = String(status?.stream?.status?.streamStatus || '');

        console.log('[YouTube Live Background GoLive]', {
          attempt,
          broadcastId: id,
          broadcastStatus: lastBroadcastStatus,
          streamStatus: lastStreamStatus,
          autoTransitioned: Boolean(status?.autoTransitioned),
          ffmpegStatus: ffmpegStatus?.status,
          ffmpegPid: ffmpegStatus?.pid,
        });

        if (lastBroadcastStatus === 'live' && lastStreamStatus === 'active') {
          return;
        }
      } catch (error: any) {
        const message = error?.message || String(error);
        if (!isRedundantYouTubeTransitionError(error)) {
          console.log('[YouTube Live Background GoLive] status check failed', {
            attempt,
            broadcastId: id,
            message,
          });
        }
      }

      await wait(attempt <= 20 ? 700 : 1200);
    }

    console.log('[YouTube Live Background GoLive] gave up but kept local FFmpeg alive', {
      broadcastId: id,
      lastBroadcastStatus,
      lastStreamStatus,
    });
  })();
};

const pollUntilYouTubeBroadcastLive = async (broadcastId: string) => {
  let lastStatus: any = null;
  let redundantTransitionCount = 0;
  let lastBroadcastStatus = 'unknown';
  let lastStreamStatus = 'unknown';

  // v74: Do not enter gameplay until YouTube itself confirms the broadcast is
  // live and the bound stream is active. FFmpeg can report local "live" several
  // seconds before YouTube's public watch page leaves "scheduled/offline".
  // That was the exact cause of entering the match while YouTube still showed
  // "sắp diễn ra".
  await wait(900);

  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const ffmpegStatus = await getWindowsFfmpegLiveStatus();

    if (ffmpegStatus?.status === 'stopped' || ffmpegStatus?.status === 'error') {
      throw new Error(
        ffmpegStatus?.stderrSummary ||
          ffmpegStatus?.error ||
          'FFmpeg đã dừng trước khi YouTube chuyển sang live.',
      );
    }

    let youtubeStatus: any = null;
    try {
      youtubeStatus = await getYouTubeLiveStatus(broadcastId);
      lastStatus = youtubeStatus;
    } catch (statusError: any) {
      if (isRedundantYouTubeTransitionError(statusError)) {
        redundantTransitionCount += 1;
        console.log('[Settings YouTube Live Status Poll] redundant transition; keep waiting for real live/active', {
          attempt,
          redundantTransitionCount,
          broadcastId,
          ffmpegStatus: ffmpegStatus?.status,
          ffmpegPid: ffmpegStatus?.pid,
          message: statusError?.message || String(statusError),
        });
        await wait(attempt <= 20 ? 650 : 1000);
        continue;
      }

      throw statusError;
    }

    const isRedundantMarker = Boolean((youtubeStatus as any)?.redundantTransition);
    const broadcastStatus = String(
      (youtubeStatus as any)?.broadcast?.status?.lifeCycleStatus || '',
    );
    const streamStatus = String(
      (youtubeStatus as any)?.stream?.status?.streamStatus || '',
    );

    lastBroadcastStatus = broadcastStatus || lastBroadcastStatus;
    lastStreamStatus = streamStatus || lastStreamStatus;

    console.log('[Settings YouTube Live Status Poll]', {
      attempt,
      broadcastId,
      broadcastStatus,
      streamStatus,
      redundantTransitionCount,
      redundantMarker: isRedundantMarker,
      autoTransitioned: Boolean((youtubeStatus as any)?.autoTransitioned),
      ffmpegStatus: ffmpegStatus?.status,
      ffmpegPid: ffmpegStatus?.pid,
      ffmpegStderrSummary: ffmpegStatus?.stderrSummary || ffmpegStatus?.error || '',
    });

    if (!isRedundantMarker && broadcastStatus === 'live' && streamStatus === 'active') {
      // Small public-player settle wait: enough to avoid the scheduled card, but
      // short enough to keep the operator flow responsive.
      await wait(1200);
      return youtubeStatus;
    }

    await wait(attempt <= 20 ? 650 : 1000);
  }

  throw new Error(
    `YouTube chưa chuyển sang live. Broadcast=${lastBroadcastStatus}, stream=${lastStreamStatus}`,
  );
};

const toDisplayText = (value?: unknown) => String(value ?? '').trim();

const getRouteTournamentName = (routeParams?: LivestreamRouteParams | any) => {
  return (
    toDisplayText(routeParams?.tournamentName) ||
    toDisplayText(routeParams?.selectedTournamentName) ||
    toDisplayText(routeParams?.competitionName) ||
    toDisplayText(routeParams?.eventName) ||
    toDisplayText(routeParams?.leagueName) ||
    toDisplayText(routeParams?.title) ||
    toDisplayText(routeParams?.tournament?.name) ||
    toDisplayText(routeParams?.tournament?.title) ||
    toDisplayText(routeParams?.selectedTournament?.name) ||
    toDisplayText(routeParams?.selectedTournament?.title)
  );
};

const SETTINGS_DRAFT_STORAGE_KEY = '@APLUS_GAME_SETTINGS_DRAFT_V1';
const APLUS_TOURNAMENT_AUTO_REFRESH_MS = 30000;

const cloneSettingsValue = <T,>(value: T): T => {
  if (value == null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (_error) {
    return value;
  }
};

const setSettingsDraftSync = (draft: SettingsDraftSnapshot | null) => {
  (globalThis as any).__APLUS_GAME_SETTINGS_DRAFT__ = draft
    ? cloneSettingsValue(draft)
    : null;
};

const getSettingsDraftSync = (): SettingsDraftSnapshot | null => {
  const draft = (globalThis as any).__APLUS_GAME_SETTINGS_DRAFT__;
  return draft ? cloneSettingsValue(draft) : null;
};

const setSettingsDraft = async (draft: SettingsDraftSnapshot | null) => {
  const normalizedDraft = draft ? cloneSettingsValue(draft) : null;
  setSettingsDraftSync(normalizedDraft);

  try {
    if (normalizedDraft) {
      await AsyncStorage.setItem(
        SETTINGS_DRAFT_STORAGE_KEY,
        JSON.stringify(normalizedDraft),
      );
    } else {
      await AsyncStorage.removeItem(SETTINGS_DRAFT_STORAGE_KEY);
    }
  } catch (error) {
    console.log('[Game Settings] Failed to persist draft:', error);
  }
};

const getSettingsDraft = async (): Promise<SettingsDraftSnapshot | null> => {
  const runtimeDraft = getSettingsDraftSync();
  if (runtimeDraft) {
    return runtimeDraft;
  }

  try {
    const rawDraft = await AsyncStorage.getItem(SETTINGS_DRAFT_STORAGE_KEY);
    if (!rawDraft) {
      return null;
    }

    const parsedDraft = JSON.parse(rawDraft) as SettingsDraftSnapshot;
    setSettingsDraftSync(parsedDraft);
    return cloneSettingsValue(parsedDraft);
  } catch (error) {
    console.log('[Game Settings] Failed to load draft:', error);
    return null;
  }
};

const clearSettingsDraft = () => {
  setSettingsDraftSync(null);
  void setSettingsDraft(null);
};


const isRemoteUri = (value?: string) => /^https?:\/\//i.test(String(value || '').trim());

const findCountryByCode = (code?: string) => {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) {
    return undefined;
  }

  return COUNTRIES.find(item => item.code.toUpperCase() === normalizedCode);
};

const DEFAULT_COUNTRY: CountryItem =
  findCountryByCode('VN') ?? {
    code: 'VN',
    name: 'Viet Nam',
    normalizedName: 'viet nam',
    flag: 'VN',
  };

const createDefaultPlayerCountry = () => ({
  countryCode: DEFAULT_COUNTRY.code,
  countryName: DEFAULT_COUNTRY.name,
  flag: DEFAULT_COUNTRY.code,
});

const clampPlayerNumber = (value?: number): PlayerNumber => {
  const numeric = Number(value || 2);
  if (numeric >= 4) {
    return 4;
  }
  if (numeric <= 2) {
    return 2;
  }
  return 3;
};

const buildPlayersForCount = (
  playerNumber: PlayerNumber,
  category: BilliardCategory,
  previousPlayers: PlayerSettings['playingPlayers'] = [],
) => {
  return Array.from({length: playerNumber}, (_, number) => {
    const previousPlayer = previousPlayers[number];
    return {
      ...createDefaultPlayerCountry(),
      ...(previousPlayer || {}),
      name: previousPlayer?.name || i18n.t(`player${number + 1}`),
      color: isPoolGame(category) || isSnookerGame(category)
        ? PLAYER_COLOR[1]
        : (PLAYER_COLOR as any)[number],
      totalPoint: Number(previousPlayer?.totalPoint || 0),
      setScore: Number((previousPlayer as any)?.setScore || 0),
      frameScore: Number((previousPlayer as any)?.frameScore || 0),
      snooker: {
        ...((previousPlayer as any)?.snooker || {}),
        setScore: Number(
          (previousPlayer as any)?.snooker?.setScore ??
            (previousPlayer as any)?.setScore ??
            0,
        ),
      },
    };
  });
};

const sanitizePlayerSettings = (
  value: PlayerSettings,
  category: BilliardCategory = '9-ball',
): PlayerSettings => {
  const safeValue = cloneSettingsValue(value) as PlayerSettings;
  const playerNumber = clampPlayerNumber(safeValue.playerNumber);

  const normalizedPlayers = (safeValue.playingPlayers || []).map(player => {
    const fallbackCountry =
      findCountryByCode((player as any)?.countryCode) ?? DEFAULT_COUNTRY;
    const rawFlag = String((player as any)?.flag || '').trim();
    const rawCode = String((player as any)?.countryCode || '').trim().toUpperCase();
    const safeCode = /^[A-Z]{2}$/.test(rawCode)
      ? rawCode
      : fallbackCountry.code;
    const safeFlag = isRemoteUri(rawFlag) ? rawFlag : safeCode;

    return {
      ...player,
      countryCode: String(safeCode || ''),
      countryName: String(
        (player as any)?.countryName || fallbackCountry.name || '',
      ),
      flag: safeFlag,
    };
  });

  const snookerSetTargetRaw = Number(
    (safeValue.goal as any)?.snookerSetTarget ??
      (safeValue.goal as any)?.framePointTarget ??
      75,
  );
  const safeSnookerSetTarget =
    Number.isFinite(snookerSetTargetRaw) && snookerSetTargetRaw > 0
      ? Math.round(snookerSetTargetRaw)
      : 75;

  return {
    ...safeValue,
    playerNumber,
    goal: {
      ...safeValue.goal,
      snookerSetTarget: safeSnookerSetTarget,
      framePointTarget: safeSnookerSetTarget,
    },
    playingPlayers: buildPlayersForCount(playerNumber, category, normalizedPlayers),
  } as PlayerSettings;
};

const getAplusPlayerCountry = (player?: Partial<PlayerSettings['playingPlayers'][number]>) => {
  const rawCode = String((player as any)?.countryCode || '').trim().toUpperCase();
  const matchedCountry = findCountryByCode(rawCode) || DEFAULT_COUNTRY;
  const safeCode = /^[A-Z]{2}$/.test(rawCode) ? rawCode : matchedCountry.code;
  const rawFlag = String((player as any)?.flag || '').trim();

  return {
    countryCode: safeCode,
    countryName: String((player as any)?.countryName || matchedCountry.name || safeCode),
    flag: isRemoteUri(rawFlag) ? rawFlag : safeCode,
  };
};

const resetAplusPlayerForNewMatch = (
  player: PlayerSettings['playingPlayers'][number],
  extraTimeTurns?: any,
): PlayerSettings['playingPlayers'][number] => ({
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
  proMode: {
    ...(player.proMode || {}),
    highestRate: 0,
    secondHighestRate: 0,
    average: 0,
    currentPoint: 0,
    extraTimeTurns: extraTimeTurns ?? player.proMode?.extraTimeTurns,
  },
});

const applyAplusMatchToPlayerSettings = (
  previousSettings: PlayerSettings,
  match: AplusLiveMatch,
  currentCategory: BilliardCategory,
  extraTimeTurns?: any,
): PlayerSettings => {
  const currentPlayerNumber = clampPlayerNumber(previousSettings.playerNumber);
  const basePlayers = buildPlayersForCount(
    currentPlayerNumber,
    currentCategory,
    previousSettings.playingPlayers,
  );
  const matchPlayers = [match.player1, match.player2];

  return {
    ...previousSettings,
    // Mỗi lần lấy một trận từ web phải coi là một trận mới hoàn toàn.
    // Không giữ điểm/timer/high-run của trận trước, nếu không nhập T6 vẫn có thể
    // mang điểm dở dang của T3 rồi đẩy ngược lên web.
    playingPlayers: basePlayers.map((player, index) => {
      const webPlayer = matchPlayers[index] || {};
      const webName = toDisplayText((webPlayer as any)?.name);
      const resetPlayer = resetAplusPlayerForNewMatch(player, extraTimeTurns);

      if (!webName && index > 1) {
        return resetPlayer;
      }

      const webCountry = getAplusPlayerCountry(webPlayer as any);

      return {
        ...resetPlayer,
        name: webName || resetPlayer.name || i18n.t(`player${index + 1}`),
        ...webCountry,
      };
    }),
  } as PlayerSettings;
};


const GameSettingsViewModel = (props: Props) => {
  const dispatch = useDispatch();
  // withWrapper spreads route.params directly into props, so reading only
  // props.route?.params silently drops livestreamPlatform in release builds.
  // Keep the route fallback for future direct React Navigation usage.
  const routeParams = (props.route?.params || props || {}) as LivestreamRouteParams;
  const livestreamPlatform = normalizeLivestreamPlatform(
    routeParams.livestreamPlatform,
  );
  const saveToDeviceWhileStreaming = Boolean(
    routeParams.saveToDeviceWhileStreaming ?? false,
  );
  const liveVisibility = routeParams.liveVisibility || 'public';
  const liveAccountName = routeParams.liveAccountName || '';
  const liveAccountId = routeParams.liveAccountId || '';
  const liveSetupToken = routeParams.liveSetupToken || '';
  const selectedTournamentName = getRouteTournamentName(routeParams);
  const restoredDraftRef = useRef(false);
  const runtimeDraft = getSettingsDraftSync();

  const [category, setCategory] = useState<BilliardCategory>(
    runtimeDraft?.category ?? '9-ball',
  );
  const [gameSettingsMode, setGameSettingsMode] =
    useState<GameSettingsMode>(() => {
      const draftCategory = runtimeDraft?.category ?? '9-ball';
      const draftMode = runtimeDraft?.gameSettingsMode ?? GAME_SETTINGS;
      if (isSnookerGame(draftCategory) && draftMode?.mode === 'fast') {
        return {
          mode: 'pro',
          extraTimeTurns: 1,
          countdownTime: 35,
          warmUpTime: 300,
          extraTimeBonus: GAME_EXTRA_TIME_BONUS.s0,
        };
      }
      return draftMode;
    });
  const [playerSettings, setPlayerSettings] = useState<PlayerSettings>(
    runtimeDraft?.playerSettings
      ? sanitizePlayerSettings(runtimeDraft.playerSettings, runtimeDraft?.category ?? '9-ball')
      : PLAYER_SETTINGS(),
  );
  const [aplusTournaments, setAplusTournaments] = useState<AplusTournament[]>([]);
  const [selectedAplusTournamentIndex, setSelectedAplusTournamentIndex] = useState(0);
  const [aplusMatchNumber, setAplusMatchNumber] = useState('');
  const [selectedAplusMatch, setSelectedAplusMatch] = useState<AplusLiveMatch | null>(null);
  const [aplusLiveStatus, setAplusLiveStatus] = useState('Chưa kết nối web Aplus.');
  const [aplusLoadingTournaments, setAplusLoadingTournaments] = useState(false);
  const [aplusLoadingMatch, setAplusLoadingMatch] = useState(false);
  const aplusTournamentRefreshInFlightRef = useRef(false);
  const [youtubeLiveLoading, setYoutubeLiveLoading] = useState(false);
  const [youtubeLiveLoadingMessage, setYoutubeLiveLoadingMessage] = useState('Đang tải phiên live');

  const selectedAplusTournament = aplusTournaments[selectedAplusTournamentIndex];

  useEffect(() => {
    if (!isSnookerGame(category) || gameSettingsMode?.mode === 'pro') {
      return;
    }

    setGameSettingsMode({
      mode: 'pro',
      extraTimeTurns: 1,
      countdownTime: 35,
      warmUpTime: 300,
      extraTimeBonus: GAME_EXTRA_TIME_BONUS.s0,
    });
  }, [category, gameSettingsMode?.mode]);

  const _resetData = useCallback(() => {
    clearSettingsDraft();

    const timeout = setTimeout(() => {
      setCategory('9-ball');
      setGameSettingsMode(GAME_SETTINGS);
      setPlayerSettings(PLAYER_SETTINGS());
      setAplusMatchNumber('');
      setSelectedAplusMatch(null);
      setAplusLiveStatus('Chưa kết nối web Aplus.');
      clearTimeout(timeout);
    }, 100);
  }, []);


  useEffect(() => {
    let cancelled = false;

    if (runtimeDraft) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const persistedDraft = await getSettingsDraft();

      if (cancelled || !persistedDraft || restoredDraftRef.current) {
        return;
      }

      restoredDraftRef.current = true;
      setCategory(persistedDraft.category);
      setGameSettingsMode(
        isSnookerGame(persistedDraft.category) &&
          persistedDraft.gameSettingsMode?.mode === 'fast'
          ? {
              mode: 'pro',
              extraTimeTurns: 1,
              countdownTime: 35,
              warmUpTime: 300,
              extraTimeBonus: GAME_EXTRA_TIME_BONUS.s0,
            }
          : persistedDraft.gameSettingsMode,
      );
      setPlayerSettings(sanitizePlayerSettings(persistedDraft.playerSettings, persistedDraft.category));
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeDraft]);


  useEffect(() => {
    const nextPlayerNumber = clampPlayerNumber(playerSettings.playerNumber);
    const needsClamp =
      nextPlayerNumber !== playerSettings.playerNumber ||
      (playerSettings.playingPlayers?.length || 0) !== nextPlayerNumber;

    if (!needsClamp) {
      return;
    }

    setPlayerSettings(prev =>
      ({
        ...prev,
        playerNumber: nextPlayerNumber,
        playingPlayers: buildPlayersForCount(
          nextPlayerNumber,
          category,
          prev.playingPlayers,
        ),
      } as PlayerSettings),
    );
  }, [category, playerSettings.playerNumber, playerSettings.playingPlayers]);

  useEffect(() => {
    const draft: SettingsDraftSnapshot = {
      category,
      gameSettingsMode: cloneSettingsValue(gameSettingsMode),
      playerSettings: cloneSettingsValue(playerSettings),
      savedAt: Date.now(),
    };

    setSettingsDraftSync(draft);

    const timeout = setTimeout(() => {
      void setSettingsDraft(draft);
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [category, gameSettingsMode, playerSettings]);

  const onLoadAplusTournaments = useCallback(async () => {
    if (aplusLoadingTournaments || aplusTournamentRefreshInFlightRef.current) {
      return;
    }

    aplusTournamentRefreshInFlightRef.current = true;
    setAplusLoadingTournaments(true);
    setAplusLiveStatus('Đang tải danh sách giải mới nhất từ web...');

    try {
      const tournaments = await fetchAplusTournaments();

      // Bấm Tải giải = lấy danh sách mới và bỏ chọn giải/trận cũ.
      // Không giữ previousSelectedId nữa, tránh app bám lại giải cũ đã xoá trên web.
      setAplusTournaments(tournaments);
      setSelectedAplusTournamentIndex(0);
      setSelectedAplusMatch(null);
      setAplusMatchNumber('');

      setAplusLiveStatus(
        tournaments.length
          ? `Đã tải ${tournaments.length} giải mới nhất. Đang chọn giải mới nhất trong danh sách.`
          : 'Web chưa trả về giải nào.',
      );
    } catch (error: any) {
      setAplusLiveStatus(error?.message || 'Không tải được danh sách giải.');
    } finally {
      aplusTournamentRefreshInFlightRef.current = false;
      setAplusLoadingTournaments(false);
    }
  }, [aplusLoadingTournaments]);

  useEffect(() => {
    if (!aplusTournaments.length) {
      return;
    }

    let cancelled = false;

    const refreshSilently = async () => {
      if (cancelled || aplusLoadingTournaments || aplusTournamentRefreshInFlightRef.current) {
        return;
      }

      const previousSelectedId =
        selectedAplusTournament?.id ||
        selectedAplusMatch?.tournamentId ||
        '';

      aplusTournamentRefreshInFlightRef.current = true;

      try {
        const tournaments = await fetchAplusTournaments();

        if (cancelled) {
          return;
        }

        setAplusTournaments(tournaments);
        setSelectedAplusTournamentIndex(() => {
          if (!tournaments.length) {
            return 0;
          }

          const sameIndex = previousSelectedId
            ? tournaments.findIndex(tournament => tournament.id === previousSelectedId)
            : -1;

          return sameIndex >= 0 ? sameIndex : 0;
        });

        if (
          selectedAplusMatch?.tournamentId &&
          !tournaments.some(tournament => tournament.id === selectedAplusMatch.tournamentId)
        ) {
          setSelectedAplusMatch(null);
          setAplusMatchNumber('');
          setAplusLiveStatus('Giải/trận đang chọn đã không còn trên web. App đã cập nhật danh sách mới.');
        }
      } catch (error) {
        console.log('[AplusLiveScore] Silent tournament refresh failed:', error);
      } finally {
        aplusTournamentRefreshInFlightRef.current = false;
      }
    };

    const timer = setInterval(refreshSilently, APLUS_TOURNAMENT_AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    aplusTournaments.length,
    aplusLoadingTournaments,
    selectedAplusTournament?.id,
    selectedAplusMatch?.tournamentId,
  ]);

  const onPrevAplusTournament = useCallback(() => {
    setSelectedAplusTournamentIndex(prev => {
      if (!aplusTournaments.length) {
        return 0;
      }

      return prev <= 0 ? aplusTournaments.length - 1 : prev - 1;
    });
    setSelectedAplusMatch(null);
  }, [aplusTournaments.length]);

  const onNextAplusTournament = useCallback(() => {
    setSelectedAplusTournamentIndex(prev => {
      if (!aplusTournaments.length) {
        return 0;
      }

      return prev >= aplusTournaments.length - 1 ? 0 : prev + 1;
    });
    setSelectedAplusMatch(null);
  }, [aplusTournaments.length]);

  const onChangeAplusMatchNumber = useCallback((value: string) => {
    const cleanValue = String(value || '').replace(/[^0-9A-Za-z_-]/g, '');
    setAplusMatchNumber(cleanValue);
    setSelectedAplusMatch(null);
  }, []);

  const onLoadAplusMatch = useCallback(async () => {
    if (aplusLoadingMatch) {
      return;
    }

    if (!selectedAplusTournament) {
      setAplusLiveStatus('Bạn chưa chọn giải. Bấm Tải giải trước.');
      return;
    }

    const normalizedMatchNumber = normalizeAplusMatchNumberInput(aplusMatchNumber);

    if (!normalizedMatchNumber) {
      setAplusLiveStatus('Bạn chưa nhập số trận.');
      return;
    }

    // Nhập 7, 07, t7... thì khi bấm Lấy trận luôn chuẩn hóa thành T7 ngay trên ô nhập,
    // kể cả sau đó trận báo lỗi/khoá/kết thúc.
    if (normalizedMatchNumber !== aplusMatchNumber) {
      setAplusMatchNumber(normalizedMatchNumber);
    }

    const modeError = getAplusTournamentModeError(selectedAplusTournament, category);
    if (modeError) {
      setSelectedAplusMatch(null);
      setAplusLiveStatus(modeError);
      Alert.alert('Sai chế độ', modeError);
      return;
    }

    setAplusLoadingMatch(true);
    setAplusLiveStatus('Đang lấy thông tin trận...');

    try {
      const match = await fetchAplusMatchByNumber(
        selectedAplusTournament,
        normalizedMatchNumber,
      );
      const lockedMatch = await lockAplusLiveScoreMatch(match);
      setSelectedAplusMatch(lockedMatch);
      setPlayerSettings(prev =>
        applyAplusMatchToPlayerSettings(
          prev,
          lockedMatch,
          category,
          (gameSettingsMode as any)?.extraTimeTurns,
        ),
      );

      setAplusLiveStatus(
        `Đã lấy trận ${lockedMatch.matchNumber}: ${lockedMatch.player1?.name || 'Người chơi 1'} vs ${lockedMatch.player2?.name || 'Người chơi 2'}. Đã cập nhật tên/quốc gia trong mục Người chơi.`,
      );
    } catch (error: any) {
      const message = error?.message || 'Không lấy được thông tin trận.';
      const blockAlert = getAplusMatchBlockAlert(error);
      setSelectedAplusMatch(null);
      setAplusLiveStatus(message);

      if (blockAlert) {
        Alert.alert(blockAlert.title, blockAlert.message);
      }
    } finally {
      setAplusLoadingMatch(false);
    }
  }, [
    aplusLoadingMatch,
    selectedAplusTournament,
    aplusMatchNumber,
    category,
    gameSettingsMode,
  ]);

  const onCancel = useCallback(() => {
    clearSettingsDraft();
    props.goBack();
  }, [props]);

  const onStart = useCallback(async () => {
    if (youtubeLiveLoading) {
      return;
    }

    const startPlayerSettings = playerSettings;
    const playingPlayers = startPlayerSettings.playingPlayers.map(player => ({
      ...player,
      totalPoint: player.totalPoint,
      setScore: Number((player as any)?.setScore || 0),
      frameScore: Number((player as any)?.frameScore || 0),
      snooker: {
        ...(player as any)?.snooker,
        setScore: Number((player as any)?.snooker?.setScore ?? (player as any)?.setScore ?? 0),
      },
      violate: 0,
      scoredBalls: [],
      proMode: {
        ...(player.proMode || {}),
        ...gameSettingsMode,
        highestRate: 0,
        secondHighestRate: 0,
        average: 0,
        currentPoint: 0,
      },
    }));

    const nextGameSettings = {
      category,
      mode: gameSettingsMode,
      players: {...startPlayerSettings, playingPlayers},
      livestreamPlatform: 'device',
      saveToDeviceWhileStreaming: false,
      liveVisibility: 'private',
      liveAccountName: '',
      liveAccountId: '',
      liveSetupToken: '',
      tournamentName: selectedTournamentName || undefined,
      selectedTournamentName: selectedTournamentName || undefined,
      aplusLiveScore: undefined,
      gameplaySessionKey: `local:${Date.now()}`,
      forceNewGameplaySession: true,
    };

    clearSettingsDraft();
    dispatch(gameActions.updateGameSettings(nextGameSettings));

    props.navigate(screens.gamePlay, {
      gameSettings: nextGameSettings,
      livestreamPlatform: 'device',
      saveToDeviceWhileStreaming: false,
      liveVisibility: 'private',
      tournamentName: selectedTournamentName || undefined,
      selectedTournamentName: selectedTournamentName || undefined,
      aplusLiveScore: undefined,
      gameplaySessionKey: nextGameSettings.gameplaySessionKey,
      forceNewGameplaySession: true,
    });

    _resetData();
  }, [
    youtubeLiveLoading,
    dispatch,
    _resetData,
    props,
    category,
    gameSettingsMode,
    playerSettings,
    selectedTournamentName,
  ]);

  const onSelectCategory = useCallback(
  (selectedCategory: BilliardCategory) => {
    const isCaromLike = isCaromLikeGame(selectedCategory);
    const isSnooker = isSnookerGame(selectedCategory);
    const isThreeCushion = isCarom3CGame(selectedCategory);
    const defaultGoal = isSnooker
      ? 3
      : isPoolGame(selectedCategory)
      ? 9
      : isThreeCushion
      ? 30
      : selectedCategory === 'libre'
      ? 40
      : 40;

    setCategory(selectedCategory);

    setPlayerSettings({
      playerNumber: 2,
      playingPlayers: DEFAULT_PLAYERS().map((item, index) => ({
        ...item,
        color: isPoolGame(selectedCategory) || isSnooker
          ? PLAYER_COLOR[1]
          : (PLAYER_COLOR as any)[index],
      })),
      goal: {
        ...playerSettings.goal,
        goal: defaultGoal,
        snookerSetTarget: isSnooker
          ? Number((playerSettings.goal as any)?.snookerSetTarget || 75)
          : (playerSettings.goal as any)?.snookerSetTarget,
        framePointTarget: isSnooker
          ? Number(
              (playerSettings.goal as any)?.framePointTarget ||
                (playerSettings.goal as any)?.snookerSetTarget ||
                75,
            )
          : (playerSettings.goal as any)?.framePointTarget,
      },
    });

    if (isCaromLike) {
      setGameSettingsMode({
        mode: 'pro',
        extraTimeTurns: 2,
        countdownTime: 40,
        warmUpTime: 300,
      });
    } else if (isPoolGame(selectedCategory) || isSnooker) {
      setGameSettingsMode({
        mode: 'pro',
        extraTimeTurns: 1,
        countdownTime: 35,
        warmUpTime: 300,
        extraTimeBonus: GAME_EXTRA_TIME_BONUS.s0,
      });
    } else {
      setGameSettingsMode({
        mode: 'fast',
      });
    }
  },
  [playerSettings],
);

const onSelectGameMode = useCallback(
  (selectedGameMode: GameMode) => {
    const isCaromLike = isCaromLikeGame(category);
    const isSnooker = isSnookerGame(category);

    switch (selectedGameMode) {
      case 'fast':
        setGameSettingsMode({mode: selectedGameMode});
        break;

      case 'quick_match':
        setGameSettingsMode({
          mode: selectedGameMode,
          warmUpTime: 300,
        });
        break;

      case 'time':
        setGameSettingsMode({
          mode: selectedGameMode,
          extraTimeTurns: isCaromLike ? 2 : 1,
          countdownTime: isCaromLike ? 40 : 35,
        });
        break;

      case 'eliminate':
        setGameSettingsMode({
          mode: selectedGameMode,
          countdownTime: isCaromLike ? 40 : 35,
        });
        break;

      case 'pro':
        setGameSettingsMode({
          mode: selectedGameMode,
          extraTimeTurns: isCaromLike ? 2 : 1,
          countdownTime: isCaromLike ? 40 : 35,
          warmUpTime: 300,
          extraTimeBonus: isPoolGame(category) || isSnooker
            ? GAME_EXTRA_TIME_BONUS.s0
            : undefined,
        });
        break;

      default:
        break;
    }
  },
  [category],
);

  const onSelectExtraTimeBonus = useCallback(
    (extraTimeBonus: GameExtraTimeBonus) => {
      setGameSettingsMode({
        ...gameSettingsMode,
        extraTimeBonus,
      } as GameSettingsMode);
    },
    [gameSettingsMode],
  );

  const onSelectExtraTimeTurns = useCallback(
    (extraTimeTurns: GameExtraTimeTurns) => {
      setGameSettingsMode({
        ...gameSettingsMode,
        extraTimeTurns,
      } as GameSettingsMode);
    },
    [gameSettingsMode],
  );

  const onSelectCountdown = useCallback(
    (countdownTime: GameCountDownTime) => {
      setGameSettingsMode({
        ...gameSettingsMode,
        countdownTime,
      } as GameSettingsMode);
    },
    [gameSettingsMode],
  );

  const onSelectWarmUp = useCallback(
    (warmUpTime: GameWarmUpTime) => {
      setGameSettingsMode({
        ...gameSettingsMode,
        warmUpTime,
      } as GameSettingsMode);
    },
    [gameSettingsMode],
  );

  const onSelectPlayerNumber = useCallback(
    (playerNumber: PlayerNumber) => {
      const nextPlayerNumber = clampPlayerNumber(playerNumber);
      setPlayerSettings({
        ...playerSettings,
        playerNumber: nextPlayerNumber,
        playingPlayers: buildPlayersForCount(
          nextPlayerNumber,
          category,
          playerSettings.playingPlayers,
        ),
      } as PlayerSettings);
    },
    [playerSettings, category],
  );

  const onChangePlayerPoint = useCallback(
    (addedPoint: number, index: number, stepIndex: number) => {
      if (stepIndex === 4) {
        return;
      }

      setPlayerSettings(
        prev =>
          ({
            ...prev,
            playingPlayers: prev.playingPlayers.map((player, playerIndex) => {
              if (index === playerIndex) {
                return {...player, totalPoint: player.totalPoint + addedPoint};
              }

              return player;
            }),
          } as PlayerSettings),
      );
    },
    [],
  );

  const onChangePlayerName = useCallback((newName: string, index: number) => {
    setPlayerSettings(
      prev =>
        ({
          ...prev,
          playingPlayers: prev.playingPlayers.map((player, playerIndex) => {
            if (index === playerIndex) {
              return {...player, name: newName};
            }

            return player;
          }),
        } as PlayerSettings),
    );
  }, []);


  const onSelectPlayerCountry = useCallback((country: CountryItem, index: number) => {
    setPlayerSettings(
      prev =>
        ({
          ...prev,
          playingPlayers: prev.playingPlayers.map((player, playerIndex) => {
            if (index === playerIndex) {
              return {
                ...player,
                countryCode: country.code,
                countryName: country.name,
                flag: country.code,
              };
            }

            return player;
          }),
        } as PlayerSettings),
    );
  }, []);

  const onSelectPlayerGoal = useCallback(
    (addedPoint: number, index: number) => {
      if (index === 2) {
        return;
      }

      setPlayerSettings(
        prev =>
          ({
            ...prev,
            goal: {
              ...prev.goal,
              goal: prev.goal.goal + addedPoint,
            },
          } as PlayerSettings),
      );
    },
    [],
  );


  const onSelectSnookerSetTarget = useCallback(
    (addedPoint: number, index: number) => {
      if (index === 5) {
        return;
      }

      setPlayerSettings(
        prev => {
          const currentTarget = Math.max(
            1,
            Math.round(
              Number(
                (prev.goal as any)?.snookerSetTarget ??
                  (prev.goal as any)?.framePointTarget ??
                  75,
              ),
            ),
          );
          const nextTarget = Math.max(1, currentTarget + Number(addedPoint || 0));

          return {
            ...prev,
            goal: {
              ...prev.goal,
              snookerSetTarget: nextTarget,
              framePointTarget: nextTarget,
            },
          } as PlayerSettings;
        },
      );
    },
    [],
  );

  return useMemo(() => {
    const gameMode = gameSettingsMode.mode;
    return {
      category,
      gameMode,
      gameSettingsMode,
      playerSettings,
      extraTimeTurnsEnabled: gameMode === 'time' || gameMode === 'pro',
      countdownEnabled: gameMode !== 'fast' && gameMode !== 'quick_match',
      warmUpEnabled: gameMode === 'pro' || gameMode === 'quick_match',
      extraTimeBonusEnabled: gameMode === 'pro' && isPoolGame(category),
      onSelectExtraTimeBonus,
      onSelectCategory,
      onSelectGameMode,
      onSelectExtraTimeTurns,
      onSelectCountdown,
      onSelectWarmUp,
      onSelectPlayerNumber,
      onSelectPlayerGoal,
      onSelectSnookerSetTarget,
      onChangePlayerName,
      onChangePlayerPoint,
      onSelectPlayerCountry,
      aplusTournaments,
      selectedAplusTournament,
      selectedAplusMatch,
      aplusMatchNumber,
      aplusLiveStatus,
      aplusLoadingTournaments,
      aplusLoadingMatch,
      youtubeLiveLoading,
      youtubeLiveLoadingMessage,
      onLoadAplusTournaments,
      onPrevAplusTournament,
      onNextAplusTournament,
      onChangeAplusMatchNumber,
      onLoadAplusMatch,
      onStart,
      onCancel,
    };
  }, [
    category,
    gameSettingsMode,
    playerSettings,
    onSelectCategory,
    onSelectGameMode,
    onSelectExtraTimeBonus,
    onSelectExtraTimeTurns,
    onSelectCountdown,
    onSelectWarmUp,
    onSelectPlayerNumber,
    onSelectPlayerGoal,
    onSelectSnookerSetTarget,
    onChangePlayerName,
    onChangePlayerPoint,
    onSelectPlayerCountry,
    aplusTournaments,
    selectedAplusTournament,
    selectedAplusMatch,
    aplusMatchNumber,
    aplusLiveStatus,
    aplusLoadingTournaments,
    aplusLoadingMatch,
    youtubeLiveLoading,
    youtubeLiveLoadingMessage,
    onLoadAplusTournaments,
    onPrevAplusTournament,
    onNextAplusTournament,
    onChangeAplusMatchNumber,
    onLoadAplusMatch,
    onStart,
    onCancel,
  ]);
};

export default GameSettingsViewModel;
