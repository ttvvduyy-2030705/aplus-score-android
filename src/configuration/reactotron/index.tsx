// import AsyncStorage from '@react-native-async-storage/async-storage';
// import Reactotron from 'reactotron-react-native';
// import { reactotronRedux as reduxPlugin } from 'reactotron-redux';
// import sagaPlugin from 'reactotron-redux-saga';

// const reactotronConfig = {
//   name: 'ENovel',
//   enable: __DEV__,
//   host: '192.168.110.133',
//   port: 9090,
// };

// const initReactOtron = () => {
//   if (!reactotronConfig.enable) {
//     Reactotron.clear();
//     return;
//   }

//   Reactotron.setAsyncStorageHandler(AsyncStorage); // AsyncStorage would either come from `react-native` or `@react-native-community/async-storage` depending on where you get it from

//   Reactotron.configure(reactotronConfig); // controls connection & communication settings

//   Reactotron.useReactNative(); // add all built-in react native plugins

//   Reactotron.use(reduxPlugin());
//   Reactotron.use(sagaPlugin());

//   Reactotron.connect(); // let's connect!

//   if (reactotronConfig.enable) {
//     console.log = Reactotron.log;
//     console.warn = Reactotron.warn;
//     console.error = Reactotron.error;
//   }

//   Reactotron.clear();
// };

// initReactOtron();

// export { reactotronConfig };
// export default Reactotron;
