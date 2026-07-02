import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Platform} from 'react-native';
import {OnVideoErrorData, VideoRef} from 'react-native-video';
import RNFS from 'react-native-fs';
import {recordDebugLog} from 'utils/recordDebugLogger';

import i18n from 'i18n';
import {
  REPLAY_WINDOW_SECONDS,
  extractReplaySegmentIndex,
  listPlayableFiles,
  resolveReplayFolder,
  normalizeWindowsVideoUri,
} from 'services/replay/localReplay';

export type PreparedVarReplayRouteFile = {
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

export interface PlayBackWebcamViewModelProps {
  webcamFolderName: string;
  merged: boolean;
  videoUri?: string;
  returnToMatch?: boolean;
  matchSessionId?: string;
  preparedVarReplayFiles?: PreparedVarReplayRouteFile[];
  preparedVarReplayAt?: number;
  replayClickAt?: number;
}

const PlayBackWebcamViewModel = (props: PlayBackWebcamViewModelProps) => {
  const videoRef = useRef<VideoRef>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [selectedDurationIndex, setSelectedDurationIndex] = useState<number>();
  const [isLoading, setIsLoading] = useState(false);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>(
    {},
  );
  const [videoFiles, setVideoFiles] = useState<RNFS.ReadDirItem[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resolvedFolder, setResolvedFolder] = useState<string>();
  const [currentSegmentNumber, setCurrentSegmentNumber] = useState<number>(0);
  const failedVideoPathsRef = useRef<Set<string>>(new Set());

  const buildRemoteVideoItem = useCallback((uri: string) => {
    const cleanUri = String(uri || '').trim();
    const fileName = cleanUri.split(/[\/]/).pop() || 'remote-replay.mp4';
    const now = Date.now();

    return {
      name: fileName,
      path: cleanUri,
      size: 0,
      mtime: new Date(now),
      ctime: new Date(now),
      isFile: () => true,
      isDirectory: () => false,
      createdAtMs: now,
      segmentStartedAt: now,
      segmentIndex: 0,
      source: 'remote-video-uri',
    } as RNFS.ReadDirItem;
  }, []);

  const buildPreparedReplayItem = useCallback((file: PreparedVarReplayRouteFile) => {
    const now = Date.now();
    const path = String(file?.path || '').trim();
    const name = String(file?.name || path.split('/').pop() || 'prepared-replay.mp4');
    const createdAtMs = Number(file?.createdAtMs || file?.segmentStartedAt || now);

    return {
      name,
      path,
      size: Number(file?.size || 0),
      mtime: new Date(createdAtMs),
      ctime: new Date(createdAtMs),
      isFile: () => true,
      isDirectory: () => false,
      createdAtMs,
      segmentStartedAt: Number(file?.segmentStartedAt || createdAtMs),
      segmentIndex: Number.isFinite(Number(file?.segmentIndex))
        ? Number(file.segmentIndex)
        : extractReplaySegmentIndex(name),
      durationSeconds: Number(file?.durationSeconds || 0) || undefined,
      sourceFileName: file?.sourceFileName,
      playbackFileName: file?.playbackFileName,
      smoothPlaybackFileName: file?.smoothPlaybackFileName,
      containerType: file?.containerType,
      playbackContainerType: file?.playbackContainerType,
      smoothPlaybackContainerType: file?.smoothPlaybackContainerType,
      source: 'prepared-var-payload',
    } as RNFS.ReadDirItem;
  }, []);

  const handleVideoLoad = useCallback((videoUri: string, duration: number) => {
    failedVideoPathsRef.current.delete(videoUri);
    setVideoDurations(prev => ({...prev, [videoUri]: duration}));
    recordDebugLog('ReplayPlayer', 'onLoad', {
      requestedPath: videoUri,
      normalizedSource:
        Platform.OS === 'windows'
          ? normalizeWindowsVideoUri(videoUri)
          : videoUri,
      duration,
    });
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < videoFiles.length - 1) {
      videoRef.current?.seek(0);
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, videoFiles.length]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      videoRef.current?.seek(0);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleLoad = useCallback(() => {
    videoRef.current?.seek(startTime);
    videoRef.current?.resume?.();
  }, [startTime]);

  const handleProgress = useCallback(
    (data: any) => {
      if (endTime > 0 && data.currentTime >= endTime && isPlaying) {
        videoRef.current?.pause?.();
        setIsPlaying(false);
      }
    },
    [endTime, isPlaying],
  );

  const loadRequestIdRef = useRef(0);

  const loadFiles = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoading(true);

    try {
      const directVideoUri = String(props.videoUri || '').trim();
      const folder = directVideoUri
        ? undefined
        : await resolveReplayFolder(props.webcamFolderName);
      if (loadRequestIdRef.current !== requestId) {
        return;
      }
      setResolvedFolder(folder);

      let files: RNFS.ReadDirItem[] = [];
      let selectedSource:
        | 'direct-url'
        | 'replay-buffer'
        | 'history-archive'
        | 'empty' = 'empty';

      if (directVideoUri) {
        files = [buildRemoteVideoItem(directVideoUri)];
        selectedSource = 'direct-url';
      } else if (folder) {
        if (props.returnToMatch) {
          const preparedRouteFiles = Array.isArray(props.preparedVarReplayFiles)
            ? props.preparedVarReplayFiles.filter(file => String(file?.path || '').trim().length > 0)
            : [];

          if (preparedRouteFiles.length > 0) {
            files = preparedRouteFiles.map(buildPreparedReplayItem);
            selectedSource = 'replay-buffer';
            recordDebugLog('VARLatency', 'playback-using-prepared-payload', {
              webcamFolderName: props.webcamFolderName,
              matchSessionId: props.matchSessionId,
              preparedAt: props.preparedVarReplayAt,
              replayClickAt: props.replayClickAt,
              fileCount: files.length,
              paths: files.map(file => file.path),
            });
          } else {
            // Fallback only. Do not wait 12s here; onPause prepares VAR in advance.
            files = await listPlayableFiles(props.webcamFolderName, false, {
              mode: 'var',
            });
            selectedSource = files.length > 0 ? 'replay-buffer' : 'empty';
          }
        } else {
          files = await listPlayableFiles(props.webcamFolderName, true, {
            mode: 'history',
          });
          selectedSource = files.length > 0 ? 'history-archive' : 'empty';
        }
      }

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      if (!folder && !directVideoUri) {
        setVideoFiles([]);
        setTotalFiles(0);
        setCurrentIndex(0);
        setIsPlaying(false);
        recordDebugLog('ReplayPlayer', 'folder-missing', {
          webcamFolderName: props.webcamFolderName,
          returnToMatch: props.returnToMatch,
          videoUri: props.videoUri,
        });
        return;
      }

      recordDebugLog('ReplayPlayer', 'video-source-resolved', {
        webcamFolderName: props.webcamFolderName,
        returnToMatch: props.returnToMatch,
        selectedSource,
        folder,
        directVideoUri: directVideoUri || undefined,
        filesCount: files.length,
      });

      for (const file of files) {
        try {
          const existsBeforePlay = await RNFS.exists(file.path);
          const stat = existsBeforePlay
            ? await RNFS.stat(file.path)
            : undefined;
          const sizeBeforePlay = Number(stat?.size || file.size || 0);
          recordDebugLog('ReplayPlayer', 'event', {
            requestedPath: file.path,
            existsBeforePlay,
            sizeBeforePlay,
            playerSource: props.returnToMatch ? 'Replay' : 'History',
          });
        } catch (error) {
          recordDebugLog('ReplayPlayer', 'stat-failed', {
            requestedPath: file.path,
            playerSource: props.returnToMatch ? 'Replay' : 'History',
            error,
          });
        }
      }

      setVideoFiles(files);
      setTotalFiles(files.length);

      recordDebugLog(props.returnToMatch ? 'ReplayPlayer' : 'HistoryPlayer', 'playingSingleFile=' + String(files.length === 1), {
        webcamFolderName: props.webcamFolderName,
        returnToMatch: props.returnToMatch,
        playingSingleFile: files.length === 1,
        fileCount: files.length,
        files: files.map(file => ({path: file.path, size: Number((file as any)?.size || 0)})),
      });

      // VAR (returnToMatch): play the whole selected rolling window.
      // The selector already returns only the last 30s (or the full elapsed match
      // when it is shorter), so starting at the newest USB chunk caused a 22s
      // match to replay only the final 4-5s.  Start from the first selected chunk;
      // long RTSP files still use startAtTailSeconds=30 in the Video component.
      const initialIndex = 0;

      setCurrentIndex(initialIndex);
      setCurrentSegmentNumber(
        files.length > 0
          ? extractReplaySegmentIndex(files[initialIndex]?.name) || initialIndex
          : 0,
      );
      setStartTime(0);
      setEndTime(0);
      setIsPlaying(files.length > 0);

      if (props.returnToMatch) {
        const estimatedReplayDuration = Math.min(
          REPLAY_WINDOW_SECONDS,
          Math.max(0, files.length) * 30,
        );
        console.log(
          '[Replay] selected replay segments',
          files.map(file => file.path),
        );
        console.log(
          '[Replay] replay duration',
          `target=${REPLAY_WINDOW_SECONDS}s estimated=${estimatedReplayDuration}s`,
        );
        console.log('[ReplayBuffer]', {
          targetWindowSeconds: REPLAY_WINDOW_SECONDS,
          finalizedSegmentsCount: files.length,
          selectedSegments: files.map(file => file.path),
          selectedTotalDuration: estimatedReplayDuration,
          reasonIfShorterThanTarget:
            estimatedReplayDuration < REPLAY_WINDOW_SECONDS
              ? `only ${files.length} finalized segment(s) available`
              : undefined,
        });
      }

      if (files.length === 0) {
        console.log(
          '[Replay] No files found after extended retry:',
          props.webcamFolderName,
        );
        recordDebugLog('ReplayReadyCheck', 'player-not-ready-debug', {
          webcamFolderName: props.webcamFolderName,
          resolvedFolder: folder,
          returnToMatch: props.returnToMatch,
          filesCount: files.length,
        });
        recordDebugLog('ReplayPlayer', 'player-not-ready', {
          reason: props.returnToMatch
            ? 'video bị xóa trước khi mở hoặc recorder chưa finalize'
            : 'History folder không có video',
          requestedPath: folder,
          playerSource: props.returnToMatch ? 'Replay' : 'History',
        });
      }
    } catch (error) {
      console.log('[VideoFreezeGuard]', {
        action: 'loadFiles',
        reason: 'caught replay/history file loading error',
        preventedFreeze: true,
        errorCaught: error,
      });
      if (loadRequestIdRef.current === requestId) {
        setVideoFiles([]);
        setTotalFiles(0);
        setCurrentIndex(0);
        setIsPlaying(false);
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [
    buildPreparedReplayItem,
    buildRemoteVideoItem,
    props.matchSessionId,
    props.preparedVarReplayAt,
    props.preparedVarReplayFiles,
    props.replayClickAt,
    props.returnToMatch,
    props.videoUri,
    props.webcamFolderName,
  ]);

  useEffect(() => {
    loadFiles();

    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [loadFiles]);

  const onSelectMinuteForWebcam = useCallback(
    async (index: number, duration: number) => {
      setIsLoading(true);
      setSelectedDurationIndex(index);

      const files = await listPlayableFiles(props.webcamFolderName, true, {
            mode: 'history',
          });

      if (!files.length) {
        Alert.alert(i18n.t('txtError'), i18n.t('msgWebcamVideoNotExist'));
        setIsLoading(false);
        return;
      }

      setVideoFiles(files);
      setTotalFiles(files.length);
      setIsLoading(false);

      const targetSeconds = Math.max(0, duration * 60);
      let remaining = targetSeconds;
      let chosenIndex = Math.max(0, files.length - 1);
      let chosenOffset = 0;

      for (let fileIndex = files.length - 1; fileIndex >= 0; fileIndex -= 1) {
        const filePath = files[fileIndex]?.path || '';
        const estimatedDuration =
          videoDurations[filePath] ||
          (fileIndex === files.length - 1
            ? Math.max(videoDurations[filePath] || 0, 1)
            : 120);

        if (remaining <= estimatedDuration) {
          chosenIndex = fileIndex;
          chosenOffset = Math.max(0, estimatedDuration - remaining);
          break;
        }

        remaining -= estimatedDuration;
        chosenIndex = fileIndex;
        chosenOffset = 0;
      }

      setCurrentIndex(chosenIndex);
      setCurrentSegmentNumber(
        extractReplaySegmentIndex(files[chosenIndex]?.name) || chosenIndex,
      );
      setStartTime(chosenOffset);
      setEndTime(0);
      setIsPlaying(true);
    },
    [props.returnToMatch, props.webcamFolderName, videoDurations],
  );

  useEffect(() => {
    const currentFile = videoFiles[currentIndex];
    setCurrentSegmentNumber(
      currentFile
        ? extractReplaySegmentIndex(currentFile.name) || currentIndex
        : 0,
    );
  }, [currentIndex, videoFiles]);

  const onWebcamError = useCallback(
    (e: OnVideoErrorData) => {
      const currentPath = videoFiles[currentIndex]?.path || '';
      if (currentPath) {
        failedVideoPathsRef.current.add(currentPath);
      }

      recordDebugLog('ReplayPlayer', 'onError', {
        requestedPath: currentPath,
        normalizedSource:
          Platform.OS === 'windows'
            ? normalizeWindowsVideoUri(currentPath)
            : currentPath,
        playerKey: currentPath
          ? `video-${currentIndex}-${currentPath}`
          : undefined,
        error: e,
      });
      console.log('[VideoFreezeGuard]', {
        action: 'onVideoError',
        reason: 'skip failed source and prevent previous/next error loop',
        preventedFreeze: true,
      });

      const nextIndex = videoFiles.findIndex(
        (file, index) =>
          index !== currentIndex && !failedVideoPathsRef.current.has(file.path),
      );

      if (nextIndex >= 0) {
        console.log('[Replay] fallback to playable clip:', nextIndex);
        setCurrentIndex(nextIndex);
        return;
      }

      setIsPlaying(false);
      Alert.alert(i18n.t('txtError'), i18n.t('msgWebcamVideoNotExist'));
    },
    [currentIndex, videoFiles],
  );

  return useMemo(
    () => ({
      videoRef,
      isLoading,
      selectedDurationIndex,
      onSelectMinuteForWebcam,
      onWebcamError,
      handleVideoLoad,
      handleProgress,
      isPlaying,
      setIsPlaying,
      handleLoad,
      handleNext,
      handlePrevious,
      videoFiles,
      currentIndex,
      setCurrentIndex,
      videoDurations,
      totalFiles,
      loadFiles,
      resolvedFolder,
      currentSegmentNumber,
    }),
    [
      isLoading,
      selectedDurationIndex,
      onSelectMinuteForWebcam,
      onWebcamError,
      handleVideoLoad,
      handleProgress,
      isPlaying,
      handleLoad,
      handleNext,
      handlePrevious,
      videoFiles,
      currentIndex,
      videoDurations,
      totalFiles,
      loadFiles,
      resolvedFolder,
      currentSegmentNumber,
    ],
  );
};

export default PlayBackWebcamViewModel;
