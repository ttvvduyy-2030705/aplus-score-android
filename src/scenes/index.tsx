import React from 'react';
import {
  NativeStackNavigationOptions,
  createNativeStackNavigator,
} from '@react-navigation/native-stack';
import {StyleSheet} from 'react-native';

import Text from 'components/Text';
import Button from 'components/Button';
import Image from 'components/Image';
import {withWrapper} from 'components/HOC';
import colors from 'configuration/colors';
import i18n from 'i18n';
import images from 'assets';
import {goBack} from 'utils/navigation';
import {screens} from './screens';
import {configureSystemUI} from 'theme/systemUI';

const Stack = createNativeStackNavigator();

const screenOptions: NativeStackNavigationOptions = {
  headerTitleAlign: 'center',
  headerTintColor: colors.white,
  headerBackTitle: '',
  headerBackVisible: false,
};

const noHeader: NativeStackNavigationOptions = {
  headerShown: false,
};

const styles = StyleSheet.create({
  backButton: {
    marginLeft: -15,
    padding: 10,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 24,
    height: 24,
  },
});

const renderBackButton = () => (
  <Button onPress={goBack} style={styles.backButton}>
    <Image source={images.icBack} style={styles.backIcon} />
  </Button>
);

const buildOptions = (
  name: string,
  hideHeader?: boolean,
): NativeStackNavigationOptions => {
  if (hideHeader) {
    return noHeader;
  }

  return {
    ...screenOptions,
    headerTitle: () => <Text>{i18n.t(name)}</Text>,
    headerLeft: renderBackButton,
  };
};

const getWrappedHome = () => withWrapper(screens.home, require('./home').default);
const getWrappedGameSettings = () =>
  withWrapper(screens.gameSettings, require('./game/settings').default);
const getWrappedGamePlay = () =>
  withWrapper(screens.gamePlay, require('./game/game-play').default);
const getWrappedHistory = () =>
  withWrapper(screens.history, require('./history').default);
const getWrappedPlayback = () =>
  withWrapper(screens.playback, require('./playback').default);
const getWrappedConfigs = () =>
  withWrapper(screens.configs, require('./configs').default);

const StackScreens = () => {
  React.useEffect(() => {
    configureSystemUI({animated: false});
  }, []);

  return (
    <Stack.Navigator initialRouteName={screens.home}>
      <Stack.Screen
        name={screens.home}
        getComponent={getWrappedHome}
        options={buildOptions(screens.home, true)}
      />
      <Stack.Screen
        name={screens.gameSettings}
        getComponent={getWrappedGameSettings}
        options={buildOptions(screens.gameSettings, true)}
      />
      <Stack.Screen
        name={screens.gamePlay}
        getComponent={getWrappedGamePlay}
        options={buildOptions(screens.gamePlay, true)}
      />
      <Stack.Screen
        name={screens.history}
        getComponent={getWrappedHistory}
        options={buildOptions(screens.history, true)}
      />
      <Stack.Screen
        name={screens.playback}
        getComponent={getWrappedPlayback}
        options={buildOptions(screens.playback, true)}
      />
      <Stack.Screen
        name={screens.configs}
        getComponent={getWrappedConfigs}
        options={buildOptions(screens.configs, true)}
      />
    </Stack.Navigator>
  );
};

export {StackScreens};
