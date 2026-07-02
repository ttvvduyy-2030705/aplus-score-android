import AsyncStorage from '@react-native-async-storage/async-storage';
import {keys} from 'configuration/keys';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  DEFAULT_MAX_REPLAY_STORAGE_GB,
  DEFAULT_RECORDING_SEGMENT_DURATION_MINUTES,
  normalizeReplayStorageGb,
  normalizeRecordingSegmentDurationMinutes,
} from 'services/replay/localReplay';

export const VIDEO_STORAGE_GB_OPTIONS = [10, 20, 30, 50];
export const VIDEO_SEGMENT_MINUTE_OPTIONS = [2, 5, 10, 30];

const VideoStorageViewModel = () => {
  const [maxStorageGb, setMaxStorageGb] = useState(DEFAULT_MAX_REPLAY_STORAGE_GB);
  const [segmentMinutes, setSegmentMinutes] = useState(
    DEFAULT_RECORDING_SEGMENT_DURATION_MINUTES,
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [rawStorageGb, rawSegmentMinutes] = await Promise.all([
          AsyncStorage.getItem(keys.VIDEO_STORAGE_MAX_GB),
          AsyncStorage.getItem(keys.VIDEO_SEGMENT_DURATION_MINUTES),
        ]);

        if (!mounted) {
          return;
        }

        setMaxStorageGb(normalizeReplayStorageGb(rawStorageGb));
        setSegmentMinutes(normalizeRecordingSegmentDurationMinutes(rawSegmentMinutes));
      } catch (error) {
        console.log('[VideoStorageConfig] load failed:', error);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const onSelectMaxStorageGb = useCallback(async (value: number) => {
    const nextValue = normalizeReplayStorageGb(value);
    setMaxStorageGb(nextValue);
    await AsyncStorage.setItem(keys.VIDEO_STORAGE_MAX_GB, String(nextValue));
  }, []);

  const onSelectSegmentMinutes = useCallback(async (value: number) => {
    const nextValue = normalizeRecordingSegmentDurationMinutes(value);
    setSegmentMinutes(nextValue);
    await AsyncStorage.setItem(keys.VIDEO_SEGMENT_DURATION_MINUTES, String(nextValue));
  }, []);

  return useMemo(
    () => ({
      maxStorageGb,
      segmentMinutes,
      onSelectMaxStorageGb,
      onSelectSegmentMinutes,
    }),
    [maxStorageGb, segmentMinutes, onSelectMaxStorageGb, onSelectSegmentMinutes],
  );
};

export default VideoStorageViewModel;
