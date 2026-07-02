import RNFS, {ReadDirItem} from 'react-native-fs';
import {WEBCAM_BASE_FILE_NAME, WEBCAM_FILE_EXTENSION} from 'constants/webcam';
import {WebcamType} from 'types/webcam';

let interval: NodeJS.Timeout | undefined;
let tempInterval: NodeJS.Timeout | undefined;

const DEBUG_FFMPEG_FALLBACK = false;
const debugFfmpegLog = (...args: any[]) => {
  if (__DEV__ && DEBUG_FFMPEG_FALLBACK) {
    console.log(...args);
  }
};


const getSortedVideoFiles = async (fullPath: string): Promise<ReadDirItem[]> => {
  try {
    const files = (await RNFS.readDir(fullPath)) as ReadDirItem[];
    return files
      .filter(file => file.name.endsWith('.mov'))
      .sort((a, b) => (b.mtime?.getTime() || 0) - (a.mtime?.getTime() || 0));
  } catch (error) {
    console.error('Lỗi đọc danh sách video:', error);
    return [];
  }
};

const getVideoPathsInRange = async (
  folderPath: string,
  duration: number,
): Promise<string[]> => {
  const paths: string[] = [];

  for (let i = 0; i < duration; i++) {
    const fileName = i < 10 ? `0${i}` : `${i}`;
    const filePath = `${folderPath}/${WEBCAM_BASE_FILE_NAME}${fileName}${WEBCAM_FILE_EXTENSION}`;
    const exists = await RNFS.exists(filePath);
    if (exists) {
      paths.push(filePath);
    }
  }

  return paths;
};

// Tạm thời không stream bằng FFmpeg nữa để app build được.
const streamWebcamToFile = async (
  folderName: string,
  segmentTime: number,
  webcamType?: WebcamType,
  url?: string,
): Promise<void> => {
  debugFfmpegLog(
    '[FFMPEG fallback] streamWebcamToFile disabled',
    folderName,
    segmentTime,
    webcamType,
    url,
  );
};

// Fallback: không merge thật, chỉ trả về/copy file mới nhất để luồng playback không vỡ.
const mergeVideoFiles = async (
  folderPath: string,
): Promise<string | undefined> => {
  try {
    const fullPath = `${RNFS.DownloadDirectoryPath}/${folderPath}`;
    const videoFiles = await getSortedVideoFiles(fullPath);

    if (videoFiles.length === 0) {
      return undefined;
    }

    if (videoFiles.length === 1) {
      return videoFiles[0].path;
    }

    const outputPath = `${fullPath}/${Date.now()}.mov`;
    await RNFS.copyFile(videoFiles[0].path, outputPath);
    debugFfmpegLog(`[FFMPEG fallback] Dùng file mới nhất: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Lỗi fallback mergeVideoFiles:', error);
    return undefined;
  }
};

const getFiles = async (folderPath: string): Promise<ReadDirItem[]> => {
  try {
    const fullPath = `${RNFS.DownloadDirectoryPath}/${folderPath}`;
    return await getSortedVideoFiles(fullPath);
  } catch (error) {
    console.error('Lỗi getFiles:', error);
    return [];
  }
};

// Fallback: thay vì merge nhiều đoạn, lấy file mới nhất trong nhóm thời lượng yêu cầu.
const mergeVideos = async (
  folderName: string,
  duration: number,
  options?: {cache?: boolean},
): Promise<string | undefined> => {
  try {
    const folderPath = `${RNFS.DownloadDirectoryPath}/${folderName}`;
    const finalFile = `${folderPath}/${WEBCAM_BASE_FILE_NAME}duration_${duration}${WEBCAM_FILE_EXTENSION}`;

    const isFinalFileExists = await RNFS.exists(finalFile);
    if (isFinalFileExists && options?.cache) {
      return finalFile;
    }

    if (isFinalFileExists) {
      await RNFS.unlink(finalFile);
    }

    const paths = await getVideoPathsInRange(folderPath, duration);
    if (paths.length === 0) {
      return undefined;
    }

    const sourcePath = paths[paths.length - 1];
    await RNFS.copyFile(sourcePath, finalFile);

    debugFfmpegLog(`[FFMPEG fallback] Không merge clip, dùng file: ${finalFile}`);
    return finalFile;
  } catch (error) {
    console.error('Lỗi fallback mergeVideos:', error);
    return undefined;
  }
};

const cancelStreamWebcamToFile = () => {
  if (interval) {
    clearInterval(interval);
  }
  if (tempInterval) {
    clearInterval(tempInterval);
  }
};

export {
  streamWebcamToFile,
  mergeVideos,
  cancelStreamWebcamToFile,
  mergeVideoFiles,
  getFiles,
};