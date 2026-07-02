import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {FFmpegKit, ReturnCode} from 'ffmpeg-kit-react-native';
import {recordDebugLog} from 'utils/recordDebugLogger';

const MIN_VALID_RTSP_SEGMENT_BYTES = 128 * 1024;
const STOP_WAIT_TIMEOUT_MS = 8000;

type ActiveRtspRecording = {
  session?: any;
  sessionId?: number;
  outputPath: string;
  startedAt: number;
  candidateUrl: string;
  transport: RtspTransport;
  profile: RtspCommandProfile['id'];
  stopRequested: boolean;
  completed: Promise<string | undefined>;
  resolveCompleted: (path?: string) => void;
};

export type RtspSegmentRecordingOptions = {
  rtspUrls: string[];
  webcamFolderName: string;
  segmentIndex: number;
};

let activeRecording: ActiveRtspRecording | null = null;
let rtspStartGeneration = 0;

const clean = (value?: string | null) => String(value || '').trim();

const unique = <T>(items: T[]) => Array.from(new Set(items));

const isLowBandwidthRtspUrl = (url: string) =>
  /subtype=1|ch00_1|substream|sub=1/i.test(clean(url));

const maskRtspUrl = (url: string) =>
  clean(url).replace(/rtsp:\/\/([^:]+):([^@]+)@/i, 'rtsp://$1:***@');

const quote = (value: string) =>
  `"${String(value).replace(/\\/g, '/').replace(/"/g, '\\"')}"`;

const buildTempOutputPath = (
  webcamFolderName: string,
  segmentIndex: number,
  extension: 'ts' | 'mp4' = 'ts',
) => {
  const safeFolder =
    clean(webcamFolderName).replace(/[^a-zA-Z0-9_-]/g, '_') || 'match';
  const safeIndex = String(Math.max(0, segmentIndex)).padStart(4, '0');
  return `${RNFS.CachesDirectoryPath}/aplus_rtsp_${safeFolder}_${safeIndex}_${Date.now()}.${extension}`;
};

const getFileSize = async (path?: string) => {
  if (!path) {
    return 0;
  }

  try {
    if (!(await RNFS.exists(path))) {
      return 0;
    }
    const stat = await RNFS.stat(path);
    return Number(stat.size || 0);
  } catch {
    return 0;
  }
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitForCompleted = async (
  recording: ActiveRtspRecording,
  timeoutMs: number,
) => {
  return Promise.race([
    recording.completed,
    new Promise<string | undefined>(resolve =>
      setTimeout(() => resolve(undefined), timeoutMs),
    ),
  ]);
};

const removeTinyOutput = async (path: string) => {
  try {
    const size = await getFileSize(path);
    if (size > 0 && size < MIN_VALID_RTSP_SEGMENT_BYTES) {
      await RNFS.unlink(path);
    }
  } catch {}
};

type RtspTransport = 'tcp' | 'udp';

type RtspCommandProfile = {
  id:
    | 'copy-ts-minimal'
    | 'copy-ts-probe'
    | 'copy-ts-timeout'
    | 'copy-mp4-minimal';
  transport: RtspTransport;
  extension: 'ts' | 'mp4';
};

const buildCommandProfiles = (): RtspCommandProfile[] => [
  // First try the smallest possible FFmpeg command. The device log proves this
  // FFmpegKit build rejects `-rw_timeout` with "Option rw_timeout not found",
  // so no profile below uses that option.
  {id: 'copy-ts-minimal', transport: 'tcp', extension: 'ts'},
  {id: 'copy-ts-minimal', transport: 'udp', extension: 'ts'},
  // Some Dahua/Imou firmwares need more probe/analyse time before packets are
  // exposed to the muxer. These options are accepted by much older FFmpeg
  // builds than rw_timeout.
  {id: 'copy-ts-probe', transport: 'tcp', extension: 'ts'},
  {id: 'copy-ts-probe', transport: 'udp', extension: 'ts'},
  // Keep timeout as a later fallback only; do not make it mandatory.
  {id: 'copy-ts-timeout', transport: 'tcp', extension: 'ts'},
  {id: 'copy-ts-timeout', transport: 'udp', extension: 'ts'},
  // Final fallback: some builds/cameras are happier muxing copied H264/H265 into
  // MP4. We still validate size before registering any file.
  {id: 'copy-mp4-minimal', transport: 'tcp', extension: 'mp4'},
  {id: 'copy-mp4-minimal', transport: 'udp', extension: 'mp4'},
];

const buildFfmpegCommand = (
  url: string,
  outputPath: string,
  profile: RtspCommandProfile,
) => {
  const inputOptions = ['-rtsp_transport', profile.transport];

  if (profile.id === 'copy-ts-probe') {
    inputOptions.push(
      '-analyzeduration',
      '10000000',
      '-probesize',
      '10000000',
      '-fflags',
      '+genpts+discardcorrupt',
    );
  }

  if (profile.id === 'copy-ts-timeout') {
    inputOptions.push('-timeout', '10000000');
  }

  const outputOptions =
    profile.extension === 'mp4'
      ? [
          '-an',
          '-dn',
          '-sn',
          '-map',
          '0:v:0',
          '-c:v',
          'copy',
          '-movflags',
          '+faststart',
          '-y',
          quote(outputPath),
        ]
      : [
          '-an',
          '-dn',
          '-sn',
          '-map',
          '0:v:0',
          '-c:v',
          'copy',
          '-f',
          'mpegts',
          '-y',
          quote(outputPath),
        ];

  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'info',
    ...inputOptions,
    '-i',
    quote(url),
    ...outputOptions,
  ].join(' ');
};

const readSessionDebug = async (sessionResult: any) => {
  try {
    const failStackTrace = await sessionResult?.getFailStackTrace?.();
    const logs = await sessionResult?.getAllLogsAsString?.();
    return {
      failStackTrace: failStackTrace
        ? String(failStackTrace).slice(0, 4000)
        : '',
      logs: logs ? String(logs).slice(-6000) : '',
    };
  } catch (error) {
    return {debugReadError: String((error as Error)?.message || error)};
  }
};

export const isRtspSegmentRecording = () => Boolean(activeRecording);

export const getRtspSegmentRecordingInfo = () => {
  if (!activeRecording) {
    return {active: false};
  }

  return {
    active: true,
    outputPath: activeRecording.outputPath,
    startedAt: activeRecording.startedAt,
    rtspUrl: maskRtspUrl(activeRecording.candidateUrl),
    transport: activeRecording.transport,
    profile: activeRecording.profile,
  };
};

export const cancelRtspSegmentRecording = async (reason = 'cancel') => {
  // Invalidate an in-progress candidate loop even when FFmpeg has already
  // failed one candidate and activeRecording is briefly null between tries.
  rtspStartGeneration += 1;
  const recording = activeRecording;

  recordDebugLog('RTSPRecorder', ' cancel requested', {
    reason,
    hasActiveRecording: Boolean(recording),
    info: getRtspSegmentRecordingInfo(),
  });

  if (!recording) {
    return;
  }

  recording.stopRequested = true;
  try {
    const sessionId = recording.sessionId;
    if (Number.isFinite(sessionId)) {
      await FFmpegKit.cancel(sessionId);
    } else {
      await FFmpegKit.cancel();
    }
  } catch (error) {
    recordDebugLog('RTSPRecorder', ' cancel error', {
      reason,
      error: String((error as Error)?.message || error),
    });
  }
};

export const startRtspSegmentRecording = async (
  options: RtspSegmentRecordingOptions,
): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (activeRecording) {
    recordDebugLog(
      'RTSPRecorder',
      ' start skipped: already recording',
      getRtspSegmentRecordingInfo(),
    );
    return true;
  }

  const generation = ++rtspStartGeneration;

  const rtspUrls = unique((options.rtspUrls || []).map(clean).filter(Boolean));
  if (!rtspUrls.length) {
    recordDebugLog('RTSPRecorder', ' start skipped: empty rtsp urls');
    return false;
  }

  // Quality-first: record the same RTSP stream that is being previewed first.
  // The previous smoothness patch preferred subtype=1/ch00_1; that did make
  // decoding lighter but produced noticeably blurrier replay/history than the
  // live camera. Keep sub-streams only as fallback candidates.
  const activePreviewUrl = clean((globalThis as any).__APLUS_ACTIVE_RTSP_URL__);
  const lowBandwidthUrls = rtspUrls.filter(isLowBandwidthRtspUrl);
  const highQualityUrls = rtspUrls.filter(url => !isLowBandwidthRtspUrl(url));
  const orderedUrls = unique([
    activePreviewUrl,
    ...highQualityUrls,
    ...rtspUrls,
    ...lowBandwidthUrls,
  ].filter(Boolean));

  recordDebugLog('RTSPRecorder', 'candidate-order', {
    reason: 'prefer-active-preview-and-original-quality-before-substream',
    activePreviewUrl: activePreviewUrl ? maskRtspUrl(activePreviewUrl) : undefined,
    inputCount: rtspUrls.length,
    lowBandwidthCount: lowBandwidthUrls.length,
    highQualityCount: highQualityUrls.length,
    orderedUrls: orderedUrls.map(maskRtspUrl),
  });

  const profiles = buildCommandProfiles();
  const candidatePairs = orderedUrls.flatMap(url =>
    profiles.map(profile => ({url, ...profile})),
  );

  for (let index = 0; index < candidatePairs.length; index += 1) {
    if (generation !== rtspStartGeneration) {
      recordDebugLog('RTSPRecorder', ' start aborted before candidate', {
        index: index + 1,
        candidateCount: candidatePairs.length,
      });
      return false;
    }

    const profile = candidatePairs[index];
    const {url, transport} = profile;
    const outputPath = buildTempOutputPath(
      options.webcamFolderName,
      options.segmentIndex,
      profile.extension,
    );
    const command = buildFfmpegCommand(url, outputPath, profile);

    let resolveCompleted: (path?: string) => void = () => undefined;
    const completed = new Promise<string | undefined>(resolve => {
      resolveCompleted = resolve;
    });

    const recording: ActiveRtspRecording = {
      outputPath,
      startedAt: Date.now(),
      candidateUrl: url,
      transport,
      profile: profile.id,
      stopRequested: false,
      completed,
      resolveCompleted,
    };

    activeRecording = recording;

    recordDebugLog('RecorderFlow', 'start-request', {
      backend: 'rtsp',
      candidateIndex: index + 1,
      candidateCount: candidatePairs.length,
      rtspUrl: maskRtspUrl(url),
      transport,
      profile: profile.id,
      outputPath,
      segmentIndex: options.segmentIndex,
    });

    recordDebugLog('RTSPRecorder', ' start', {
      candidateIndex: index + 1,
      candidateCount: candidatePairs.length,
      url: maskRtspUrl(url),
      transport,
      profile: profile.id,
      outputPath,
      command: command.replace(/rtsp:\/\/([^:]+):([^@]+)@/i, 'rtsp://$1:***@'),
      segmentIndex: options.segmentIndex,
    });

    try {
      const session = await FFmpegKit.executeAsync(
        command,
        async sessionResult => {
          const returnCode = await sessionResult.getReturnCode();
          const ffmpegDebug = await readSessionDebug(sessionResult);
          const size = await getFileSize(outputPath);
          const aborted = generation !== rtspStartGeneration;
          const wasStopped = recording.stopRequested;
          const isSuccess =
            ReturnCode.isSuccess(returnCode) || ReturnCode.isCancel(returnCode);
          const usablePath =
            isSuccess && size >= MIN_VALID_RTSP_SEGMENT_BYTES
              ? outputPath
              : undefined;

          recordDebugLog(
            'RecorderFlow',
            usablePath ? 'stop-success' : 'stop-failed',
            {
              backend: 'rtsp',
              outputPath,
              size,
              usable: Boolean(usablePath),
              wasStopped,
              transport,
              profile: profile.id,
              aborted,
              returnCode: returnCode?.getValue?.(),
              ffmpegDebug,
            },
          );

          recordDebugLog('RTSPRecorder', ' completed', {
            url: maskRtspUrl(url),
            outputPath,
            size,
            wasStopped,
            transport,
            profile: profile.id,
            aborted,
            returnCode: returnCode?.getValue?.(),
            usable: Boolean(usablePath),
            ffmpegDebug,
          });

          if (!usablePath) {
            await removeTinyOutput(outputPath);
          }

          if (activeRecording === recording) {
            activeRecording = null;
          }

          recording.resolveCompleted(usablePath);
        },
      );

      recording.session = session;
      recording.sessionId = Number(session?.getSessionId?.());

      if (generation !== rtspStartGeneration) {
        recording.stopRequested = true;
        try {
          const sessionId = recording.sessionId;
          if (Number.isFinite(sessionId)) {
            await FFmpegKit.cancel(sessionId);
          }
        } catch {}
        await removeTinyOutput(outputPath);
        if (activeRecording === recording) {
          activeRecording = null;
        }
        recording.resolveCompleted(undefined);
        recordDebugLog('RTSPRecorder', ' start aborted after session-created', {
          url: maskRtspUrl(url),
          transport,
          profile: profile.id,
        });
        return false;
      }

      // Give FFmpeg a moment to fail immediately on a bad URL/transport. If it is
      // still running after this, treat it as really started and let stop/rotate
      // finish it. Some cameras need >1s before the first packet is written.
      await wait(1800);

      if (generation !== rtspStartGeneration || recording.stopRequested) {
        recording.stopRequested = true;
        try {
          const sessionId = recording.sessionId;
          if (Number.isFinite(sessionId)) {
            await FFmpegKit.cancel(sessionId);
          }
        } catch {}
        if (activeRecording === recording) {
          activeRecording = null;
        }
        recording.resolveCompleted(undefined);
        recordDebugLog('RTSPRecorder', ' start aborted before accepted', {
          url: maskRtspUrl(url),
          transport,
          profile: profile.id,
          outputPath,
          stopRequested: recording.stopRequested,
          generationChanged: generation !== rtspStartGeneration,
        });
        return false;
      }

      if (activeRecording === recording) {
        const earlySize = await getFileSize(outputPath);
        recordDebugLog('RTSPRecorder', ' start accepted', {
          url: maskRtspUrl(url),
          transport,
          profile: profile.id,
          outputPath,
          earlySize,
        });
        return true;
      }

      const completedPath = await waitForCompleted(recording, 100);
      if (completedPath) {
        // It finished very fast but produced a usable segment; keep it.
        return true;
      }

      recordDebugLog(
        'RTSPRecorder',
        ' candidate failed early, trying next url/transport',
        {
          failed: maskRtspUrl(url),
          transport,
          profile: profile.id,
        },
      );
    } catch (error) {
      if (activeRecording === recording) {
        activeRecording = null;
      }
      recording.resolveCompleted(undefined);
      await removeTinyOutput(outputPath);
      recordDebugLog('RTSPRecorder', ' start candidate error', {
        url: maskRtspUrl(url),
        transport,
        profile: profile.id,
        error: String((error as Error)?.message || error),
      });
    }
  }

  recordDebugLog('RTSPRecorder', ' all candidates failed');
  return false;
};

export const stopRtspSegmentRecording = async (): Promise<
  string | undefined
> => {
  rtspStartGeneration += 1;
  const recording = activeRecording;
  if (!recording) {
    recordDebugLog('RTSPRecorder', ' stop requested without active recording');
    return undefined;
  }

  recording.stopRequested = true;
  recordDebugLog('RecorderFlow', 'stop-start', {
    backend: 'rtsp',
    outputPath: recording.outputPath,
    rtspUrl: maskRtspUrl(recording.candidateUrl),
    transport: recording.transport,
    profile: recording.profile,
  });

  recordDebugLog('RTSPRecorder', ' stop requested', {
    outputPath: recording.outputPath,
    url: maskRtspUrl(recording.candidateUrl),
    transport: recording.transport,
    profile: recording.profile,
  });

  try {
    const sessionId = recording.sessionId;
    if (Number.isFinite(sessionId)) {
      await FFmpegKit.cancel(sessionId);
    } else {
      await FFmpegKit.cancel();
    }
  } catch (error) {
    recordDebugLog('RTSPRecorder', ' cancel error', error);
  }

  const completedPath = await waitForCompleted(recording, STOP_WAIT_TIMEOUT_MS);
  if (completedPath) {
    return completedPath;
  }

  // MPEG-TS is often still playable even if FFmpegKit did not resolve quickly.
  const size = await getFileSize(recording.outputPath);
  if (size >= MIN_VALID_RTSP_SEGMENT_BYTES) {
    recordDebugLog('RecorderFlow', 'stop-success-late-file', {
      backend: 'rtsp',
      outputPath: recording.outputPath,
      size,
      transport: recording.transport,
      profile: recording.profile,
    });
    if (activeRecording === recording) {
      activeRecording = null;
    }
    recording.resolveCompleted(recording.outputPath);
    return recording.outputPath;
  }

  recordDebugLog('RecorderFlow', 'stop-failed', {
    backend: 'rtsp',
    outputPath: recording.outputPath,
    size,
    reason: 'missing-or-too-small-after-stop',
    minValidBytes: MIN_VALID_RTSP_SEGMENT_BYTES,
    transport: recording.transport,
    profile: recording.profile,
  });
  await removeTinyOutput(recording.outputPath);
  if (activeRecording === recording) {
    activeRecording = null;
  }
  recording.resolveCompleted(undefined);
  return undefined;
};
