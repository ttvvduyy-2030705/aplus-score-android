import React, {memo, useCallback, useContext, useMemo} from 'react';
import {Pressable, ScrollView} from 'react-native';

import images from 'assets';
import Image from 'components/Image';
import Container from 'components/Container';
import View from 'components/View';
import Text from 'components/Text';
import i18n from 'i18n';

import LanguageConfig from './language';
import VideoStorageConfig from './video-storage';
import IpCameraConfig from './ip-camera';
import createStyles from './styles';
import useAdaptiveLayout from 'scenes/game/useAdaptiveLayout';
import useScreenSystemUI from 'theme/systemUI';
import {LanguageContext} from 'context/language';

const getFallbackTitle = () => {
  const translated = i18n.t('configs' as never);
  if (translated && translated !== 'configs') {
    return translated as string;
  }

  return 'Cấu hình';
};

const Configs = (props: any) => {
  useScreenSystemUI({variant: 'fullscreen', barStyle: 'light-content'});
  const {language} = useContext(LanguageContext);
  const adaptive = useAdaptiveLayout();
  const styles = useMemo(() => createStyles(adaptive), [adaptive.styleKey]);

  const title = useMemo(() => getFallbackTitle(), [language]);

  const onBack = useCallback(() => {
    if (typeof props?.goBack === 'function') {
      props.goBack();
      return;
    }

    if (typeof props?.navigation?.goBack === 'function') {
      props.navigation.goBack();
    }
  }, [props]);

  return (
    <Container style={styles.screen}>
      <View style={styles.headerGlow}>
        <Pressable onPress={onBack} style={styles.headerBackButton}>
          <View style={styles.headerBackFrame}>
            <View style={styles.headerBackInner}>
              <Image
                source={require('../../assets/images/logo-back.png')}
                resizeMode="contain"
                style={{
                  width: adaptive.s(18),
                  height: adaptive.s(18),
                  marginRight: adaptive.s(8),
                }}
              />
              <Image
                source={images.logoSmall || images.logo}
                resizeMode="contain"
                style={styles.headerBackLogoImage}
              />
            </View>
          </View>
        </Pressable>

        <View pointerEvents="none" style={styles.headerTitleWrap}>
          <Text color={'#FFFFFF'} style={styles.headerTitle}>{title}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.settingsStack}>
          <LanguageConfig />
          <VideoStorageConfig />
          <IpCameraConfig />
        </View>
      </ScrollView>
    </Container>
  );
};

export default memo(Configs);
