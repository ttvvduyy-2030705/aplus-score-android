import {Colors} from 'types/color';

let colors: Colors = {
  primary: '#c0e048',
  lightPrimary1: '#ecfab9',
  lightPrimary2: '#d9ed91',
  statusBar: '#83a308',
  primaryOverlay: 'rgba(239, 136, 41, 0.5)',
  error: '#F12121',
  border: '#EAEAEA',
  text: '#FFFFFF',
  background: '#FFFFFF',
  card: '#FFFFFF',
  notification: '#F12121',

  white: '#FFFFFF',
  whiteOverlay: 'rgba(255,255,255, 0.1)',
  whiteDarkOverlay: 'rgba(255,255,255, 0.5)',
  whiteDarkerOverlay: 'rgba(255,255,255, 0.7)',

  black: '#000000',
  lightBlack: '#383838',
  lightOverlay: 'rgba(0, 0, 0, 0.2)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  darkOverlay: 'rgba(0, 0, 0, 0.7)',

  gray: '#CCCFCE',
  gray2: '#AEAEAE',
  lightGray: '#F5F5F5',
  lightGray2: '#EAEAEA',
  lightGray3: '#F8F8F9',
  deepGray: '#6D6D6D',

  blue: '#0264E1',
  lightBlue: '#2CB0EF',
  lightBlue1: '#18ADFE',
  lightBlue2: '#e3f5ff',
  grayBlue: '#5F7F95',

  yellow: '#E8AE00',
  lightYellow2: '#FCB23A',
  lightYellow: '#FFD694',
  yellow2: '#dbca0d',

  green: '#00C95E',
  greenOverlay: 'rgba(0, 201, 94, 0.5)',

  pink: '#FF4180',
  lightPink: '#fa7fa8',

  orange: '#d1801d',

  purple: '#8532a8',
  darkPurple: '#00054B',

  brown: '#591e00',

  red: '#DE5346',
  lightRed: '#f7766a',
  lightRed2: '#ff998f',
  darkRed: '#DD0000',

  transparent: 'transparent',
};

const COLORS = [
  {
    colors: {
      primary: '#fa7080',
      lightPrimary1: '#fc6072',
      lightPrimary2: '#ff94a0',
      statusBar: '#fa2d45',
      primaryOverlay: 'rgba(255, 201, 207, 0.5)',
      error: '#F12121',
      border: '#EAEAEA',
      text: '#6D6D6D',
      background: '#FFFFFF',
      card: '#FFFFFF',
      notification: '#F12121',
    },
    dark: false,
  },
  {
    colors: {
      primary: '#000000',
      lightPrimary1: '#4d4d4d',
      lightPrimary2: '#757575',
      statusBar: '#000000',
      primaryOverlay: 'rgba(0, 0, 0, 0.5)',
      error: '#F12121',
      border: '#EAEAEA',
      text: '#FFFFFF',
      background: '#FFFFFF',
      card: '#FFFFFF',
      notification: '#F12121',
    },
    dark: true,
  },
];

export {COLORS};
export default colors;
