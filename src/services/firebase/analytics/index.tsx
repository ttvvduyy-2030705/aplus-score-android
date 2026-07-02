import analytics, {setUserId} from '@react-native-firebase/analytics';

const sendUserId = async (deviceId: string) => {
  setUserId(analytics(), deviceId);
};

const logEvent = (
  name: string,
  params: {
    [key: string]: any;
  },
) => {
  analytics().logEvent(name, params);
};

export {sendUserId, logEvent};
