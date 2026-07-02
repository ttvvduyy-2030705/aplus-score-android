import {Theme as NavigationTheme} from '@react-navigation/native';

export type Colors = {
  primary: string;
  lightPrimary1: string;
  lightPrimary2: string;
  statusBar: string;
  primaryOverlay: string;

  error: string;
  border: string;
  text: string;
  background: string;
  card: string;
  notification: string;

  white: string;
  whiteOverlay: string;
  whiteDarkOverlay: string;
  whiteDarkerOverlay: string;

  black: string;
  lightBlack: string;
  lightOverlay: string;
  overlay: string;
  darkOverlay: string;

  gray: string;
  gray2: string;
  lightGray: string;
  lightGray2: string;
  lightGray3: string;
  deepGray: string;

  blue: string;
  lightBlue: string;
  lightBlue1: string;
  lightBlue2: string;
  grayBlue: string;

  yellow: string;
  lightYellow2: string;
  lightYellow: string;
  yellow2: string;

  green: string;
  greenOverlay: string;

  pink: string;
  lightPink: string;

  orange: string;

  purple: string;
  darkPurple: string;

  brown: string;

  red: string;
  lightRed: string;
  lightRed2: string;
  darkRed: string;

  transparent: string;
};

export type ContentBackgroundColors = {
  [key: string]: {
    text: string;
    color: string;
    icon?: number;
  };
};

export type ColorTheme = {
  primary: string;
  lightPrimary1: string;
  lightPrimary2: string;
  statusBar: string;
  primaryOverlay: string;
  error: string;
  border: string;
  text: string;
  background: string;
  card: string;
  notification: string;
};

export type Theme = {
  colors: ColorTheme;
} & NavigationTheme;
