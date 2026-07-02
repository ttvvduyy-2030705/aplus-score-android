import remoteConfig from '@react-native-firebase/remote-config';
import i18n from 'i18n';
import {Alert} from 'react-native';

const initRemoteConfig = () => {
  remoteConfig()
    .setDefaults({
      TRIAL_ENABLED: true,
    })
    .then(() => remoteConfig().fetchAndActivate())
    .then(_fetchedRemotely => {
      const trialEnabled = remoteConfig().getValue('TRIAL_ENABLED').asBoolean();

      if (!trialEnabled) {
        Alert.alert(i18n.t('txtExpireTime'), i18n.t('msgTrialEnd'), [
          {
            text: i18n.t('txtClose'),
            onPress: () => {
              throw new Error('Trial Ended');
            },
          },
        ]);
      }
    });
};

export {initRemoteConfig};
