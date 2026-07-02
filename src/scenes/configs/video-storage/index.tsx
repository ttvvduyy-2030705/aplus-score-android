import React, {memo} from 'react';

import Button from 'components/Button';
import Text from 'components/Text';
import View from 'components/View';
import i18n from 'i18n';

import VideoStorageViewModel, {
  VIDEO_SEGMENT_MINUTE_OPTIONS,
  VIDEO_STORAGE_GB_OPTIONS,
} from './VideoStorageViewModel';
import styles from './styles';

const VideoStorageConfig = () => {
  const viewModel = VideoStorageViewModel();

  return (
    <View style={styles.container}>
      <Text color={'#FFFFFF'} style={styles.title}>
        {i18n.t('videoStorageConfig')}
      </Text>

      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text color={'#FFFFFF'} style={styles.label}>
            {i18n.t('videoStorageMax')}
          </Text>
          <Text color={'#FF3030'} style={styles.value}>
            {viewModel.maxStorageGb} GB
          </Text>
        </View>

        <View style={styles.buttonRow}>
          {VIDEO_STORAGE_GB_OPTIONS.map(option => (
            <Button
              key={`storage-${option}`}
              style={[
                styles.optionButton,
                viewModel.maxStorageGb === option && styles.selectedButton,
              ]}
              onPress={() => viewModel.onSelectMaxStorageGb(option)}>
              <Text color={'#FFFFFF'} style={styles.optionText}>
                {option} GB
              </Text>
            </Button>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text color={'#FFFFFF'} style={styles.label}>
            {i18n.t('videoSegmentDuration')}
          </Text>
          <Text color={'#FF3030'} style={styles.value}>
            {viewModel.segmentMinutes} {i18n.t('minutesShort')}
          </Text>
        </View>

        <View style={styles.buttonRow}>
          {VIDEO_SEGMENT_MINUTE_OPTIONS.map(option => (
            <Button
              key={`segment-${option}`}
              style={[
                styles.optionButton,
                viewModel.segmentMinutes === option && styles.selectedButton,
              ]}
              onPress={() => viewModel.onSelectSegmentMinutes(option)}>
              <Text color={'#FFFFFF'} style={styles.optionText}>
                {option} {i18n.t('minutesShort')}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      <Text color={'#A8A8A8'} style={styles.hint}>
        {i18n.t('videoStorageHint')}
      </Text>
    </View>
  );
};

export default memo(VideoStorageConfig);
