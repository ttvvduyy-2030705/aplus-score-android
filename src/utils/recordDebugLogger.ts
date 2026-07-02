import {Platform} from 'react-native';
import RNFS from 'react-native-fs';

const DEBUG_DIR = `${RNFS.DocumentDirectoryPath}/debug`;
const DEBUG_LOG_PATH = `${DEBUG_DIR}/replay_record_debug.txt`;
const MAX_DEBUG_LOG_BYTES = 2 * 1024 * 1024;

let writeQueue: Promise<void> = Promise.resolve();
let trimInProgress = false;

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

const formatTimestamp = (date = new Date()) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

const safeStringify = (value: unknown) => {
  if (typeof value === 'undefined') {
    return '';
  }
  if (value instanceof Error) {
    return JSON.stringify({name: value.name, message: value.message, stack: value.stack});
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const ensureLogDir = async () => {
  if (!(await RNFS.exists(DEBUG_DIR))) {
    await RNFS.mkdir(DEBUG_DIR);
  }
};

const trimLogIfNeeded = async () => {
  if (trimInProgress) {
    return;
  }

  try {
    trimInProgress = true;
    if (!(await RNFS.exists(DEBUG_LOG_PATH))) {
      return;
    }

    const stat = await RNFS.stat(DEBUG_LOG_PATH);
    const size = Number(stat.size || 0);
    if (size <= MAX_DEBUG_LOG_BYTES) {
      return;
    }

    const content = await RNFS.readFile(DEBUG_LOG_PATH, 'utf8');
    const next = content.slice(Math.max(0, content.length - Math.floor(MAX_DEBUG_LOG_BYTES / 2)));
    await RNFS.writeFile(DEBUG_LOG_PATH, next, 'utf8');
  } catch (error) {
    console.log('[RecordDebugLogger] trim failed', error);
  } finally {
    trimInProgress = false;
  }
};

export const getRecordDebugLogPath = () => DEBUG_LOG_PATH;

export const clearRecordDebugLog = async () => {
  try {
    await ensureLogDir();
    await RNFS.writeFile(
      DEBUG_LOG_PATH,
      `[${formatTimestamp()}] [RecordDebugLogger] cleared platform=${Platform.OS}\n`,
      'utf8',
    );
    console.log('[RecordDebugLogger] cleared', DEBUG_LOG_PATH);
  } catch (error) {
    console.log('[RecordDebugLogger] clear failed', error);
  }
};

export const recordDebugLog = (tag: string, message: string, extra?: unknown) => {
  const cleanTag = String(tag || 'RecordDebug').replace(/[\r\n\]]/g, ' ').trim() || 'RecordDebug';
  const cleanMessage = String(message || '').replace(/[\r\n]+/g, ' ').trim();
  const extraText = typeof extra === 'undefined' ? '' : ` ${safeStringify(extra)}`;
  const line = `[${formatTimestamp()}] [${cleanTag}] ${cleanMessage}${extraText}`;

  console.log(line);

  writeQueue = writeQueue
    .then(async () => {
      await ensureLogDir();
      await RNFS.appendFile(DEBUG_LOG_PATH, `${line}\n`, 'utf8');
      await trimLogIfNeeded();
    })
    .catch(error => {
      console.log('[RecordDebugLogger] append failed', error);
    });
};

export default recordDebugLog;
