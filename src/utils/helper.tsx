import {moderateScale, fontScale as responsiveTextScale} from 'utils/responsive';

import Numeral from 'numeral';
import {Alert} from 'react-native';

let timeout: any = null;

const debounce = (callback = () => {}, duration = 1000) => {
  if (timeout) {
    clearTimeout(timeout);
  }

  timeout = setTimeout(() => {
    callback();
    clearTimeout(timeout);
  }, duration);
};

const responsiveFontSize = (fontSize: number) => {
  return responsiveTextScale(fontSize, undefined, undefined, {
    minFactor: 0.82,
    maxFactor: 1.04,
  });
};

const responsiveDimension = (size: number) => {
  return moderateScale(size, 0.65, undefined, undefined, {
    minFactor: 0.8,
    maxFactor: 1.08,
  });
};

const numberFormat = (number: string | number | undefined) => {
  if (number === null || number === undefined) {
    return '';
  }

  return Numeral(number).format();
};

const getCurrency = (locale: string) => {
  switch (locale) {
    case 'vi':
      return 'VND';
    case 'en':
      return '$';
    case 'ja':
      return '¥';
    default:
      return '';
  }
};

export {
  debounce,
  responsiveFontSize,
  responsiveDimension,
  numberFormat,
  getCurrency,
};
