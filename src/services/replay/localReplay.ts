import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules, Platform} from 'react-native';
import {keys} from 'configuration/keys';
import RNFS from 'react-native-fs';
import {recordDebugLog} from 'utils/recordDebugLogger';
import {FFmpegKit, ReturnCode} from 'ffmpeg-kit-react-native';

export const DEFAULT_RECORDING_SEGMENT_DURATION_MINUTES = 5;
export const DEFAULT_MAX_REPLAY_STORAGE_GB = 30;
export const RECORDING_SEGMENT_DURATION_MS =
  DEFAULT_RECORDING_SEGMENT_DURATION_MINUTES * 60 * 1000;
export const MAX_REPLAY_STORAGE_BYTES =
  DEFAULT_MAX_REPLAY_STORAGE_GB * 1024 * 1024 * 1024;
export const REPLAY_WINDOW_SEGMENTS = 3;
// VAR/replay is a rolling 30-second window.  RTSP normally contributes one
// long segment and the player seeks to its tail; USB contributes short chunks,
// so selection must be duration-based instead of a fixed count.
export const REPLAY_WINDOW_SECONDS = 30;
export const REPLAY_ROLLING_KEEP_SECONDS = 60;

export const normalizeReplayStorageGb = (value?: number | string | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_MAX_REPLAY_STORAGE_GB;
  }

  return Math.max(1, Math.min(500, Math.round(numeric)));
};

export const normalizeRecordingSegmentDurationMinutes = (
  value?: number | string | null,
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_RECORDING_SEGMENT_DURATION_MINUTES;
  }

  return Math.max(1, Math.min(60, Math.round(numeric)));
};

export const getConfiguredReplayStorageBytes = async () => {
  try {
    const raw = await AsyncStorage.getItem(keys.VIDEO_STORAGE_MAX_GB);
    return normalizeReplayStorageGb(raw) * 1024 * 1024 * 1024;
  } catch (error) {
    recordDebugLog('ReplayStorage', 'load-storage-quota-failed', {error: String((error as any)?.message || error)});
    return MAX_REPLAY_STORAGE_BYTES;
  }
};

export const getConfiguredRecordingSegmentDurationMs = async () => {
  try {
    const raw = await AsyncStorage.getItem(keys.VIDEO_SEGMENT_DURATION_MINUTES);
    return normalizeRecordingSegmentDurationMinutes(raw) * 60 * 1000;
  } catch (error) {
    recordDebugLog('ReplayStorage', 'load-segment-duration-failed', {error: String((error as any)?.message || error)});
    return RECORDING_SEGMENT_DURATION_MS;
  }
};

// IMPORTANT (Android scoped storage):
// With targetSdkVersion >= 29 the WRITE_EXTERNAL_STORAGE permission is a no-op,
// so the app can only freely create files inside its own app-specific external
// directory (ExternalDirectoryPath = /Android/data/<pkg>/files). Trying to mkdir
// the *public* Download/ folder throws on Android 11+, and because ensureReplayRoot()
// runs before every register/export/list call, that throw used to wipe out the whole
// replay + history flow (empty ReplayBuffer, empty history) on every camera backend.
//
// We therefore keep the working ReplayBuffer and app history index inside
// app-specific external storage, which works on every Android version without any
// storage permission.  At match finish, full_match.mp4 is also exported to public
// Movies/Aplus Score via the native MediaStore bridge so File Manager can see it.
const INTERNAL_MEDIA_ROOT = `${RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath}/Aplus Billiards`;
const PUBLIC_RELATIVE_MEDIA_ROOT = 'Aplus Score';
const PUBLIC_HISTORY_RELATIVE_ROOT = `${PUBLIC_RELATIVE_MEDIA_ROOT}/History`;
const PUBLIC_MEDIA_ROOT = `${RNFS.ExternalStorageDirectoryPath || RNFS.DownloadDirectoryPath || RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath}/Movies/${PUBLIC_RELATIVE_MEDIA_ROOT}`;
export const REPLAY_ROOT = `${INTERNAL_MEDIA_ROOT}/ReplayBuffer`;
export const ARCHIVE_ROOT = `${INTERNAL_MEDIA_ROOT}/Saved Videos`;
const LEGACY_REPLAY_ROOT = RNFS.DownloadDirectoryPath;
const VIDEO_EXTENSIONS = ['.mov', '.mp4', '.m4v', '.ts'];
const PLAYBACK_PREFERRED_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.ts'];
const PLAYBACK_SMOOTH_SUFFIX = '_playback.mp4';
const LOW_QUALITY_TRANSCODE_MARKERS = [
  'playback_mpeg4_720',
  'playback_mpeg4_1080',
  '_playback_mpeg4',
  'transcoded',
];
const HIGH_QUALITY_PLAYBACK_MARKERS = [
  'original_quality',
  'playback_hq',
  '_playback_hq',
];
const SMOOTH_TRANSCODE_TIMEOUT_MS = 16000;
const MATCH_MANIFEST_FILE_NAME = 'match.json';
const REPLAY_LATEST_FILE_NAME = 'replay_latest.mp4';
const FULL_MATCH_FILE_NAME = 'full_match.mp4';
const MIN_VALID_VIDEO_BYTES = 128 * 1024;
const MIN_USB_SHORT_REPLAY_BYTES = 8 * 1024;
const FILE_SETTLE_MS = 1500;
const PRUNE_MIN_INTERVAL_MS = 15 * 60 * 1000;
const SESSION_STALE_MS = 24 * 60 * 60 * 1000;

let lastPruneRunAt = 0;

export type ReplaySegmentEntry = {
  segmentIndex: number;
  /** Preferred playback file. For RTSP this should be the remuxed .mp4 when available. */
  fileName: string;
  /** Original recorder output kept for fallback/debug, e.g. .ts from RTSP. */
  sourceFileName?: string;
  /** Playback-friendly normalized file, usually .mp4. */
  playbackFileName?: string;
  /** Lower-resolution H264 file used first for smooth Android replay/history. */
  smoothPlaybackFileName?: string;
  createdAt: number;
  sizeBytes: number;
  sourceSizeBytes?: number;
  playbackSizeBytes?: number;
  smoothPlaybackSizeBytes?: number;
  containerType?: string;
  playbackContainerType?: string;
  smoothPlaybackContainerType?: string;
  segmentStartedAt?: number;
  /** Phone local timestamp captured when recording started, used for real-clock seek labels. */
  startedAtPhoneTime?: number;
  durationSeconds?: number;
  source?: 'rtsp' | 'usb' | 'builtInCamera' | string;
};

export type ReplayMatchManifest = {
  version: number;
  webcamFolderName: string;
  matchSessionId?: string;
  keepFullMatch: boolean;
  createdAt: number;
  updatedAt: number;
  exportedAt?: number;
  mode?: string;
  playerNames?: string[];
  finalScore?: number[];
  finalPlayers?: any[];
  finalTurn?: number;
  winnerName?: string;
  endedAt?: number;
  durationMs?: number;
  publicVideoUri?: string;
  publicVideoPath?: string;
  publicRelativePath?: string;
  publicVideoSizeBytes?: number;
  segments: ReplaySegmentEntry[];
};

export type ExportMatchToArchiveOptions = {
  finalScore?: number[];
  winnerName?: string;
  finalPlayers?: any[];
  finalTurn?: number;
  endedAt?: number;
  durationMs?: number;
  /** Extra finalized files to promote when the replay manifest scan misses the active source. */
  fallbackVideoPaths?: Array<string | undefined | null>;
  /** Source that owns the fallback files. Keeps RTSP/USB archive metadata separated. */
  source?: 'rtsp' | 'usb' | 'builtInCamera' | string;
};

export type ReplayPlaybackMode = 'var' | 'history';

export type ListPlayableFilesOptions = {
  mode?: ReplayPlaybackMode;
  source?: 'rtsp' | 'usb' | 'builtInCamera' | string;
};

export type HistoryMatchEntry = {
  webcamFolderName: string;
  folderName: string;
  folderPath: string;
  manifest?: ReplayMatchManifest;
  files: RNFS.ReadDirItem[];
  createdAt: number;
  updatedAt: number;
  totalSizeBytes: number;
};

export type RegisterReplaySegmentOptions = {
  keepFullMatch?: boolean;
  matchSessionId?: string;
  segmentIndex?: number;
  mode?: string;
  playerNames?: string[];
  segmentStartedAt?: number;
  durationSeconds?: number;
  source?: 'rtsp' | 'usb' | 'builtInCamera' | string;
};

export const buildReplayFolderPath = (webcamFolderName: string) =>
  `${REPLAY_ROOT}/${webcamFolderName}`;
export const buildArchiveFolderPath = (webcamFolderName: string) =>
  `${ARCHIVE_ROOT}/${webcamFolderName}`;
const buildReplaySourceFolderPath = (webcamFolderName: string, source?: string | null) => {
  const cleanSource = normalizeSegmentSourcePrefix(source);
  return cleanSource
    ? `${buildReplayFolderPath(webcamFolderName)}/${cleanSource}`
    : buildReplayFolderPath(webcamFolderName);
};
const buildArchiveSourceFolderPath = (webcamFolderName: string, source?: string | null) => {
  const cleanSource = normalizeSegmentSourcePrefix(source);
  return cleanSource
    ? `${buildArchiveFolderPath(webcamFolderName)}/${cleanSource}`
    : buildArchiveFolderPath(webcamFolderName);
};
export const buildLegacyReplayFolderPath = (webcamFolderName: string) =>
  `${LEGACY_REPLAY_ROOT}/${webcamFolderName}`;
const buildManifestPath = (folderPath: string) =>
  `${folderPath}/${MATCH_MANIFEST_FILE_NAME}`;

const basename = (filePath: string) =>
  filePath.split('/').pop() || `segment_${Date.now()}.mp4`;

const isVideoFile = (name: string) => {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
};

const isDerivedSingleOutputFileName = (nameOrPath?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase();
  return lower.endsWith('/replay_latest.mp4') ||
    lower.endsWith('/full_match.mp4') ||
    lower === 'replay_latest.mp4' ||
    lower === 'full_match.mp4';
};

const getFileExtension = (nameOrPath?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase();
  const match = lower.match(/\.([a-z0-9]+)$/);
  return match?.[1] ? `.${match[1]}` : '';
};

const isLowQualityTranscodeName = (nameOrPath?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase();
  return LOW_QUALITY_TRANSCODE_MARKERS.some(marker => lower.includes(marker));
};

const isHighQualityPlaybackName = (nameOrPath?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase();
  return HIGH_QUALITY_PLAYBACK_MARKERS.some(marker => lower.includes(marker));
};

const isPlainRemuxMp4Name = (nameOrPath?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase();
  const ext = getFileExtension(lower);
  return ext === '.mp4' && !lower.includes('_playback') && !lower.includes('_var_');
};

const getPlaybackSourceLabel = (nameOrPath?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase();
  if (lower.includes('_var_')) {
    return 'var-clip';
  }
  if (isPlainRemuxMp4Name(lower)) {
    return 'original-quality-mp4';
  }
  if (isHighQualityPlaybackName(lower)) {
    return 'playback-hq';
  }
  if (isLowQualityTranscodeName(lower)) {
    return 'transcoded-low-fallback';
  }
  if (getVideoContainerType(lower) === 'ts') {
    return 'original-ts';
  }
  return getVideoContainerType(lower);
};

const getPlaybackPriority = (
  nameOrPath?: string | null,
  mode: ReplayPlaybackMode = 'history',
) => {
  const lower = String(nameOrPath || '').toLowerCase();
  const ext = getFileExtension(lower);

  // The old selector preferred any `_playback*` file, so Android history ended
  // up playing `part_0001_playback_mpeg4_1080.mp4` even when the original-quality
  // remux existed. That file is a compatibility fallback only and can look much
  // blurrier than the live RTSP feed. Keep the selection quality-first.
  if (mode === 'var' && (lower.endsWith('/replay_latest.mp4') || lower === 'replay_latest.mp4' || lower.includes('_var_last30'))) {
    return 0;
  }

  if (mode === 'history' && (lower.endsWith('/full_match.mp4') || lower === 'full_match.mp4')) {
    return 0;
  }

  if (isPlainRemuxMp4Name(lower)) {
    return mode === 'var' ? 1 : 0;
  }

  if (ext === '.ts') {
    return mode === 'var' ? 2 : 1;
  }

  if (isHighQualityPlaybackName(lower)) {
    return mode === 'var' ? 3 : 2;
  }

  if (isLowQualityTranscodeName(lower) || lower.includes('_playback')) {
    return 9;
  }

  const index = PLAYBACK_PREFERRED_EXTENSIONS.indexOf(ext);
  return index >= 0 ? 4 + index : PLAYBACK_PREFERRED_EXTENSIONS.length + 10;
};

const getVideoContainerType = (nameOrPath?: string | null) =>
  (getFileExtension(nameOrPath).replace('.', '') || 'unknown').toLowerCase();

const safeMtime = (item: RNFS.ReadDirItem) =>
  item.mtime ? new Date(item.mtime).getTime() : 0;

const hasValidVideoShape = (item: RNFS.ReadDirItem, sourceFromFolder?: string) => {
  if (!item.isFile() || !isVideoFile(item.name)) {
    return false;
  }

  const size = Number(item.size || 0);
  const name = String(item.name || '').toLowerCase();
  const path = String(item.path || '').toLowerCase();
  const source = String(sourceFromFolder || '').toLowerCase();
  const isUsbClip =
    source === 'usb' ||
    name.startsWith('usb_') ||
    name.startsWith('uvc_raw_') ||
    path.includes('/usb/');
  return size >= (isUsbClip ? MIN_USB_SHORT_REPLAY_BYTES : MIN_VALID_VIDEO_BYTES);
};

const isSettlingVideo = (item: RNFS.ReadDirItem) => {
  const mtime = safeMtime(item);
  return mtime > 0 && Date.now() - mtime < FILE_SETTLE_MS;
};

const sortByAge = (a: RNFS.ReadDirItem, b: RNFS.ReadDirItem) => {
  const mtimeDiff = safeMtime(a) - safeMtime(b);
  if (mtimeDiff !== 0) {
    return mtimeDiff;
  }
  return a.name.localeCompare(b.name, undefined, {numeric: true});
};

const readVideoFiles = async (folderPath: string) => {
  const output: RNFS.ReadDirItem[] = [];
  const visit = async (currentFolder: string, sourceFromFolder?: string) => {
    const items = await RNFS.readDir(currentFolder);

    for (const item of items) {
      if (item.isDirectory()) {
        const folderSource = ['rtsp', 'usb', 'builtInCamera'].includes(item.name)
          ? item.name
          : sourceFromFolder;
        await visit(item.path, folderSource);
        continue;
      }

      if (hasValidVideoShape(item, sourceFromFolder)) {
        output.push(Object.assign(item, {source: (item as any)?.source || sourceFromFolder}));
      }
    }
  };

  await visit(folderPath);
  return output.sort(sortByAge);
};

const ensureDir = async (folderPath: string) => {
  try {
    if (!(await RNFS.exists(folderPath))) {
      await RNFS.mkdir(folderPath);
    }
  } catch (error) {
    // Never let a single mkdir failure (e.g. a restricted public path on a
    // scoped-storage device) abort the whole register/export/list pipeline.
    // The caller checks RNFS.exists again before it relies on the folder.
    recordDebugLog('ReplayStorage', 'ensureDir-failed-non-fatal', {folderPath, error: String((error as any)?.message || error)});
  }
  return folderPath;
};

const normalizeManifest = (
  webcamFolderName: string,
  current?: Partial<ReplayMatchManifest> | null,
): ReplayMatchManifest => {
  const createdAt = Number(current?.createdAt || Date.now());
  const segments = Array.isArray(current?.segments)
    ? current!.segments
        .map(segment => {
          const rawSegment = segment as any;
          const fileName = String(rawSegment.fileName || rawSegment.playbackFileName || rawSegment.sourceFileName || '');
          const sourceFileName = rawSegment.sourceFileName
            ? String(rawSegment.sourceFileName)
            : undefined;
          const playbackFileName = rawSegment.playbackFileName
            ? String(rawSegment.playbackFileName)
            : fileName.toLowerCase().endsWith('.mp4')
              ? fileName
              : undefined;
          const smoothPlaybackFileName = rawSegment.smoothPlaybackFileName
            ? String(rawSegment.smoothPlaybackFileName)
            : fileName.toLowerCase().endsWith(PLAYBACK_SMOOTH_SUFFIX)
              ? fileName
              : undefined;

          return {
            segmentIndex: Number(rawSegment.segmentIndex || 0),
            fileName,
            sourceFileName,
            playbackFileName,
            smoothPlaybackFileName,
            createdAt: Number(rawSegment.createdAt || createdAt),
            sizeBytes: Number(rawSegment.sizeBytes || rawSegment.playbackSizeBytes || rawSegment.sourceSizeBytes || 0),
            sourceSizeBytes:
              Number(rawSegment.sourceSizeBytes || 0) || undefined,
            playbackSizeBytes:
              Number(rawSegment.playbackSizeBytes || 0) || undefined,
            smoothPlaybackSizeBytes:
              Number(rawSegment.smoothPlaybackSizeBytes || 0) || undefined,
            containerType: rawSegment.containerType
              ? String(rawSegment.containerType)
              : undefined,
            playbackContainerType: rawSegment.playbackContainerType
              ? String(rawSegment.playbackContainerType)
              : undefined,
            smoothPlaybackContainerType: rawSegment.smoothPlaybackContainerType
              ? String(rawSegment.smoothPlaybackContainerType)
              : undefined,
            segmentStartedAt:
              Number(rawSegment.segmentStartedAt || rawSegment.startedAtPhoneTime || 0) || undefined,
            startedAtPhoneTime:
              Number(rawSegment.startedAtPhoneTime || rawSegment.segmentStartedAt || 0) || undefined,
            durationSeconds:
              Number(rawSegment.durationSeconds || 0) || undefined,
            source: rawSegment.source ? String(rawSegment.source) : undefined,
          };
        })
        .filter(segment => segment.fileName.length > 0)
        .sort((a, b) => a.segmentIndex - b.segmentIndex)
    : [];

  return {
    version: 1,
    webcamFolderName,
    matchSessionId: current?.matchSessionId,
    keepFullMatch: Boolean(current?.keepFullMatch),
    createdAt,
    updatedAt: Date.now(),
    exportedAt: current?.exportedAt,
    mode: current?.mode,
    playerNames: Array.isArray(current?.playerNames)
      ? current?.playerNames
      : undefined,
    finalScore: Array.isArray(current?.finalScore)
      ? current?.finalScore
      : undefined,
    finalPlayers: Array.isArray(current?.finalPlayers)
      ? current?.finalPlayers
      : undefined,
    finalTurn: Number((current as any)?.finalTurn || 0) || undefined,
    winnerName: (current as any)?.winnerName,
    endedAt: Number((current as any)?.endedAt || 0) || undefined,
    durationMs: Number((current as any)?.durationMs || 0) || undefined,
    publicVideoUri: (current as any)?.publicVideoUri ? String((current as any).publicVideoUri) : undefined,
    publicVideoPath: (current as any)?.publicVideoPath ? String((current as any).publicVideoPath) : undefined,
    publicRelativePath: (current as any)?.publicRelativePath ? String((current as any).publicRelativePath) : undefined,
    publicVideoSizeBytes: Number((current as any)?.publicVideoSizeBytes || 0) || undefined,
    segments,
  };
};

const readManifestFromFolder = async (
  folderPath: string,
  webcamFolderName: string,
) => {
  const manifestPath = buildManifestPath(folderPath);
  if (!(await RNFS.exists(manifestPath))) {
    return normalizeManifest(webcamFolderName, null);
  }

  try {
    const raw = await RNFS.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeManifest(webcamFolderName, parsed);
  } catch (error) {
    console.log('[Replay] failed to read match manifest:', error);
    return normalizeManifest(webcamFolderName, null);
  }
};

const writeManifestToFolder = async (
  folderPath: string,
  manifest: ReplayMatchManifest,
) => {
  const normalized = normalizeManifest(manifest.webcamFolderName, manifest);
  await RNFS.writeFile(
    buildManifestPath(folderPath),
    JSON.stringify(normalized, null, 2),
    'utf8',
  );
  return normalized;
};

export const extractReplaySegmentIndex = (filePathOrName?: string | null) => {
  const target = String(filePathOrName || '');
  const match = target.match(/part_(\d+)/i);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, parsed - 1);
};

const enrichReplayFileMetadata = (
  file: RNFS.ReadDirItem,
  manifest?: ReplayMatchManifest,
) => {
  const segmentIndex = extractReplaySegmentIndex(file.name);
  const segment = manifest?.segments?.find(entry => {
    if (
      entry.fileName === file.name ||
      entry.playbackFileName === file.name ||
      entry.smoothPlaybackFileName === file.name ||
      entry.sourceFileName === file.name
    ) {
      return true;
    }

    return (
      typeof segmentIndex === 'number' &&
      Number(entry.segmentIndex) === segmentIndex
    );
  });
  const fileMtime = safeMtime(file) || Date.now();
  const segmentStartedAt = Number(
    segment?.startedAtPhoneTime || segment?.segmentStartedAt || segment?.createdAt || fileMtime,
  );
  const createdAtMs =
    Number.isFinite(segmentStartedAt) && segmentStartedAt > 0
      ? segmentStartedAt
      : fileMtime;

  return Object.assign(file, {
    segmentIndex: typeof segmentIndex === 'number' ? segmentIndex : undefined,
    segmentStartedAt: createdAtMs,
    createdAtMs,
    durationSeconds: Number(segment?.durationSeconds || 0) || undefined,
    manifestWebcamFolderName: manifest?.webcamFolderName,
    source: segment?.source,
    sourceFileName: segment?.sourceFileName,
    playbackFileName: segment?.playbackFileName,
    smoothPlaybackFileName: segment?.smoothPlaybackFileName,
    containerType: segment?.containerType,
    playbackContainerType: segment?.playbackContainerType,
    smoothPlaybackContainerType: segment?.smoothPlaybackContainerType,
  });
};

const normalizeSegmentSourcePrefix = (source?: string | null) => {
  const clean = String(source || '').trim();
  if (clean === 'rtsp' || clean === 'usb' || clean === 'builtInCamera') {
    return clean;
  }
  return '';
};

const buildSegmentFileName = (segmentIndex: number, segmentPath: string, source?: string | null) => {
  const ext = basename(segmentPath).split('.').pop()?.toLowerCase();
  const resolvedExt = ext && VIDEO_EXTENSIONS.includes(`.${ext}`) ? ext : 'mp4';
  const sourcePrefix = normalizeSegmentSourcePrefix(source);
  const baseName = `part_${String(segmentIndex + 1).padStart(4, '0')}.${resolvedExt}`;
  return sourcePrefix ? `${sourcePrefix}_${baseName}` : baseName;
};

const cleanupFolderBrokenFiles = async (folderPath?: string) => {
  if (!folderPath || !(await RNFS.exists(folderPath))) {
    return;
  }

  const items = await RNFS.readDir(folderPath);

  for (const item of items) {
    const lowerName = item.name.toLowerCase();

    const isBrokenVideo =
      item.isFile() &&
      isVideoFile(item.name) &&
      !isSettlingVideo(item) &&
      !hasValidVideoShape(item);

    const isTmpLike =
      item.isFile() &&
      (lowerName.endsWith('.tmp') ||
        lowerName.endsWith('.part') ||
        lowerName.includes('temp'));

    if (!isBrokenVideo && !isTmpLike) {
      continue;
    }

    try {
      await RNFS.unlink(item.path);
      console.log('[Replay] removed broken file:', item.path);
    } catch (error) {
      console.log('[Replay] failed to remove broken file:', item.path, error);
    }
  }
};

export const ensureReplayRoot = async () => {
  await ensureDir(INTERNAL_MEDIA_ROOT);
  await ensureDir(REPLAY_ROOT);
  await ensureDir(ARCHIVE_ROOT);
  // Public Movies/Aplus Score is created by the native MediaStore exporter on
  // Android 10+. RNFS mkdir is kept as a best-effort fallback for older devices.
  try {
    await ensureDir(PUBLIC_MEDIA_ROOT);
  } catch {}
  recordDebugLog('VideoStorage', 'publicRoot=Movies/Aplus Score', {
    internalRoot: INTERNAL_MEDIA_ROOT,
    replayRoot: REPLAY_ROOT,
    archiveRoot: ARCHIVE_ROOT,
    publicRoot: PUBLIC_MEDIA_ROOT,
    publicRelativeRoot: PUBLIC_RELATIVE_MEDIA_ROOT,
  });
};

export const ensureReplayFolder = async (webcamFolderName: string) => {
  await ensureReplayRoot();
  return ensureDir(buildReplayFolderPath(webcamFolderName));
};

export const ensureArchiveFolder = async (webcamFolderName: string) => {
  await ensureReplayRoot();
  return ensureDir(buildArchiveFolderPath(webcamFolderName));
};

export const resolveReplayFolder = async (webcamFolderName: string) => {
  const currentPath = buildReplayFolderPath(webcamFolderName);
  if (await RNFS.exists(currentPath)) {
    return currentPath;
  }

  const archivePath = buildArchiveFolderPath(webcamFolderName);
  if (await RNFS.exists(archivePath)) {
    return archivePath;
  }

  const legacyPath = buildLegacyReplayFolderPath(webcamFolderName);
  if (await RNFS.exists(legacyPath)) {
    return legacyPath;
  }

  return undefined;
};

export const readReplayMatchManifest = async (webcamFolderName: string) => {
  const folderPath =
    (await resolveReplayFolder(webcamFolderName)) ||
    (await ensureReplayFolder(webcamFolderName));

  return readManifestFromFolder(folderPath, webcamFolderName);
};

export const getNextReplaySegmentIndex = async (webcamFolderName: string) => {
  const manifest = await readReplayMatchManifest(webcamFolderName);
  const lastSegment = manifest.segments[manifest.segments.length - 1];
  return lastSegment ? lastSegment.segmentIndex + 1 : 0;
};

export const cleanupBrokenReplayFiles = async (webcamFolderName: string) => {
  const replayFolderPath = buildReplayFolderPath(webcamFolderName);
  const archiveFolderPath = buildArchiveFolderPath(webcamFolderName);

  await cleanupFolderBrokenFiles(replayFolderPath);
  await cleanupFolderBrokenFiles(archiveFolderPath);
};

const pruneReplayWindowForFolder = async (
  webcamFolderName: string,
  keepFullMatch: boolean,
  source?: string | null,
) => {
  const folderPath = buildReplayFolderPath(webcamFolderName);
  if (!(await RNFS.exists(folderPath))) {
    return;
  }

  const cleanSource = normalizeSegmentSourcePrefix(source);
  const manifest = await readManifestFromFolder(folderPath, webcamFolderName);
  const sourceSegments = manifest.segments
    .filter(segment => !cleanSource || segment.source === cleanSource || String(segment.fileName || '').startsWith(`${cleanSource}_`))
    .sort((a, b) => a.segmentIndex - b.segmentIndex);

  const keepSeconds = REPLAY_ROLLING_KEEP_SECONDS;
  const staleSegments: ReplaySegmentEntry[] = [];
  let accumulatedSeconds = 0;

  for (let index = sourceSegments.length - 1; index >= 0; index -= 1) {
    const segment = sourceSegments[index];
    const durationSeconds = Math.max(1, Number(segment.durationSeconds || 0) || (segment.source === 'usb' ? 5 : REPLAY_WINDOW_SECONDS));
    accumulatedSeconds += durationSeconds;
    if (accumulatedSeconds > keepSeconds && index > 0) {
      staleSegments.unshift(...sourceSegments.slice(0, index + 1));
      break;
    }
  }

  if (!staleSegments.length) {
    recordDebugLog('ReplayRollingBuffer', 'activeChunks=' + String(sourceSegments.length), {
      source: cleanSource || source,
      webcamFolderName,
      windowMs: REPLAY_WINDOW_SECONDS * 1000,
      maxKeepMs: keepSeconds * 1000,
      activeChunks: sourceSegments.length,
      keepFullMatch,
      reason: 'nothing-to-prune',
    });
    return;
  }

  const staleNames = new Set<string>();
  for (const segment of staleSegments) {
    [
      segment.fileName,
      segment.sourceFileName,
      segment.playbackFileName,
      segment.smoothPlaybackFileName,
    ]
      .filter(Boolean)
      .forEach(name => staleNames.add(String(name)));
  }

  for (const name of staleNames) {
    const candidates = [
      `${folderPath}/${name}`,
      cleanSource ? `${buildReplaySourceFolderPath(webcamFolderName, cleanSource)}/${name}` : '',
    ].filter(Boolean);
    for (const path of candidates) {
      try {
        if (await RNFS.exists(path)) {
          await RNFS.unlink(path);
          console.log('[Replay] dropped old rolling replay clip:', path);
        }
      } catch (error) {
        console.log('[Replay] failed to drop old rolling replay clip:', path, error);
      }
    }
  }

  const staleSegmentIndexes = new Set(staleSegments.map(segment => segment.segmentIndex));
  manifest.segments = manifest.segments.filter(segment =>
    !staleSegmentIndexes.has(segment.segmentIndex),
  );
  await writeManifestToFolder(folderPath, manifest);

  recordDebugLog('ReplayRollingBuffer', 'source=' + String(cleanSource || source || 'unknown') + ' windowMs=30000 maxKeepMs=60000', {
    source: cleanSource || source,
    webcamFolderName,
    windowMs: REPLAY_WINDOW_SECONDS * 1000,
    maxKeepMs: keepSeconds * 1000,
    deletedChunks: staleSegments.length,
    activeChunks: manifest.segments.filter(segment => !cleanSource || segment.source === cleanSource || String(segment.fileName || '').startsWith(`${cleanSource}_`)).length,
    keepFullMatch,
  });
};

const mirrorReplaySegmentToArchive = async (
  webcamFolderName: string,
  registeredReplayPath: string,
  segment: ReplaySegmentEntry,
  source?: string | null,
) => {
  const cleanSource = normalizeSegmentSourcePrefix(source || segment.source);
  const archiveFolderPath = await ensureArchiveFolder(webcamFolderName);
  const archiveSourceFolderPath = await buildSourceOutputFolder(webcamFolderName, cleanSource, 'history');
  const archiveFileName = segment.fileName;
  const archivePath = `${archiveSourceFolderPath}/${archiveFileName}`;
  const inputInfo = await statUsableVideoPath(registeredReplayPath, cleanSource);

  if (!inputInfo.usable) {
    recordDebugLog('FullMatchRecorder', 'mirror-segment-skipped-unusable', {
      source: cleanSource || source,
      webcamFolderName,
      segmentIndex: segment.segmentIndex,
      path: registeredReplayPath,
      exists: inputInfo.exists,
      size: inputInfo.size,
    });
    return undefined;
  }

  try {
    if (!(await RNFS.exists(archivePath))) {
      await RNFS.copyFile(registeredReplayPath, archivePath);
    }
    const archiveSize = await getExistingFileSize(archivePath);
    if (archiveSize < getMinValidBytesForSourceOrName(archivePath, cleanSource)) {
      return undefined;
    }

    const archiveManifest = await readManifestFromFolder(archiveFolderPath, webcamFolderName);
    const nextSegments = archiveManifest.segments
      .filter(item => !(item.segmentIndex === segment.segmentIndex && (item.source || cleanSource) === cleanSource))
      .concat({
        ...segment,
        fileName: archiveFileName,
        sourceFileName: archiveFileName,
        playbackFileName: archiveFileName.toLowerCase().endsWith('.mp4') ? archiveFileName : segment.playbackFileName,
        sizeBytes: archiveSize,
        sourceSizeBytes: archiveSize,
        playbackSizeBytes: archiveFileName.toLowerCase().endsWith('.mp4') ? archiveSize : segment.playbackSizeBytes,
        source: cleanSource || segment.source,
      })
      .sort((a, b) => a.segmentIndex - b.segmentIndex);

    await writeManifestToFolder(archiveFolderPath, {
      ...archiveManifest,
      keepFullMatch: true,
      matchSessionId: archiveManifest.matchSessionId,
      segments: nextSegments,
    });

    recordDebugLog('FullMatchRecorder', 'start source=' + String(cleanSource || source || 'unknown') + ' path=' + archivePath, {
      source: cleanSource || source,
      webcamFolderName,
      segmentIndex: segment.segmentIndex,
      path: archivePath,
      size: archiveSize,
      reason: 'segment-mirrored-to-history-source-folder',
    });
    recordDebugLog('FullMatchRecorder', 'recordingSize=' + String(archiveSize), {
      source: cleanSource || source,
      webcamFolderName,
      path: archivePath,
      size: archiveSize,
    });
    return archivePath;
  } catch (error) {
    recordDebugLog('FullMatchRecorder', 'mirror-segment-failed', {
      source: cleanSource || source,
      webcamFolderName,
      segmentIndex: segment.segmentIndex,
      from: registeredReplayPath,
      to: archivePath,
      error: String((error as any)?.message || error),
    });
    return undefined;
  }
};

const listAllVideoFilesFromFolder = async (
  folderPath?: string,
  webcamFolderName?: string,
) => {
  if (!folderPath || !(await RNFS.exists(folderPath))) {
    return [] as RNFS.ReadDirItem[];
  }

  const files = await readVideoFiles(folderPath);
  const settled = files.filter(item => !isSettlingVideo(item));
  const sourceFiles = settled.length > 0 ? settled : files;
  let manifest: ReplayMatchManifest | undefined;

  if (webcamFolderName) {
    try {
      manifest = await readManifestFromFolder(folderPath, webcamFolderName);
    } catch (error) {
      console.log('[Replay] failed to enrich file metadata:', error);
    }
  }

  return sourceFiles.map(file => {
    const enriched = enrichReplayFileMetadata(file, manifest);
    return Object.assign(enriched, {source: (enriched as any)?.source || (file as any)?.source});
  });
};

const getTimelineSortIndex = (file: RNFS.ReadDirItem) => {
  const enrichedIndex = Number((file as any)?.segmentIndex);
  if (Number.isFinite(enrichedIndex) && enrichedIndex >= 0) {
    return enrichedIndex;
  }

  const parsedIndex = extractReplaySegmentIndex(file.name);
  return typeof parsedIndex === 'number' ? parsedIndex : Number.MAX_SAFE_INTEGER;
};

const sortPlaybackFilesForTimeline = (
  a: RNFS.ReadDirItem,
  b: RNFS.ReadDirItem,
) => {
  const indexDiff = getTimelineSortIndex(a) - getTimelineSortIndex(b);
  if (indexDiff !== 0) {
    return indexDiff;
  }

  const startedDiff =
    Number((a as any)?.segmentStartedAt || (a as any)?.createdAtMs || 0) -
    Number((b as any)?.segmentStartedAt || (b as any)?.createdAtMs || 0);
  if (startedDiff !== 0) {
    return startedDiff;
  }

  return a.name.localeCompare(b.name, undefined, {numeric: true});
};

const isUsbReplayFile = (file: RNFS.ReadDirItem) => {
  const name = String(file?.name || '').toLowerCase();
  const source = String((file as any)?.source || '').toLowerCase();
  return source === 'usb' || name.startsWith('usb_') || name.startsWith('uvc_raw_');
};

const getReplayFileName = (file: RNFS.ReadDirItem) =>
  String(file?.name || file?.path?.split('/')?.pop?.() || '');

const filterFilesBySource = (files: RNFS.ReadDirItem[], source?: string | null) => {
  const cleanSource = String(source || '').trim();
  if (!cleanSource || !(cleanSource === 'rtsp' || cleanSource === 'usb' || cleanSource === 'builtInCamera')) {
    return files;
  }

  const prefix = `${cleanSource}_`;
  const knownSourcePrefixPattern = /^(rtsp|usb|builtInCamera)_/;
  const exactSourceFiles = files.filter(file => {
    const name = getReplayFileName(file);
    const sourceFromManifestOrFolder = String((file as any)?.source || '').trim();
    const pathHasSourceFolder = String(file?.path || '').includes(`/${cleanSource}/`);
    return sourceFromManifestOrFolder === cleanSource || pathHasSourceFolder || name.startsWith(prefix);
  });
  if (exactSourceFiles.length > 0) {
    return exactSourceFiles;
  }

  // Existing RTSP files from older builds may have neutral names.  Never use
  // neutral files for USB because that can make USB read RTSP history/replay.
  return cleanSource === 'rtsp'
    ? files.filter(file => !knownSourcePrefixPattern.test(getReplayFileName(file)) && !String(file?.path || '').includes('/usb/'))
    : [];
};

const getReplayWindowDurationSeconds = (file: RNFS.ReadDirItem) => {
  const explicitDuration = Number((file as any)?.durationSeconds || 0);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }

  // USB chunks are intentionally short.  When metadata is not available yet,
  // assume one short chunk so a 22s USB match selects all recent chunks instead
  // of only the latest 4-5s file.  Long RTSP/built-in files are handled by the
  // playback tail seek.
  return isUsbReplayFile(file) ? 5 : REPLAY_WINDOW_SECONDS;
};

const selectReplayWindowFiles = (files: RNFS.ReadDirItem[]) => {
  const sorted = [...files].sort(sortPlaybackFilesForTimeline);
  if (sorted.length <= 1) {
    return sorted;
  }

  const selected: RNFS.ReadDirItem[] = [];
  let accumulatedSeconds = 0;

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const file = sorted[index];
    selected.unshift(file);
    accumulatedSeconds += getReplayWindowDurationSeconds(file);
    if (accumulatedSeconds >= REPLAY_WINDOW_SECONDS) {
      break;
    }
  }

  recordDebugLog('ReplayBuffer', 'rolling-window-selected', {
    windowSeconds: REPLAY_WINDOW_SECONDS,
    totalFiles: sorted.length,
    selectedCount: selected.length,
    accumulatedSeconds,
    selectedSegments: selected.map(file => ({
      name: file.name,
      path: file.path,
      durationSeconds: Number((file as any)?.durationSeconds || 0) || undefined,
      estimatedDurationSeconds: getReplayWindowDurationSeconds(file),
      source: isUsbReplayFile(file) ? 'usb' : 'default',
    })),
  });

  return selected;
};

const pickPlaybackPreferredFiles = (
  files: RNFS.ReadDirItem[],
  mode: ReplayPlaybackMode = 'history',
) => {
  const bySegment = new Map<string, RNFS.ReadDirItem>();

  for (const file of files) {
    const segmentIndex = extractReplaySegmentIndex(file.name);
    const enrichedIndex = Number((file as any)?.segmentIndex);
    const key = Number.isFinite(enrichedIndex) && enrichedIndex >= 0
      ? `segment-${enrichedIndex}`
      : typeof segmentIndex === 'number'
        ? `segment-${segmentIndex}`
        : file.name;
    const current = bySegment.get(key);

    if (
      !current ||
      getPlaybackPriority(file.name, mode) < getPlaybackPriority(current.name, mode) ||
      (getPlaybackPriority(file.name, mode) === getPlaybackPriority(current.name, mode) &&
        Number(file.size || 0) > Number(current.size || 0))
    ) {
      bySegment.set(key, file);
    }
  }

  return Array.from(bySegment.values()).sort(sortPlaybackFilesForTimeline);
};

const listVideoFilesFromFolder = async (
  folderPath?: string,
  webcamFolderName?: string,
  mode: ReplayPlaybackMode = 'history',
) => {
  const selectedFiles = pickPlaybackPreferredFiles(
    await listAllVideoFilesFromFolder(folderPath, webcamFolderName),
    mode,
  );

  selectedFiles.forEach(file => {
    recordDebugLog('ReplayNormalize', 'selected-playback-file', {
      webcamFolderName,
      folderPath,
      path: file.path,
      name: file.name,
      size: Number(file.size || 0),
      source: getPlaybackSourceLabel(file.name),
      mode,
      reason: mode === 'history'
        ? 'history-full-prefers-original-quality-before-low-transcode'
        : 'var-prefers-original-quality-with-30s-window-before-low-transcode',
      priority: getPlaybackPriority(file.name, mode),
      container: getVideoContainerType(file.name),
    });
  });

  return selectedFiles;
};

export const listReplayFiles = async (
  webcamFolderName: string,
  options: ListPlayableFilesOptions = {},
) => {
  const folderPath = buildReplayFolderPath(webcamFolderName);
  const files = filterFilesBySource(
    await listVideoFilesFromFolder(
      folderPath,
      webcamFolderName,
      options.mode || 'var',
    ),
    options.source,
  );

  if ((options.mode || 'var') !== 'var') {
    return files;
  }

  return selectReplayWindowFiles(files);
};

export const listArchiveFiles = async (
  webcamFolderName: string,
  options: ListPlayableFilesOptions = {},
) => {
  const folderPath = buildArchiveFolderPath(webcamFolderName);
  const sourceFiles = filterFilesBySource(
    await listVideoFilesFromFolder(
      folderPath,
      webcamFolderName,
      options.mode || 'history',
    ),
    options.source,
  );
  const fullMatchFiles = sourceFiles.filter(file =>
    String(file?.path || file?.name || '').toLowerCase().endsWith('/full_match.mp4') ||
    String(file?.name || '').toLowerCase() === 'full_match.mp4',
  );
  if (fullMatchFiles.length > 0) {
    const selected = fullMatchFiles.sort(sortPlaybackFilesForTimeline).slice(-1);
    recordDebugLog('HistoryPlayer', 'playingSingleFile=true', {
      webcamFolderName,
      source: options.source,
      path: selected[0]?.path,
      size: Number(selected[0]?.size || 0),
    });
    return selected;
  }
  return sourceFiles;
};

export const listPlayableFiles = async (
  webcamFolderName: string,
  preferArchive = false,
  options: ListPlayableFilesOptions = {},
) => {
  const mode = options.mode || (preferArchive ? 'history' : 'var');

  if (preferArchive) {
    const archiveFiles = await listArchiveFiles(webcamFolderName, {
      mode: 'history',
      source: options.source,
    });
    if (archiveFiles.length > 0) {
      return archiveFiles;
    }
  }

  return listReplayFiles(webcamFolderName, {mode, source: options.source});
};

export const waitForReplayFiles = async (
  webcamFolderName: string,
  minCount = 1,
  timeoutMs = 8000,
  options: ListPlayableFilesOptions = {},
) => {
  const startedAt = Date.now();
  let files = await listReplayFiles(webcamFolderName, {
    mode: 'var',
    source: options.source,
  });

  while (files.length < minCount && Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 400));
    files = await listReplayFiles(webcamFolderName, {
      mode: 'var',
      source: options.source,
    });
  }

  return files;
};

const quoteFfmpegArg = (value: string) =>
  `"${String(value).replace(/\\/g, '/').replace(/"/g, '\\"')}"`;

const readFfmpegDebug = async (session: any) => {
  try {
    const returnCode = await session?.getReturnCode?.();
    const logs = await session?.getAllLogsAsString?.();
    const failStackTrace = await session?.getFailStackTrace?.();
    return {
      returnCode: returnCode?.getValue?.(),
      success: ReturnCode.isSuccess(returnCode),
      logs: logs ? String(logs).slice(-5000) : '',
      failStackTrace: failStackTrace ? String(failStackTrace).slice(0, 3000) : '',
    };
  } catch (error) {
    return {debugReadError: String((error as Error)?.message || error)};
  }
};

const getExistingFileSize = async (path?: string | null) => {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) {
    return 0;
  }
  try {
    if (!(await RNFS.exists(cleanPath))) {
      return 0;
    }
    const stat = await RNFS.stat(cleanPath);
    return Number(stat.size || 0);
  } catch {
    return 0;
  }
};


const getMinValidBytesForSourceOrName = (nameOrPath?: string | null, source?: string | null) => {
  const lower = String(nameOrPath || '').toLowerCase().split('/').pop() || '';
  return source === 'usb' || lower.startsWith('usb_') || lower.startsWith('uvc_raw_')
    ? MIN_USB_SHORT_REPLAY_BYTES
    : MIN_VALID_VIDEO_BYTES;
};

const statUsableVideoPath = async (path?: string | null, source?: string | null) => {
  const cleanPath = String(path || '').trim();
  if (!cleanPath || !isVideoFile(basename(cleanPath))) {
    return {path: cleanPath, exists: false, size: 0, usable: false, minValidBytes: getMinValidBytesForSourceOrName(cleanPath, source)};
  }

  const minValidBytes = getMinValidBytesForSourceOrName(cleanPath, source);
  try {
    const exists = await RNFS.exists(cleanPath);
    if (!exists) {
      return {path: cleanPath, exists: false, size: 0, usable: false, minValidBytes};
    }
    const stat = await RNFS.stat(cleanPath);
    const size = Number(stat.size || 0);
    return {path: cleanPath, exists: true, size, usable: size >= minValidBytes, minValidBytes};
  } catch (error) {
    return {path: cleanPath, exists: false, size: 0, usable: false, minValidBytes, error: String((error as any)?.message || error)};
  }
};

const normalizeArchiveTargetName = (nameOrPath: string, source?: string | null) => {
  const rawName = basename(nameOrPath).replace(/[^a-zA-Z0-9._-]/g, '_') || `segment_${Date.now()}.mp4`;
  const sourcePrefix = normalizeSegmentSourcePrefix(source);
  if (!sourcePrefix || rawName.startsWith(`${sourcePrefix}_`)) {
    return rawName;
  }
  if (/^(rtsp|usb|builtInCamera)_/.test(rawName)) {
    return rawName;
  }
  return `${sourcePrefix}_${rawName}`;
};

const collectUsableFallbackVideos = async (
  paths?: Array<string | undefined | null>,
  source?: string | null,
) => {
  const uniquePaths = Array.from(new Set((paths || []).map(path => String(path || '').trim()).filter(Boolean)));
  const usable: Array<{name: string; path: string; size: number; source?: string}> = [];

  for (const path of uniquePaths) {
    const info = await statUsableVideoPath(path, source);
    recordDebugLog(source === 'usb' ? 'USBHistory' : 'HistoryFinalize', info.usable ? 'fallback-video-usable' : 'fallback-video-rejected', {
      source,
      path,
      exists: info.exists,
      size: info.size,
      minValidBytes: info.minValidBytes,
      error: (info as any).error,
    });

    if (!info.usable) {
      continue;
    }

    usable.push({
      name: normalizeArchiveTargetName(path, source),
      path,
      size: info.size,
      source: source || undefined,
    });
  }

  return usable;
};

const runFfmpegNormalizeCommand = async (command: string) => {
  const session = await FFmpegKit.execute(command);
  return readFfmpegDebug(session);
};

const normalizeReplaySegmentForPlayback = async (inputPath: string, outputPath: string) => {
  if (Platform.OS !== 'android') {
    return undefined;
  }

  const inputSize = await getExistingFileSize(inputPath);
  recordDebugLog('ReplayNormalize', 'start', {
    input: inputPath,
    output: outputPath,
    inputSize,
    inputContainer: getVideoContainerType(inputPath),
  });

  if (inputSize < MIN_VALID_VIDEO_BYTES) {
    recordDebugLog('ReplayNormalize', 'fallback-to-ts', {
      reason: 'input-too-small',
      input: inputPath,
      inputSize,
    });
    return undefined;
  }

  const remuxCommands = [
    {
      profile: 'hevc-hvc1-faststart',
      command: [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'warning',
        '-fflags',
        '+genpts',
        '-i',
        quoteFfmpegArg(inputPath),
        '-map',
        '0:v:0',
        '-c:v',
        'copy',
        '-tag:v',
        'hvc1',
        '-an',
        '-movflags',
        '+faststart',
        '-y',
        quoteFfmpegArg(outputPath),
      ].join(' '),
    },
    {
      profile: 'copy-faststart',
      command: [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'warning',
        '-fflags',
        '+genpts',
        '-i',
        quoteFfmpegArg(inputPath),
        '-map',
        '0:v:0',
        '-c:v',
        'copy',
        '-an',
        '-movflags',
        '+faststart',
        '-y',
        quoteFfmpegArg(outputPath),
      ].join(' '),
    },
  ];

  for (const candidate of remuxCommands) {
    try {
      if (await RNFS.exists(outputPath)) {
        await RNFS.unlink(outputPath);
      }
      const startedAt = Date.now();
      const debug = await runFfmpegNormalizeCommand(candidate.command);
      const outputSize = await getExistingFileSize(outputPath);
      const elapsedMs = Date.now() - startedAt;

      if ((debug as any)?.success && outputSize >= MIN_VALID_VIDEO_BYTES) {
        recordDebugLog('ReplayNormalize', 'remux-success', {
          profile: candidate.profile,
          input: inputPath,
          output: outputPath,
          inputSize,
          outputSize,
          elapsedMs,
          debug,
        });
        return outputPath;
      }

      recordDebugLog('ReplayNormalize', 'remux-failed', {
        profile: candidate.profile,
        input: inputPath,
        output: outputPath,
        inputSize,
        outputSize,
        elapsedMs,
        reason: 'ffmpeg-failed-or-output-too-small',
        debug,
      });
    } catch (error) {
      recordDebugLog('ReplayNormalize', 'remux-failed', {
        profile: candidate.profile,
        input: inputPath,
        output: outputPath,
        reason: 'exception',
        error: String((error as Error)?.message || error),
      });
    }
  }

  recordDebugLog('ReplayNormalize', 'fallback-to-ts', {
    reason: 'remux-failed',
    input: inputPath,
    inputSize,
  });
  return undefined;
};


const buildSourceOutputFolder = async (
  webcamFolderName: string,
  source: string | undefined | null,
  mode: 'replay' | 'history',
) => {
  const rootFolder = mode === 'history'
    ? await ensureArchiveFolder(webcamFolderName)
    : await ensureReplayFolder(webcamFolderName);
  const cleanSource = normalizeSegmentSourcePrefix(source);
  if (!cleanSource) {
    return rootFolder;
  }
  const sourceFolder = mode === 'history'
    ? buildArchiveSourceFolderPath(webcamFolderName, cleanSource)
    : buildReplaySourceFolderPath(webcamFolderName, cleanSource);
  await ensureDir(sourceFolder);
  return sourceFolder;
};

const escapeConcatListPath = (filePath: string) =>
  String(filePath || '').replace(/'/g, "'\\''");

const makeReadDirItemForPath = async (
  filePath: string,
  source?: string | null,
  durationSeconds?: number,
) => {
  const stat = await RNFS.stat(filePath);
  const now = Date.now();
  const mtime = stat.mtime ? new Date(stat.mtime as any) : new Date(now);
  return {
    name: basename(filePath),
    path: filePath,
    size: Number(stat.size || 0),
    mtime,
    ctime: stat.ctime ? new Date(stat.ctime as any) : mtime,
    isFile: () => true,
    isDirectory: () => false,
    createdAtMs: mtime.getTime(),
    segmentStartedAt: mtime.getTime(),
    segmentIndex: 0,
    durationSeconds: Number(durationSeconds || 0) || undefined,
    source: source || undefined,
  } as RNFS.ReadDirItem;
};

const runConcatCommand = async (
  inputPaths: string[],
  outputPath: string,
  options: {
    tag: string;
    source?: string | null;
    webcamFolderName: string;
    mode: 'replay' | 'history';
    timeoutReason?: string;
    durationMs?: number;
  },
) => {
  if (Platform.OS !== 'android' || inputPaths.length === 0) {
    return undefined;
  }

  const outputFolder = outputPath.slice(0, Math.max(0, outputPath.lastIndexOf('/')));
  await ensureDir(outputFolder);
  const listPath = `${outputPath}.concat.txt`;
  const uniqueInputs = inputPaths.map(path => String(path || '').trim()).filter(Boolean);
  const existingInputs: string[] = [];

  for (const path of uniqueInputs) {
    const size = await getExistingFileSize(path);
    if (size >= getMinValidBytesForSourceOrName(path, options.source)) {
      existingInputs.push(path);
    }
  }

  recordDebugLog(options.tag, options.mode === 'history' ? 'concatFullMatchStart' : 'concatStart', {
    source: options.source,
    webcamFolderName: options.webcamFolderName,
    inputCount: existingInputs.length,
    inputPaths: existingInputs,
    outputPath,
    durationMs: options.durationMs,
  });

  if (!existingInputs.length) {
    recordDebugLog(options.tag, 'concat-failed', {
      reason: 'no-valid-inputs',
      source: options.source,
      webcamFolderName: options.webcamFolderName,
      inputPaths,
      outputPath,
    });
    return undefined;
  }

  try {
    if (await RNFS.exists(outputPath)) {
      await RNFS.unlink(outputPath);
    }
  } catch {}

  if (existingInputs.length === 1) {
    const inputPath = existingInputs[0];
    const trimArgs = options.mode === 'replay'
      ? ['-sseof', '-30', '-i', quoteFfmpegArg(inputPath), '-t', '30']
      : ['-i', quoteFfmpegArg(inputPath)];
    const singleCommand = [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'warning',
      '-fflags',
      '+genpts',
      ...trimArgs,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-an',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      '-y',
      quoteFfmpegArg(outputPath),
    ].join(' ');

    const debug = await runFfmpegNormalizeCommand(singleCommand);
    let outputSize = await getExistingFileSize(outputPath);
    if (!(debug as any)?.success || outputSize < getMinValidBytesForSourceOrName(outputPath, options.source)) {
      recordDebugLog(options.tag, 'single-remux-failed-copy-fallback', {
        source: options.source,
        inputPath,
        outputPath,
        outputSize,
        debug,
      });
      try {
        if (await RNFS.exists(outputPath)) {
          await RNFS.unlink(outputPath);
        }
        await RNFS.copyFile(inputPath, outputPath);
        outputSize = await getExistingFileSize(outputPath);
      } catch (copyError) {
        recordDebugLog(options.tag, 'single-copy-fallback-failed', {
          source: options.source,
          inputPath,
          outputPath,
          error: String((copyError as Error)?.message || copyError),
        });
      }
    }

    if (outputSize >= getMinValidBytesForSourceOrName(outputPath, options.source)) {
      return outputPath;
    }
    return undefined;
  }

  await RNFS.writeFile(
    listPath,
    existingInputs.map(path => `file '${escapeConcatListPath(path)}'`).join('\n'),
    'utf8',
  );

  const copyCommand = [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'warning',
    '-fflags',
    '+genpts',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    quoteFfmpegArg(listPath),
    '-map',
    '0:v:0',
    '-c:v',
    'copy',
    '-an',
    '-avoid_negative_ts',
    'make_zero',
    '-movflags',
    '+faststart',
    '-y',
    quoteFfmpegArg(outputPath),
  ].join(' ');

  let debug = await runFfmpegNormalizeCommand(copyCommand);
  let outputSize = await getExistingFileSize(outputPath);

  if (!(debug as any)?.success || outputSize < getMinValidBytesForSourceOrName(outputPath, options.source)) {
    recordDebugLog(options.tag, 'concat-copy-failed-transcode-fallback', {
      source: options.source,
      webcamFolderName: options.webcamFolderName,
      outputPath,
      outputSize,
      debug,
    });
    try {
      if (await RNFS.exists(outputPath)) {
        await RNFS.unlink(outputPath);
      }
    } catch {}
    const transcodeCommand = [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'warning',
      '-fflags',
      '+genpts',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      quoteFfmpegArg(listPath),
      '-map',
      '0:v:0',
      '-vf',
      quoteFfmpegArg('fps=20,scale=-2:720'),
      '-c:v',
      'mpeg4',
      '-q:v',
      '2',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      '-y',
      quoteFfmpegArg(outputPath),
    ].join(' ');
    debug = await runFfmpegNormalizeCommand(transcodeCommand);
    outputSize = await getExistingFileSize(outputPath);
  }

  try {
    if (await RNFS.exists(listPath)) {
      await RNFS.unlink(listPath);
    }
  } catch {}

  if ((debug as any)?.success && outputSize >= getMinValidBytesForSourceOrName(outputPath, options.source)) {
    return outputPath;
  }

  recordDebugLog(options.tag, 'concat-failed', {
    source: options.source,
    webcamFolderName: options.webcamFolderName,
    outputPath,
    outputSize,
    debug,
  });
  return undefined;
};

export const buildReplayLatestFile = async (
  webcamFolderName: string,
  files: RNFS.ReadDirItem[],
  options: {source?: 'rtsp' | 'usb' | 'builtInCamera' | string; requestedWindowMs?: number} = {},
) => {
  const source = options.source;
  const buildStartedAt = Date.now();
  const selectedFiles = selectReplayWindowFiles(
    filterFilesBySource(files, source).filter(file => !isDerivedSingleOutputFileName(file.path || file.name)),
  );
  const outputFolder = await buildSourceOutputFolder(webcamFolderName, source, 'replay');
  const outputPath = `${outputFolder}/${REPLAY_LATEST_FILE_NAME}`;
  const requestedWindowMs = Number(options.requestedWindowMs || REPLAY_WINDOW_SECONDS * 1000);
  const selectedDurationMs = Math.min(
    requestedWindowMs,
    Math.round(selectedFiles.reduce((sum, file) => sum + getReplayWindowDurationSeconds(file), 0) * 1000),
  );

  recordDebugLog('ReplayBuild', 'source=' + String(source || 'unknown'), {
    source,
    webcamFolderName,
    windowMs: requestedWindowMs,
  });
  recordDebugLog('ReplayBuild', 'windowMs=' + String(requestedWindowMs), {source, webcamFolderName});
  recordDebugLog('ReplayBuild', 'matchElapsedMs=' + String(selectedDurationMs), {source, webcamFolderName, matchElapsedMs: selectedDurationMs});
  recordDebugLog('ReplayBuild', 'targetWindowMs=' + String(requestedWindowMs), {source, webcamFolderName, targetWindowMs: requestedWindowMs});
  recordDebugLog('ReplayBuild', 'selectedDurationMs=' + String(selectedDurationMs), {source, webcamFolderName, selectedDurationMs});
  recordDebugLog('ReplayBuild', 'selectedChunkCount=' + String(selectedFiles.length), {source, webcamFolderName, selectedChunkCount: selectedFiles.length});
  recordDebugLog('ReplayBuild', 'selectedSegments=' + JSON.stringify(selectedFiles.map(file => file.path)), {
    source,
    webcamFolderName,
    selectedSegments: selectedFiles.map(file => ({path: file.path, name: file.name, size: Number(file.size || 0), durationSeconds: Number((file as any)?.durationSeconds || 0) || undefined})),
  });

  const output = await runConcatCommand(
    selectedFiles.map(file => file.path),
    outputPath,
    {
      tag: 'ReplayBuild',
      source,
      webcamFolderName,
      mode: 'replay',
      durationMs: selectedDurationMs,
    },
  );
  const outputSize = await getExistingFileSize(output);
  const outputExists = Boolean(output && outputSize >= getMinValidBytesForSourceOrName(output, source));

  recordDebugLog('ReplayBuild', 'outputPath=' + String(output || outputPath), {source, webcamFolderName, outputPath: output || outputPath});
  recordDebugLog('ReplayBuild', 'outputExists=' + String(outputExists), {source, webcamFolderName, outputExists, outputSize});
  recordDebugLog('ReplayBuild', 'outputSize=' + String(outputSize), {source, webcamFolderName, outputSize});
  recordDebugLog('ReplayBuild', 'outputDurationMs=' + String(selectedDurationMs), {source, webcamFolderName, outputDurationMs: selectedDurationMs});
  recordDebugLog('ReplayBuild', 'buildTimeMs=' + String(Date.now() - buildStartedAt), {source, webcamFolderName, buildTimeMs: Date.now() - buildStartedAt});
  recordDebugLog('ReplayBuild', 'playingSingleFile=true', {source, webcamFolderName, outputPath: output || outputPath, outputExists, outputSize});

  if (!outputExists || !output) {
    return undefined;
  }

  return makeReadDirItemForPath(output, source, selectedDurationMs > 0 ? selectedDurationMs / 1000 : undefined);
};


export const buildReplayLatestForSource = async (
  webcamFolderName: string,
  options: {source?: 'rtsp' | 'usb' | 'builtInCamera' | string; requestedWindowMs?: number} = {},
) => {
  const folderPath = buildReplayFolderPath(webcamFolderName);
  const source = options.source;
  const cleanSource = normalizeSegmentSourcePrefix(source);
  const sourceFolderPath = cleanSource ? buildReplaySourceFolderPath(webcamFolderName, cleanSource) : '';

  const sourceFolderFiles = sourceFolderPath && (await RNFS.exists(sourceFolderPath))
    ? await listAllVideoFilesFromFolder(sourceFolderPath, webcamFolderName)
    : [];
  const rootFiles = folderPath && (await RNFS.exists(folderPath))
    ? (await readVideoFiles(folderPath)).filter(file => {
        const path = String(file?.path || '');
        // Do not recursively include generated source-folder outputs here; they
        // are already in sourceFolderFiles.  This keeps a long 1h match replay
        // build bounded by the rolling buffer rather than the whole tree.
        return !cleanSource || !path.includes(`/${cleanSource}/`);
      })
    : [];
  const allFiles = [...rootFiles, ...sourceFolderFiles];
  const rawSourceFiles = filterFilesBySource(allFiles, source)
    .filter(file => !isDerivedSingleOutputFileName(file.path || file.name));

  recordDebugLog('ReplayRollingBuffer', 'source=' + String(source || 'unknown') + ' windowMs=30000 maxKeepMs=60000', {
    source,
    webcamFolderName,
    activeChunks: rawSourceFiles.length,
    windowMs: REPLAY_WINDOW_SECONDS * 1000,
    maxKeepMs: REPLAY_ROLLING_KEEP_SECONDS * 1000,
  });
  recordDebugLog('ReplayBuild', 'source-folder-scan', {
    source,
    webcamFolderName,
    sourceFolderPath,
    rootFileCount: rootFiles.length,
    sourceFolderFileCount: sourceFolderFiles.length,
    rawSourceFileCount: rawSourceFiles.length,
    rawSourceFiles: rawSourceFiles.map(file => ({
      path: file.path,
      name: file.name,
      size: Number(file.size || 0),
      durationSeconds: Number((file as any)?.durationSeconds || 0) || undefined,
      source: (file as any)?.source,
    })),
  });

  return buildReplayLatestFile(webcamFolderName, rawSourceFiles, options);
};

const buildHistoryFullMatchFile = async (
  webcamFolderName: string,
  files: Array<{name: string; path: string; size: number; source?: string}>,
  options: ExportMatchToArchiveOptions,
) => {
  const source = options.source;
  const buildStartedAt = Date.now();
  const outputFolder = await buildSourceOutputFolder(webcamFolderName, source, 'history');
  const outputPath = `${outputFolder}/${FULL_MATCH_FILE_NAME}`;
  const rawSegmentFiles = files
    .filter(file => {
      const path = String(file?.path || '').trim();
      if (!path) {
        return false;
      }
      return !isDerivedSingleOutputFileName(path);
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
  const derivedReplayFallbackFiles = files
    .filter(file => {
      const path = String(file?.path || '').trim().toLowerCase();
      const name = String(file?.name || '').trim().toLowerCase();
      if (!path) {
        return false;
      }
      // Never use an existing full_match.mp4 as the input to rebuild itself, but
      // allow replay_latest.mp4 as a last-resort source so a USB match that has
      // playable replay cannot end with an empty History list.
      return name === REPLAY_LATEST_FILE_NAME || path.endsWith('/replay_latest.mp4');
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
  const sortedFiles = rawSegmentFiles.length > 0
    ? rawSegmentFiles
    : derivedReplayFallbackFiles;

  if (!rawSegmentFiles.length && derivedReplayFallbackFiles.length > 0) {
    recordDebugLog('HistoryBuild', 'using-replay-latest-fallback-for-full-match', {
      source,
      webcamFolderName,
      fallbackFiles: derivedReplayFallbackFiles.map(file => ({path: file.path, size: file.size})),
    });
  }

  recordDebugLog('HistoryBuild', 'source=' + String(source || 'unknown'), {source, webcamFolderName});
  recordDebugLog('HistoryBuild', 'segmentCount=' + String(sortedFiles.length), {
    source,
    webcamFolderName,
    segmentCount: sortedFiles.length,
    segments: sortedFiles.map(file => ({path: file.path, size: file.size})),
  });

  const output = await runConcatCommand(
    sortedFiles.map(file => file.path),
    outputPath,
    {
      tag: 'HistoryBuild',
      source,
      webcamFolderName,
      mode: 'history',
      durationMs: options.durationMs,
    },
  );
  const outputSize = await getExistingFileSize(output);
  const exists = Boolean(output && outputSize >= getMinValidBytesForSourceOrName(output, source));

  recordDebugLog('HistoryBuild', 'fullMatchPath=' + String(output || outputPath), {source, webcamFolderName, fullMatchPath: output || outputPath});
  recordDebugLog('HistoryBuild', 'fullMatchExists=' + String(exists), {source, webcamFolderName, fullMatchExists: exists});
  recordDebugLog('HistoryBuild', 'fullMatchSize=' + String(outputSize), {source, webcamFolderName, fullMatchSize: outputSize});
  recordDebugLog('HistoryBuild', 'fullMatchDurationMs=' + String(Number(options.durationMs || 0)), {source, webcamFolderName, fullMatchDurationMs: Number(options.durationMs || 0)});
  recordDebugLog('VideoJob', 'success', {type: 'history-finalize', source, webcamFolderName, buildTimeMs: Date.now() - buildStartedAt, outputPath: output || outputPath, outputSize});

  if (!exists || !output) {
    return undefined;
  }

  return {name: FULL_MATCH_FILE_NAME, path: output, size: outputSize, source};
};

const buildSmoothPlaybackPath = (folderPath: string, segmentIndex: number) =>
  `${folderPath}/part_${String(segmentIndex + 1).padStart(4, '0')}_playback.mp4`;

const transcodeReplaySegmentForSmoothPlayback = async (
  inputPath: string,
  outputPath: string,
  options: {timeoutMs?: number; reason?: string} = {},
) => {
  if (Platform.OS !== 'android') {
    return undefined;
  }

  const inputSize = await getExistingFileSize(inputPath);
  const timeoutMs = Math.max(8000, Number(options.timeoutMs || SMOOTH_TRANSCODE_TIMEOUT_MS));
  const outputBasePath = outputPath.replace(/\.mp4$/i, '');
  const commandProfiles = [
    {
      profile: 'h264-libx264-1080p-sharp',
      output: outputPath,
      args: [
        '-vf',
        quoteFfmpegArg('fps=20,scale=-2:1080'),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-tune',
        'zerolatency',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
      ],
    },
    {
      // ffmpeg-kit-https may not include GPL libx264. MPEG-4 Part 2 is not as
      // efficient as H264, but it is Android-friendly and keeps the buildable flavor.
      profile: 'mpeg4-1080p-hq-buildable-fallback',
      output: `${outputBasePath}_mpeg4_1080.mp4`,
      args: [
        '-vf',
        quoteFfmpegArg('fps=20,scale=-2:1080'),
        '-c:v',
        'mpeg4',
        '-q:v',
        '1',
        '-pix_fmt',
        'yuv420p',
      ],
    },
    {
      profile: 'mpeg4-720p-low-last-fallback',
      output: `${outputBasePath}_mpeg4_720.mp4`,
      args: [
        '-vf',
        quoteFfmpegArg('fps=20,scale=-2:720'),
        '-c:v',
        'mpeg4',
        '-q:v',
        '4',
        '-pix_fmt',
        'yuv420p',
      ],
    },
  ];

  recordDebugLog('ReplayNormalize', 'transcode-start', {
    input: inputPath,
    output: outputPath,
    inputSize,
    timeoutMs,
    reason: options.reason || 'smooth-playback-sharp-android-friendly',
    profiles: commandProfiles.map(profile => profile.profile),
  });

  if (inputSize < MIN_VALID_VIDEO_BYTES) {
    recordDebugLog('ReplayNormalize', 'transcode-failed', {
      input: inputPath,
      output: outputPath,
      reason: 'input-too-small',
      inputSize,
    });
    return undefined;
  }

  for (const profile of commandProfiles) {
    const command = [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'warning',
      '-fflags',
      '+genpts',
      '-i',
      quoteFfmpegArg(inputPath),
      '-map',
      '0:v:0',
      ...profile.args,
      '-an',
      '-movflags',
      '+faststart',
      '-y',
      quoteFfmpegArg(profile.output),
    ].join(' ');

    let sessionRef: any;
    let finished = false;
    const startedAt = Date.now();

    recordDebugLog('ReplayNormalize', 'transcode-profile-start', {
      profile: profile.profile,
      input: inputPath,
      output: profile.output,
      inputSize,
      timeoutMs,
      command: command.replace(/rtsp:\/\/([^:]+):([^@]+)@/i, 'rtsp://$1:***@'),
    });

    const debug = await new Promise<any>(async resolve => {
      const timer = setTimeout(async () => {
        if (finished) {
          return;
        }
        finished = true;
        try {
          const sessionId = Number(sessionRef?.getSessionId?.());
          if (Number.isFinite(sessionId)) {
            await FFmpegKit.cancel(sessionId);
          } else {
            await FFmpegKit.cancel();
          }
        } catch {}
        resolve({success: false, timedOut: true, returnCode: 'timeout'});
      }, timeoutMs);

      try {
        if (await RNFS.exists(profile.output)) {
          await RNFS.unlink(profile.output);
        }
        sessionRef = await FFmpegKit.executeAsync(command, async sessionResult => {
          if (finished) {
            return;
          }
          finished = true;
          clearTimeout(timer);
          resolve(await readFfmpegDebug(sessionResult));
        });
      } catch (error) {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        resolve({
          success: false,
          exception: String((error as Error)?.message || error),
        });
      }
    });

    const outputSize = await getExistingFileSize(profile.output);
    const elapsedMs = Date.now() - startedAt;

    if (debug?.success && outputSize >= MIN_VALID_VIDEO_BYTES) {
      recordDebugLog('ReplayNormalize', 'transcode-success', {
        profile: profile.profile,
        input: inputPath,
        output: profile.output,
        inputSize,
        outputSize,
        elapsedMs,
        debug,
      });
      return profile.output;
    }

    recordDebugLog('ReplayNormalize', 'transcode-failed', {
      profile: profile.profile,
      input: inputPath,
      output: profile.output,
      inputSize,
      outputSize,
      elapsedMs,
      reason: debug?.timedOut ? 'timeout' : 'ffmpeg-failed-or-output-too-small',
      debug,
    });

    try {
      if (outputSize > 0 && outputSize < MIN_VALID_VIDEO_BYTES) {
        await RNFS.unlink(profile.output);
      }
    } catch {}
  }

  return undefined;
};

export const registerReplaySegment = async (
  webcamFolderName: string,
  segmentPath: string,
  options: RegisterReplaySegmentOptions = {},
) => {
  try {
    const replayFolderPath = await ensureReplayFolder(webcamFolderName);

    if (!(await RNFS.exists(replayFolderPath))) {
      recordDebugLog('RecorderFlow', 'register-segment-failed', {
        reason: 'replay-folder-unavailable',
        webcamFolderName,
        replayFolderPath,
      });
      return undefined;
    }

    const existsBeforeRegister = await RNFS.exists(segmentPath);
    if (!existsBeforeRegister) {
      recordDebugLog('RecorderFlow', 'register-segment-failed', {
        reason: 'file-missing',
        webcamFolderName,
        segmentPath,
      });
      return undefined;
    }

    const stat = await RNFS.stat(segmentPath);
    const size = Number(stat.size || 0);

    const minValidBytesForSource = options.source === 'usb'
      ? MIN_USB_SHORT_REPLAY_BYTES
      : MIN_VALID_VIDEO_BYTES;

    recordDebugLog('RecorderFlow', 'register-segment-start', {
      webcamFolderName,
      segmentPath,
      size,
      minValidBytes: minValidBytesForSource,
      normalMinValidBytes: MIN_VALID_VIDEO_BYTES,
      usbShortReplayMinBytes: MIN_USB_SHORT_REPLAY_BYTES,
      segmentIndex: options.segmentIndex,
      matchSessionId: options.matchSessionId,
      source: options.source,
    });

    if (size < minValidBytesForSource) {
      recordDebugLog('RecorderFlow', 'register-segment-failed', {
        reason: options.source === 'usb' ? 'usb-short-clip-too-small-or-no-frame' : 'file-too-small',
        webcamFolderName,
        segmentPath,
        size,
        minValidBytes: minValidBytesForSource,
        normalMinValidBytes: MIN_VALID_VIDEO_BYTES,
        usbShortReplayMinBytes: MIN_USB_SHORT_REPLAY_BYTES,
      });
      return undefined;
    }

    const existingManifest = await readManifestFromFolder(
      replayFolderPath,
      webcamFolderName,
    );
    const nextSegmentIndex = Number.isFinite(options.segmentIndex)
      ? Number(options.segmentIndex)
      : existingManifest.segments.length > 0
        ? existingManifest.segments[existingManifest.segments.length - 1]
            .segmentIndex + 1
        : 0;

    const nextFileName = buildSegmentFileName(nextSegmentIndex, segmentPath, options.source);
    const replayPath = `${replayFolderPath}/${nextFileName}`;

    if (segmentPath !== replayPath) {
      try {
        if (await RNFS.exists(replayPath)) {
          recordDebugLog('RecorderFlow', 'replace-existing-replay-segment-target', {
            webcamFolderName,
            segmentPath,
            replayPath,
            segmentIndex: nextSegmentIndex,
          });
          await RNFS.unlink(replayPath);
        }
      } catch (unlinkExistingError) {
        recordDebugLog('RecorderFlow', 'replace-existing-replay-segment-target-failed-non-fatal', {
          error: String((unlinkExistingError as any)?.message || unlinkExistingError),
          replayPath,
        });
      }

      try {
        await RNFS.moveFile(segmentPath, replayPath);
        segmentPath = replayPath;
      } catch (moveError) {
        recordDebugLog('RecorderFlow', 'move-into-replay-folder-failed-trying-copy', {error: String((moveError as any)?.message || moveError)});
        await RNFS.copyFile(segmentPath, replayPath);
        try {
          await RNFS.unlink(segmentPath);
        } catch {}
        segmentPath = replayPath;
      }
    }

    const sourceReplayPath = segmentPath;
    const sourceFileName = basename(sourceReplayPath);
    const sourceSize = await getExistingFileSize(sourceReplayPath);
    let playbackPath: string | undefined;
    let playbackFileName: string | undefined;
    let playbackSize = 0;
    let smoothPlaybackPath: string | undefined;
    let smoothPlaybackFileName: string | undefined;
    let smoothPlaybackSize = 0;

    // Latency fix: do NOT remux/transcode synchronously during pause.
    // The original TS segment is already playable enough for VAR and it is the
    // highest-quality source. Heavy remux/transcode continues in the background
    // and updates match.json later, so tapping "Xem lại" does not wait here.
    const preferredReplayPath = sourceReplayPath;
    const preferredFileName = sourceFileName;
    const preferredSize = sourceSize || size;

    recordDebugLog('ReplayNormalize', 'register-preferred-quality', {
      webcamFolderName,
      segmentIndex: nextSegmentIndex,
      preferredReplayPath,
      preferredFileName,
      preferredSource: getPlaybackSourceLabel(preferredFileName),
      reason: 'pause-latency-source-file-returned-immediately-background-remux-later',
      sourceReplayPath,
      sourceSize,
      playbackPath,
      playbackSize,
      smoothPlaybackPath,
      smoothPlaybackSize,
    });

    const nextManifest = normalizeManifest(webcamFolderName, {
      ...existingManifest,
      matchSessionId: options.matchSessionId || existingManifest.matchSessionId,
      keepFullMatch: Boolean(options.keepFullMatch),
      mode: options.mode || existingManifest.mode,
      playerNames:
        Array.isArray(options.playerNames) && options.playerNames.length
          ? options.playerNames
          : existingManifest.playerNames,
      segments: [
        ...existingManifest.segments.filter(
          entry =>
            entry.segmentIndex !== nextSegmentIndex &&
            entry.fileName !== nextFileName,
        ),
        {
          segmentIndex: nextSegmentIndex,
          fileName: preferredFileName,
          sourceFileName,
          playbackFileName,
          smoothPlaybackFileName,
          createdAt: Number(options.segmentStartedAt || Date.now()),
          sizeBytes: preferredSize,
          sourceSizeBytes: sourceSize || size,
          playbackSizeBytes: playbackSize || undefined,
          smoothPlaybackSizeBytes: smoothPlaybackSize || undefined,
          containerType: getVideoContainerType(sourceFileName),
          playbackContainerType: playbackFileName
            ? getVideoContainerType(playbackFileName)
            : undefined,
          smoothPlaybackContainerType: smoothPlaybackFileName
            ? getVideoContainerType(smoothPlaybackFileName)
            : undefined,
          segmentStartedAt: Number(options.segmentStartedAt || Date.now()),
          startedAtPhoneTime: Number(options.segmentStartedAt || Date.now()),
          durationSeconds: Number(options.durationSeconds || 0) || undefined,
          source: options.source,
        },
      ].sort((a, b) => a.segmentIndex - b.segmentIndex),
    });

    await writeManifestToFolder(replayFolderPath, nextManifest);

    const registeredSegmentForArchive = nextManifest.segments.find(segment =>
      Number(segment.segmentIndex) === nextSegmentIndex && segment.fileName === preferredFileName,
    );
    if (registeredSegmentForArchive) {
      await mirrorReplaySegmentToArchive(
        webcamFolderName,
        preferredReplayPath,
        registeredSegmentForArchive,
        options.source,
      );
    }

    if (getVideoContainerType(sourceReplayPath) === 'ts') {
      const backgroundSegmentIndex = nextSegmentIndex;
      const backgroundSourcePath = sourceReplayPath;
      const backgroundTargetMp4Path = `${replayFolderPath}/part_${String(backgroundSegmentIndex + 1).padStart(4, '0')}.mp4`;
      setTimeout(() => {
        void (async () => {
          const bgStartedAt = Date.now();
          recordDebugLog('ReplayNormalize', 'background-remux-start', {
            webcamFolderName,
            segmentIndex: backgroundSegmentIndex,
            sourcePath: backgroundSourcePath,
            targetPath: backgroundTargetMp4Path,
            reason: 'after-register-do-not-block-var-open',
          });
          const normalizedPath = await normalizeReplaySegmentForPlayback(
            backgroundSourcePath,
            backgroundTargetMp4Path,
          );
          const normalizedSize = await getExistingFileSize(normalizedPath);

          if (!normalizedPath || normalizedSize < MIN_VALID_VIDEO_BYTES) {
            recordDebugLog('ReplayNormalize', 'background-remux-failed', {
              webcamFolderName,
              segmentIndex: backgroundSegmentIndex,
              sourcePath: backgroundSourcePath,
              targetPath: backgroundTargetMp4Path,
              elapsedMs: Date.now() - bgStartedAt,
              reason: 'no-valid-output',
            });
            return;
          }

          try {
            const latestManifest = await readManifestFromFolder(
              replayFolderPath,
              webcamFolderName,
            );
            const updatedManifest = normalizeManifest(webcamFolderName, {
              ...latestManifest,
              segments: latestManifest.segments.map(segment =>
                Number(segment.segmentIndex) === backgroundSegmentIndex
                  ? {
                      ...segment,
                      playbackFileName: basename(normalizedPath),
                      playbackSizeBytes: normalizedSize,
                      playbackContainerType: getVideoContainerType(normalizedPath),
                    }
                  : segment,
              ),
            });
            await writeManifestToFolder(replayFolderPath, updatedManifest);
            recordDebugLog('ReplayNormalize', 'background-remux-success', {
              webcamFolderName,
              segmentIndex: backgroundSegmentIndex,
              output: normalizedPath,
              outputSize: normalizedSize,
              elapsedMs: Date.now() - bgStartedAt,
            });
          } catch (error) {
            recordDebugLog('ReplayNormalize', 'background-remux-manifest-update-failed', {
              webcamFolderName,
              segmentIndex: backgroundSegmentIndex,
              output: normalizedPath,
              error: String((error as Error)?.message || error),
            });
          }
        })();
      }, 250);
    }

    await pruneReplayWindowForFolder(
      webcamFolderName,
      nextManifest.keepFullMatch,
      options.source,
    );

    recordDebugLog('RecorderFlow', 'register-segment-success', {
      webcamFolderName,
      replayPath: preferredReplayPath,
      sourceReplayPath,
      playbackPath,
      smoothPlaybackPath,
      sizeBytes: preferredSize,
      sourceSizeBytes: sourceSize || size,
      playbackSizeBytes: playbackSize || undefined,
      smoothPlaybackSizeBytes: smoothPlaybackSize || undefined,
      segmentIndex: nextSegmentIndex,
      manifestSegments: nextManifest.segments.length,
      source: options.source,
    });

    return preferredReplayPath;
  } catch (error) {
    recordDebugLog('RecorderFlow', 'register-segment-failed', {
      reason: 'exception',
      webcamFolderName,
      segmentPath,
      error: String((error as any)?.message || error),
    });
    // Do not pretend the segment was registered. Returning undefined lets the
    // caller treat this segment as missing instead of pointing the replay/history
    // at a file that was never moved into the ReplayBuffer.
    return undefined;
  }
};


type PublicVideoExportResult = {
  success?: boolean;
  uri?: string;
  path?: string;
  relativePath?: string;
  size?: number;
  error?: string;
};

const exportFullMatchToPublicMovies = async (
  fullMatchPath: string,
  webcamFolderName: string,
  source?: string | null,
): Promise<PublicVideoExportResult | undefined> => {
  const cleanSource = normalizeSegmentSourcePrefix(source) || 'camera';
  const relativePath = `${PUBLIC_HISTORY_RELATIVE_ROOT}/${webcamFolderName}/${cleanSource}`;
  const displayName = FULL_MATCH_FILE_NAME;
  const inputSize = await getExistingFileSize(fullMatchPath);

  if (!fullMatchPath || inputSize < getMinValidBytesForSourceOrName(fullMatchPath, source)) {
    recordDebugLog('VideoStorage', 'public-export-skipped-unusable', {
      source,
      webcamFolderName,
      fullMatchPath,
      inputSize,
    });
    return undefined;
  }

  try {
    const nativeExporter = (NativeModules as any)?.VideoStorageModule;
    if (Platform.OS === 'android' && nativeExporter?.exportVideoToPublicMovies) {
      recordDebugLog('VideoStorage', 'mediaStoreInsert uri=pending', {
        source,
        webcamFolderName,
        sourcePath: fullMatchPath,
        relativePath,
        displayName,
        size: inputSize,
      });
      const result = await nativeExporter.exportVideoToPublicMovies(
        fullMatchPath,
        relativePath,
        displayName,
      );
      const outputSize = Number(result?.size || inputSize || 0);
      recordDebugLog('VideoStorage', 'writeComplete uri=' + String(result?.uri || result?.path || ''), {
        source,
        webcamFolderName,
        uri: result?.uri,
        path: result?.path,
        relativePath: result?.relativePath || relativePath,
        size: outputSize,
      });
      recordDebugLog('VideoStorage', 'isPending=false', {
        source,
        webcamFolderName,
        uri: result?.uri,
        path: result?.path,
      });
      recordDebugLog('VideoStorage', 'visibleInFileManagerExpected=true', {
        source,
        webcamFolderName,
        relativePath: result?.relativePath || relativePath,
        displayName,
      });
      return {
        success: Boolean(result?.success !== false),
        uri: result?.uri ? String(result.uri) : undefined,
        path: result?.path ? String(result.path) : undefined,
        relativePath: result?.relativePath ? String(result.relativePath) : relativePath,
        size: outputSize,
      };
    }
  } catch (error) {
    recordDebugLog('VideoStorage', 'mediaStore-export-failed-fallback-copy', {
      source,
      webcamFolderName,
      error: String((error as any)?.message || error),
    });
  }

  try {
    const fallbackFolder = `${PUBLIC_MEDIA_ROOT}/History/${webcamFolderName}/${cleanSource}`;
    await ensureDir(fallbackFolder);
    const fallbackPath = `${fallbackFolder}/${displayName}`;
    if (await RNFS.exists(fallbackPath)) {
      await RNFS.unlink(fallbackPath);
    }
    await RNFS.copyFile(fullMatchPath, fallbackPath);
    const size = await getExistingFileSize(fallbackPath);
    const success = size >= getMinValidBytesForSourceOrName(fallbackPath, source);
    recordDebugLog('VideoStorage', 'writeComplete uri=' + fallbackPath, {
      source,
      webcamFolderName,
      path: fallbackPath,
      relativePath,
      size,
      fallback: true,
    });
    recordDebugLog('VideoStorage', 'visibleInFileManagerExpected=true', {
      source,
      webcamFolderName,
      relativePath,
      displayName,
      fallback: true,
    });
    return {success, path: fallbackPath, relativePath, size};
  } catch (copyError) {
    recordDebugLog('VideoStorage', 'public-export-failed', {
      source,
      webcamFolderName,
      fullMatchPath,
      relativePath,
      error: String((copyError as any)?.message || copyError),
    });
    return {success: false, relativePath, size: 0, error: String((copyError as any)?.message || copyError)};
  }
};

export const exportMatchToArchive = async (
  webcamFolderName: string,
  options: ExportMatchToArchiveOptions = {},
) => {
  const replayFolderPath = buildReplayFolderPath(webcamFolderName);
  const archiveFolderPath = await ensureArchiveFolder(webcamFolderName);
  const source = options.source;
  const historyLogTag = source === 'usb' ? 'USBHistory' : 'HistoryFinalize';

  recordDebugLog('HistoryFinalize', 'export-start', {
    webcamFolderName,
    replayFolderPath,
    archiveFolderPath,
    source,
    fallbackVideoPathCount: options.fallbackVideoPaths?.filter(Boolean)?.length || 0,
  });
  if (source === 'usb') {
    recordDebugLog('USBHistory', 'finish-request source=usb matchId=' + webcamFolderName, {
      source: 'usb',
      matchId: webcamFolderName,
      replayDir: replayFolderPath,
      historyDir: archiveFolderPath,
    });
  }

  const replayFolderExists = await RNFS.exists(replayFolderPath);
  const manifest = replayFolderExists
    ? await readManifestFromFolder(replayFolderPath, webcamFolderName)
    : normalizeManifest(webcamFolderName, null);

  const scannedReplayFilesAll = replayFolderExists
    ? await listAllVideoFilesFromFolder(replayFolderPath, webcamFolderName)
    : [];
  const scannedReplayFiles = filterFilesBySource(scannedReplayFilesAll, source);
  const archiveSourceFolderPath = buildArchiveSourceFolderPath(webcamFolderName, source);
  const scannedArchiveFilesAll = await listAllVideoFilesFromFolder(archiveFolderPath, webcamFolderName);
  const scannedArchiveFiles = filterFilesBySource(scannedArchiveFilesAll, source)
    .filter(file => !String(file?.path || '').toLowerCase().endsWith('/full_match.mp4'));
  const fallbackFiles = await collectUsableFallbackVideos(
    options.fallbackVideoPaths,
    source,
  );
  const filesByPath = new Map<string, {name: string; path: string; size: number; source?: string}>();

  for (const file of scannedArchiveFiles) {
    filesByPath.set(String(file.path), {
      name: file.name,
      path: file.path,
      size: Number(file.size || 0),
      source: (file as any)?.source || source,
    });
  }

  for (const file of scannedReplayFiles) {
    filesByPath.set(String(file.path), {
      name: file.name,
      path: file.path,
      size: Number(file.size || 0),
      source: (file as any)?.source || source,
    });
  }

  for (const fallback of fallbackFiles) {
    if (!filesByPath.has(fallback.path)) {
      filesByPath.set(fallback.path, fallback);
    }
  }

  const sourceFiles = Array.from(filesByPath.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

  recordDebugLog('HistoryFinalize', 'mode=history-full', {
    webcamFolderName,
    replayFolderPath,
    archiveFolderPath,
    sourceSegmentCount: sourceFiles.length,
    scannedReplayCount: scannedReplayFiles.length,
    scannedReplayTotalCount: scannedReplayFilesAll.length,
    scannedArchiveCount: scannedArchiveFiles.length,
    scannedArchiveTotalCount: scannedArchiveFilesAll.length,
    archiveSourceFolderPath,
    fallbackCount: fallbackFiles.length,
    source,
  });
  recordDebugLog('HistoryFinalize', 'export-source-files', {
    webcamFolderName,
    replayFolderPath,
    sourceFileCount: sourceFiles.length,
    sourceFiles: sourceFiles.map(file => ({
      name: file.name,
      path: file.path,
      size: Number(file.size || 0),
      source: file.source || source,
    })),
  });

  if (!sourceFiles.length) {
    recordDebugLog('HistoryFinalize', 'export-failed', {
      reason: replayFolderExists ? 'no-valid-replay-video-files' : 'replay-folder-missing-and-no-fallback-video',
      webcamFolderName,
      replayFolderPath,
      archiveFolderPath,
      source,
      fallbackVideoPaths: options.fallbackVideoPaths,
    });
    if (source === 'usb') {
      recordDebugLog('USBHistory', 'not-saved reason=no-valid-usb-video-to-promote', {
        source: 'usb',
        matchId: webcamFolderName,
        replayDir: replayFolderPath,
        historyDir: archiveFolderPath,
        fallbackVideoPaths: options.fallbackVideoPaths,
      });
    }
    return undefined;
  }

  const fullMatchFile = await buildHistoryFullMatchFile(
    webcamFolderName,
    sourceFiles,
    options,
  );
  const copiedArchiveFiles: Array<{name: string; path: string; size: number; source?: string}> = fullMatchFile
    ? [fullMatchFile]
    : [];

  let publicExportResult: PublicVideoExportResult | undefined;
  if (fullMatchFile) {
    recordDebugLog('FullMatchRecorder', 'finalized path=' + fullMatchFile.path + ' exists=true size=' + String(fullMatchFile.size), {
      source,
      webcamFolderName,
      path: fullMatchFile.path,
      exists: true,
      size: fullMatchFile.size,
      durationMs: options.durationMs,
    });
    publicExportResult = await exportFullMatchToPublicMovies(fullMatchFile.path, webcamFolderName, source);
    recordDebugLog('HistoryBuild', 'visibleInMediaStore=' + String(Boolean(publicExportResult?.success)), {
      source,
      webcamFolderName,
      publicUri: publicExportResult?.uri,
      publicPath: publicExportResult?.path,
      publicRelativePath: publicExportResult?.relativePath,
      publicSize: publicExportResult?.size,
    });
    recordDebugLog('HistoryBuild', 'playable=true', {
      source,
      webcamFolderName,
      path: fullMatchFile.path,
      publicUri: publicExportResult?.uri,
    });
    recordDebugLog('HistoryBuild', 'metadataSaved=true', {
      source,
      webcamFolderName,
      metadataPath: buildManifestPath(archiveFolderPath),
    });
    if (source === 'usb') {
      recordDebugLog('USBHistory', 'promote-replay-to-history from=' + String(sourceFiles[0]?.path || '') + ' to=' + fullMatchFile.path, {
        source: 'usb',
        matchId: webcamFolderName,
        from: sourceFiles.map(file => file.path),
        to: fullMatchFile.path,
        exists: true,
        size: fullMatchFile.size,
      });
    }
  }


  if (!copiedArchiveFiles.length) {
    recordDebugLog('HistoryFinalize', 'export-failed', {
      reason: 'no-usable-video-after-copy',
      webcamFolderName,
      archiveFolder: archiveFolderPath,
      source,
      sourceFileCount: sourceFiles.length,
    });
    if (source === 'usb') {
      recordDebugLog('USBHistory', 'not-saved reason=no-usable-usb-history-file-after-copy', {
        source: 'usb',
        matchId: webcamFolderName,
        historyDir: archiveFolderPath,
      });
    }
    return undefined;
  }

  const existingByName = new Map(manifest.segments.map(segment => [segment.fileName, segment] as const));
  const nextSegments = [...manifest.segments];
  let nextIndex = nextSegments.reduce((max, segment) => Math.max(max, Number(segment.segmentIndex || 0)), -1) + 1;

  for (const file of copiedArchiveFiles) {
    if (existingByName.has(file.name)) {
      continue;
    }
    nextSegments.push({
      segmentIndex: nextIndex++,
      fileName: file.name,
      sourceFileName: file.name,
      playbackFileName: file.name.toLowerCase().endsWith('.mp4') ? file.name : undefined,
      createdAt: Date.now(),
      sizeBytes: file.size,
      sourceSizeBytes: file.size,
      playbackSizeBytes: file.name.toLowerCase().endsWith('.mp4') ? file.size : undefined,
      containerType: getVideoContainerType(file.name),
      playbackContainerType: file.name.toLowerCase().endsWith('.mp4') ? getVideoContainerType(file.name) : undefined,
      segmentStartedAt: Date.now(),
      startedAtPhoneTime: Date.now(),
      durationSeconds: undefined,
      source: file.source || source,
    });
  }

  const exportedManifest = await writeManifestToFolder(archiveFolderPath, {
    ...manifest,
    segments: nextSegments,
    exportedAt: Date.now(),
    keepFullMatch: true,
    finalScore: options.finalScore || manifest.finalScore,
    winnerName: options.winnerName || manifest.winnerName,
    finalPlayers: options.finalPlayers || manifest.finalPlayers,
    finalTurn: options.finalTurn || manifest.finalTurn,
    endedAt: options.endedAt || manifest.endedAt || Date.now(),
    durationMs: options.durationMs || manifest.durationMs,
    publicVideoUri: publicExportResult?.uri || manifest.publicVideoUri,
    publicVideoPath: publicExportResult?.path || manifest.publicVideoPath,
    publicRelativePath: publicExportResult?.relativePath || manifest.publicRelativePath,
    publicVideoSizeBytes: publicExportResult?.size || manifest.publicVideoSizeBytes,
  });

  if (replayFolderExists) {
    await writeManifestToFolder(replayFolderPath, exportedManifest);
  }

  const archiveFiles = await listVideoFilesFromFolder(
    archiveFolderPath,
    webcamFolderName,
    'history',
  );
  const archiveFileCount = archiveFiles.length || copiedArchiveFiles.length;

  recordDebugLog('HistoryFinalize', 'copied-full-files', {
    webcamFolderName,
    copiedFullFiles: copiedArchiveFiles.map(file => ({name: file.name, size: Number(file.size || 0), source: file.source || source})),
    sourceSegmentCount: sourceFiles.length,
  });

  if (source === 'usb') {
    const lastUsbArchiveFile = copiedArchiveFiles[copiedArchiveFiles.length - 1] || archiveFiles[archiveFiles.length - 1];
    recordDebugLog('USBHistory', 'finalized path=' + String(lastUsbArchiveFile?.path || archiveFolderPath) + ' exists=true size=' + String(Number((lastUsbArchiveFile as any)?.size || 0)), {
      source: 'usb',
      matchId: webcamFolderName,
      path: lastUsbArchiveFile?.path || archiveFolderPath,
      fileExists: true,
      fileSize: Number((lastUsbArchiveFile as any)?.size || 0),
      historyDir: archiveFolderPath,
    });
    recordDebugLog('USBHistory', 'save-metadata path=' + buildManifestPath(archiveFolderPath), {
      source: 'usb',
      matchId: webcamFolderName,
      metadataPath: buildManifestPath(archiveFolderPath),
      segmentCount: exportedManifest.segments.length,
    });
    recordDebugLog('USBHistory', 'index-added source=usb videoPath=' + String(lastUsbArchiveFile?.path || ''), {
      source: 'usb',
      matchId: webcamFolderName,
      videoPath: lastUsbArchiveFile?.path,
      historyDir: archiveFolderPath,
      fileSize: Number((lastUsbArchiveFile as any)?.size || 0),
    });
  }

  recordDebugLog('HistoryFinalize', archiveFileCount > 0 ? 'export-success' : 'export-failed', {
    reason: archiveFileCount > 0 ? undefined : 'archive-has-no-video-after-copy',
    webcamFolderName,
    archiveFolder: archiveFolderPath,
    archiveFileCount,
    archiveFiles: (archiveFiles.length > 0 ? archiveFiles : copiedArchiveFiles).map(file => ({
      name: file.name,
      path: file.path,
      size: Number(file.size || 0),
      source: (file as any)?.source || source,
    })),
  });

  return archiveFileCount > 0 ? archiveFolderPath : undefined;
};

const getDirectorySize = async (directoryPath: string): Promise<number> => {
  if (!(await RNFS.exists(directoryPath))) {
    return 0;
  }

  const items = await RNFS.readDir(directoryPath);
  let total = 0;

  for (const item of items) {
    if (item.isFile()) {
      total += Number(item.size || 0);
      continue;
    }

    if (item.isDirectory()) {
      total += await getDirectorySize(item.path);
    }
  }

  return total;
};

const listChildDirectories = async (rootPath: string) => {
  if (!(await RNFS.exists(rootPath))) {
    return [] as RNFS.ReadDirItem[];
  }

  const items = await RNFS.readDir(rootPath);
  return items.filter(item => item.isDirectory()).sort(sortByAge);
};

const getSessionLastActivity = async (dir: RNFS.ReadDirItem) => {
  try {
    const files = await readVideoFiles(dir.path);
    const latestVideo = files[files.length - 1];
    if (latestVideo) {
      return safeMtime(latestVideo);
    }
  } catch {}
  return safeMtime(dir);
};

export const pruneReplayStorage = async (
  maxBytes = MAX_REPLAY_STORAGE_BYTES,
  protectedFolderNames: string[] = [],
) => {
  await ensureReplayRoot();

  const now = Date.now();
  if (now - lastPruneRunAt < PRUNE_MIN_INTERVAL_MS) {
    return {
      throttled: true,
      totalBytes: await getDirectorySize(REPLAY_ROOT),
      deleted: [] as string[],
    };
  }
  lastPruneRunAt = now;

  let total = await getDirectorySize(REPLAY_ROOT);
  const deleted: string[] = [];
  const replayDirs = await listChildDirectories(REPLAY_ROOT);

  for (const dir of replayDirs) {
    const lastActivity = await getSessionLastActivity(dir);
    const isStale = now - lastActivity > SESSION_STALE_MS;
    if (total <= maxBytes && !isStale) {
      continue;
    }
    if (protectedFolderNames.includes(dir.name)) {
      continue;
    }

    try {
      const dirSize = await getDirectorySize(dir.path);
      await RNFS.unlink(dir.path);
      total -= dirSize;
      deleted.push(`replay:${dir.name}`);
    } catch (error) {
      recordDebugLog('ReplayStorage', 'failed-to-prune-replay-folder', {path: dir.path, error: String((error as any)?.message || error)});
    }
  }

  return {totalBytes: total, deleted};
};

export const deleteReplayFolder = async (
  webcamFolderName?: string,
  options?: {includeArchive?: boolean},
) => {
  if (!webcamFolderName) {
    return;
  }

  const replayPath = buildReplayFolderPath(webcamFolderName);
  const archivePath = buildArchiveFolderPath(webcamFolderName);
  const legacyPath = buildLegacyReplayFolderPath(webcamFolderName);

  if (await RNFS.exists(replayPath)) {
    await RNFS.unlink(replayPath);
  }

  if (options?.includeArchive !== false && (await RNFS.exists(archivePath))) {
    await RNFS.unlink(archivePath);
  }

  if (await RNFS.exists(legacyPath)) {
    await RNFS.unlink(legacyPath);
  }
};

export const listHistoryMatches = async (): Promise<HistoryMatchEntry[]> => {
  await ensureReplayRoot();

  if (!(await RNFS.exists(ARCHIVE_ROOT))) {
    return [];
  }

  const folders = await listChildDirectories(ARCHIVE_ROOT);
  const entries: HistoryMatchEntry[] = [];

  for (const folder of folders) {
    const files = await listVideoFilesFromFolder(folder.path);
    if (!files.length) {
      continue;
    }

    const manifest = await readManifestFromFolder(folder.path, folder.name);
    const manifestSources = Array.from(new Set((manifest.segments || []).map(segment => String(segment.source || '')).filter(Boolean)));
    if (manifestSources.includes('usb') || files.some(file => String(file.name || '').startsWith('usb_'))) {
      recordDebugLog('USBHistory', 'list-scan source=usb found=' + String(files.length), {
        source: 'usb',
        matchId: folder.name,
        historyDir: folder.path,
        found: files.length,
        files: files.map(file => ({path: file.path, size: Number(file.size || 0)})),
      });
    }
    const totalSizeBytes = files.reduce(
      (sum, file) => sum + Number(file.size || 0),
      0,
    );
    const updatedAt = Math.max(
      ...files.map(file => safeMtime(file)),
      safeMtime(folder),
      0,
    );

    entries.push({
      webcamFolderName: manifest.webcamFolderName || folder.name,
      folderName: folder.name,
      folderPath: folder.path,
      manifest,
      files,
      createdAt: manifest.createdAt || safeMtime(folder) || Date.now(),
      updatedAt: manifest.updatedAt || updatedAt || Date.now(),
      totalSizeBytes,
    });
  }

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const normalizeWindowsVideoUri = (inputPath?: string | null) =>
  String(inputPath || '');
