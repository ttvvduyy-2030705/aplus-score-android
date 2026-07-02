import React, {memo} from 'react';

import images from 'assets';
import Button from 'components/Button';
import Image from 'components/Image';
import Text from 'components/Text';
import View from 'components/View';
import i18n from 'i18n';

import LanguageConfigViewModel from './LanguageViewModel';
import styles from './styles';

const LanguageConfig = () => {
  const viewModel = LanguageConfigViewModel();

  return (
    <View style={styles.languageWrapper}>
      <Text color={'#FFFFFF'} style={styles.title}>{i18n.t('txtLanguage')}</Text>

      <View style={styles.buttonRow}>
        <Button
          style={[
            styles.optionButton,
            viewModel.language === 'vi' && styles.selectedButton,
          ]}
          onPress={viewModel.onChangeLanguage.bind(LanguageConfig, 'vi')}>
          <View style={styles.buttonInner}>
            <Image style={styles.iconFlag} source={images.vietnam} />
            <Text color={'#FFFFFF'} style={styles.buttonText}>{i18n.t('txtvi')}</Text>
          </View>
        </Button>

        <View style={styles.buttonSpacer} />

        <Button
          style={[
            styles.optionButton,
            viewModel.language === 'en' && styles.selectedButton,
          ]}
          onPress={viewModel.onChangeLanguage.bind(LanguageConfig, 'en')}>
          <View style={styles.buttonInner}>
            <Image style={styles.iconFlag} source={images.english} />
            <Text color={'#FFFFFF'} style={styles.buttonText}>{i18n.t('txten')}</Text>
          </View>
        </Button>
      </View>
    </View>
  );
};

export default memo(LanguageConfig);
