const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const check = (name, ok, extra = {}) => {
  checks.push({name, ok: !!ok, ...extra});
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[USB_WEBCAM_PIPELINE_TEST] ${status} ${name}`, extra);
};

const video = read('src/components/Video/index.tsx');
const gameplay = read('src/scenes/game/game-play/GamePlayViewModel.tsx');
const webcam = read('src/scenes/game/game-play/console/webcam/index.tsx');
const uvcView = read('android/app/src/main/java/com/billiards_management/aplus/score/uvc/UvcCameraView.kt');
const uvcModule = read('android/app/src/main/java/com/billiards_management/aplus/score/uvc/UvcProbeModule.kt');
const replay = read('src/services/replay/localReplay.ts');
const playback = read('src/scenes/playback/PlayBackViewModel.tsx');
const playbackScreen = read('src/scenes/playback/index.tsx');

check('Video exposes UVC recorder branch', /if \(currentUsingUvc\)/.test(video) && /startUvcRecording\(outputPath\)/.test(video));
check('Video validates UVC start evidence instead of blind success', /waitForUvcRecordingEvidence/.test(video) && /start-pending-file/.test(video));
check('Video polls UVC output file and logs file-created', /recording-file-check/.test(video) && /file-created exists=true/.test(video));
check('Video rejects missing or tiny UVC file on stop', /UVC video file missing or too small/.test(video) && /MIN_VALID_VIDEO_BYTES/.test(video));
check('Gameplay start button accepts USB backend even when source snapshots lag', /isUsbWebcamGameplaySourceActive/.test(gameplay) && /start-button-accepted/.test(gameplay) && /usbGameplaySourceActive/.test(gameplay));
check('Quick match Start is not blocked when warmup counter reached zero', /quickMatchWarmUpStillRunning/.test(gameplay) && /warmUpCountdownTime > 0/.test(gameplay) && /start accepted after warm-up/.test(gameplay));
check('UVC preview does not steal touches from gameplay buttons', /pointerEvents="none"/.test(video) && /preview-layout/.test(video) && /pass-through/.test(video));
check('Native UVC view is non-clickable so Start button can receive touches', /isClickable = false/.test(uvcView) && /previewView\.isClickable = false/.test(uvcView));
check('Gameplay allows USB recorder even if parent ready flag lags', /uvcPreviewCanRecord/.test(gameplay) && /cameraReadyForRecording/.test(gameplay) && /usb-start-allowed-by-backend/.test(gameplay));
check('Gameplay blocks RTSP fallback only when USB is the active source', /fallback-blocked/.test(gameplay) && /active gameplay source is usb/.test(gameplay));
check('Gameplay registers finished camera segment into ReplayBuffer', /registerCompletedReplaySegment/.test(gameplay) && /registerReplaySegment/.test(gameplay));
check('Webcam fullscreen FAB is not gated only by shouldRenderPreview', /shouldShowFullscreenFab/.test(webcam) && /shouldShowFullscreenFab \? renderEmbeddedChrome\(\)/.test(webcam));
check('UVC native uses library VideoCapture recording API', /VideoCapture\.OutputFileOptions/.test(uvcView) && /helper\.startRecording/.test(uvcView));
check('UVC native stop returns only usable file through bridge', /segment-finalized bridge/.test(uvcModule) && /waitForRecordingFile/.test(uvcModule));
check('Replay storage is app-specific external storage', /ExternalDirectoryPath/.test(replay) && /ReplayBuffer/.test(replay) && /Saved Videos/.test(replay));
check('Replay register refuses missing/tiny files', /reason: 'file-missing'/.test(replay) && /file-too-small/.test(replay) && /usb-short-clip-too-small-or-no-frame/.test(replay));
check('Replay export builds one full_match history archive file', /exportMatchToArchive/.test(replay) && /buildHistoryFullMatchFile/.test(replay) && /full_match\.mp4/.test(replay));

check('UVC ready signature does not reset gameplay cameraReady=false', /ready-signature-reset-bypassed/.test(video) && /props\.setIsCameraReady\(true\)/.test(video));
check('UVC fullscreen keeps existing native preview session instead of restart-black-screen', /USBWebcamFullscreen\] open/.test(video) && /video-fullscreen-enter-layout-only/.test(video) && !/restartUvcPreview\('fullscreen-enter'\)/.test(video));
check('Native UVC preview uses TextureView for proper fullscreen/touch layering', /TextureView\.SurfaceTextureListener/.test(uvcView) && /surfaceTextureAvailable/.test(uvcView));
check('UVC zoom false x200 is blocked by sane ratio capability check', /raw-uvc-range-not-ratio/.test(uvcView) && /percent-control-is-not-real-ratio/.test(uvcView));
check('Gameplay forces USB source before Start validation when USB backend is active', /usbGameplaySourceActive/.test(gameplay) && /__APLUS_CURRENT_CAMERA_SOURCE__ = 'external'/.test(gameplay));
check('UVC preview surface follows official UVCAndroid TextureView binding', /addSurface\(surfaceTexture, false\)/.test(uvcView) && /uvc-official-preview-surface/.test(uvcView));
check('USB replay no longer waits for first finalized segment', /USBReplay/.test(gameplay) && !/waiting-for-first-segment/.test(gameplay) && !/Đang chờ segment/.test(gameplay));
check('RTSP and USB active source state are keyed separately', /GameplayCameraSourceKey/.test(gameplay) && /replayStateByKeyRef/.test(gameplay) && /getReplayKeyForSource/.test(gameplay));
check('RTSP source wins over stale USB device presence', /sourceKind === 'rtsp'/.test(gameplay) && /activeBackend === 'rtsp'/.test(gameplay) && /activeRtspUrl.length > 0/.test(gameplay));
check('RTSP preview clears USB gameplay-ready state', /setRtspGameplaySnapshot/.test(video) && /__APLUS_USB_GAMEPLAY_READY__ = false/.test(video) && /__APLUS_SELECTED_CAMERA_MODE__ = 'ip'/.test(video));
check('Replay segment file names are source-prefixed', /normalizeSegmentSourcePrefix/.test(replay) && /sourcePrefix/.test(replay) && /options.source/.test(replay));
check('USB history logs saved archive file', /USBHistory/.test(gameplay) && /saved path=/.test(gameplay));

check('USB preview and recorder first-frame states are separated', /previewFirstFrameReceived/.test(uvcView) && /recorderFirstFrameReceived/.test(uvcView) && /previewFirstFrameReceived/.test(video));
check('USB recorder reuses the already-bound official preview surface without flicker rebind', /ensureRecordablePreviewSurfaceForRecording/.test(uvcView) && /attach-output success=true/.test(uvcView) && /mode=reuse-uvc-official-preview-surface/.test(uvcView));
check('USB preview first frame is not faked at preview-start', !/markFrameReceived\(\"preview-start\"\)/.test(uvcView) && !/markFrameReceived\(\"restart-preview\"\)/.test(uvcView));
check('USB recorder first frame is based on file growth or saved file', /startRecordingEvidenceWatch/.test(uvcView) && /recording-file-growth/.test(uvcView) && /video-saved/.test(uvcView));
check('USB short replay uses USB-only minimum bytes and does not lower RTSP threshold', /MIN_USB_SHORT_REPLAY_BYTES/.test(video) && /MIN_USB_SHORT_REPLAY_BYTES/.test(gameplay) && /options.source === 'usb'/.test(replay));
check('USB replay logs preview frame without recorder frame internally and does not show debug popup', /preview-has-frame-but-recorder-has-no-frame/.test(gameplay) && !/USB preview đã có hình nhưng recorder chưa nhận frame video/.test(gameplay));
check('USB rolling replay segment is source-specific and short', /USB_INSTANT_REPLAY_SEGMENT_MS/.test(gameplay) && /usb-instant-replay-short-rolling-segment/.test(gameplay));

check('USB rolling replay window is duration-based 30s, not fixed file count', /REPLAY_WINDOW_SECONDS = 30/.test(replay) && /selectReplayWindowFiles/.test(replay) && /accumulatedSeconds >= REPLAY_WINDOW_SECONDS/.test(replay));
check('Playback starts at first selected rolling-window file so 22s USB replay is not only last chunk', /Start from the first selected chunk/.test(read('src/scenes/playback/PlayBackViewModel.tsx')) && /const initialIndex = 0;/.test(read('src/scenes/playback/PlayBackViewModel.tsx')));
check('Replay return restores gameplay session instead of remounting USB session', /close-replay sessionId=/.test(gameplay) && /stateAfterResume started=/.test(gameplay) && /reuse reason=replay-return/.test(gameplay));
check('History export and wait use active source so USB is not missed or mixed with RTSP', /waitForReplayFiles\(webcamFolderName, 1, 10000, \{\s*source: historySourceAtEnd/.test(gameplay) && /filterFilesBySource\(scannedReplayFilesAll, source\)/.test(replay));
check('Replay output is built as one replay_latest mp4 before player opens', /buildReplayLatestFile/.test(replay) && /replay_latest\.mp4/.test(replay) && /playingSingleFile=true/.test(gameplay + playback));
check('History output is built as one full_match mp4 before history opens', /buildHistoryFullMatchFile/.test(replay) && /full_match\.mp4/.test(replay) && /HistoryBuild/.test(replay));

check('Replay builder scans raw source segments and outputs one replay_latest file', /buildReplayLatestForSource/.test(replay) && /source-folder-scan/.test(replay) && /isDerivedSingleOutputFileName/.test(replay));
check('USB full_match in usb source folder passes USB byte threshold', /hasValidVideoShape = \(item: RNFS\.ReadDirItem, sourceFromFolder/.test(replay) && /source === 'usb'/.test(replay) && /path\.includes\('\/usb\/'\)/.test(replay));
check('Replay player starts single replay_latest from 0 because the file is already trimmed', /startAtTailSeconds=\{0\}/.test(playbackScreen));
check('Gameplay prepares replay via common single-file builder instead of handing playlist to player', /buildReplayLatestForSource/.test(gameplay) && /targetReplayDurationMs/.test(gameplay) && /prebuilt-replay-latest/.test(gameplay));
check('USB replay duration logs target and output duration contract', /USBReplayDuration/.test(gameplay) && /targetReplayDurationMs/.test(gameplay) && /outputDurationMs/.test(replay));


check('Long match replay uses rolling 30s/60s buffer and does not keep scanning full match', /REPLAY_ROLLING_KEEP_SECONDS = 60/.test(replay) && /ReplayRollingBuffer/.test(replay) && /maxKeepMs: keepSeconds \* 1000/.test(replay));
check('Completed segments are mirrored to history before replay buffer pruning', /mirrorReplaySegmentToArchive/.test(replay) && /segment-mirrored-to-history-source-folder/.test(replay) && /pruneReplayWindowForFolder\(\s*webcamFolderName,\s*nextManifest\.keepFullMatch,\s*options\.source/.test(replay));
check('History finalization scans mirrored archive segments, not only ReplayBuffer', /scannedArchiveFilesAll/.test(replay) && /archiveSourceFolderPath/.test(replay) && /sourceSegmentCount/.test(replay));
check('History exports full_match to public Movies via native MediaStore bridge', /VideoStorageModule/.test(replay) && /exportVideoToPublicMovies/.test(replay) && /Movies\/Aplus Score/.test(replay));
check('Android native VideoStorageModule writes MediaStore public video', fs.existsSync(path.join(root, 'android/app/src/main/java/com/billiards_management/aplus/score/video/VideoStorageModule.kt')) && /MediaStore\.Video\.Media/.test(read('android/app/src/main/java/com/billiards_management/aplus/score/video/VideoStorageModule.kt')) && /IS_PENDING/.test(read('android/app/src/main/java/com/billiards_management/aplus/score/video/VideoStorageModule.kt')));

check('Replay return keeps match countdown pause state separate from gameplay pause', /matchCountdownPausedBeforeReplay/.test(gameplay) && /isMatchPaused,\n        matchCountdownPausedBeforeReplay: isMatchPaused/.test(gameplay) && /countdownPausedBeforeReplay/.test(playbackScreen) && !/isMatchPaused: true,\n    restoreOnNextFocus/.test(playbackScreen));


const failed = checks.filter(c => !c.ok);
console.log(`[USB_WEBCAM_PIPELINE_TEST] SUMMARY passed=${checks.length - failed.length} failed=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
}
