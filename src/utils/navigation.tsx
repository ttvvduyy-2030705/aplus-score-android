import React from 'react';
import {StackActions} from '@react-navigation/routers';
import {CommonActions} from '@react-navigation/native';

const navigationRef = React.createRef<any>();
let previousRouteName: string | undefined;

const withReadyCheck =
  (callback: Function) =>
  (...params: any) => {
    if (!navigationRef.current?.isReady()) {
      return;
    }

    callback(...params);
  };

const push = withReadyCheck((name: string, params?: Object) => {
  navigationRef.current?.dispatch(StackActions.push(name, params));
});

const navigate = withReadyCheck((name?: string, params?: Object) => {
  navigationRef.current?.navigate(name, params);
});

const goBack = withReadyCheck(() => {
  navigationRef.current?.goBack();
});

const reset = withReadyCheck((index: number, routes: Array<any>) => {
  navigationRef.current?.dispatch(CommonActions.reset({index, routes}));
});

const setParams = withReadyCheck((params: Object) => {
  navigationRef.current?.setParams(params);
});

const setOptions = withReadyCheck((options: Object) => {
  navigationRef.current?.setParams(options);
});

const isFocused = withReadyCheck(() => {
  return navigationRef.current?.isFocused();
});

const popToTop = withReadyCheck(() => {
  navigationRef.current?.dispatch(StackActions.popToTop());
});

const onReady = () => {
  previousRouteName = navigationRef.current?.getCurrentRoute()?.name;
};

const onStateChange = async () => {
  const currentRouteName = navigationRef.current?.getCurrentRoute()?.name;

  if (previousRouteName !== currentRouteName) {
  }

  // Save the current route name for later comparison
  previousRouteName = currentRouteName;
};

export {
  navigationRef,
  push,
  navigate,
  goBack,
  reset,
  setParams,
  setOptions,
  isFocused,
  popToTop,
  onReady,
  onStateChange,
};
