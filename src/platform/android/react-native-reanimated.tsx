import {Animated} from 'react-native';

type SharedValueType<T> = {value: T};

export type SharedValue<T = any> = SharedValueType<T>;

export const useSharedValue = <T,>(initialValue: T): SharedValue<T> => ({
  value: initialValue,
});

export const useAnimatedStyle = <T extends object>(factory: () => T): T => {
  try {
    return factory();
  } catch {
    return {} as T;
  }
};

export const useAnimatedScrollHandler = (handlers: any) => {
  if (typeof handlers === 'function') {
    return handlers;
  }
  if (handlers && typeof handlers.onScroll === 'function') {
    return handlers.onScroll;
  }
  return () => undefined;
};

export const withSpring = <T,>(value: T): T => value;
export const withTiming = <T,>(value: T): T => value;
export const runOnJS = (fn: any) => fn;
export const runOnUI = (fn: any) => fn;
export const cancelAnimation = () => undefined;
export const interpolate = (
  value: number,
  inputRange: number[],
  outputRange: number[],
) => {
  if (!inputRange.length || !outputRange.length) {
    return value;
  }
  const minInput = inputRange[0];
  const maxInput = inputRange[inputRange.length - 1];
  const minOutput = outputRange[0];
  const maxOutput = outputRange[outputRange.length - 1];
  if (maxInput === minInput) {
    return minOutput;
  }
  const ratio = Math.max(0, Math.min(1, (value - minInput) / (maxInput - minInput)));
  return minOutput + ratio * (maxOutput - minOutput);
};

export const Extrapolate = {
  CLAMP: 'clamp',
  EXTEND: 'extend',
  IDENTITY: 'identity',
};

export default Animated;
