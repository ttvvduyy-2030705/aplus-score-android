import {Screens} from 'types/scenes';

const screens: Screens = {
  home: 'home',
  gameSettings: 'gameSettings',
  gamePlay: 'gamePlay',
  history: 'history',
  playback: 'playback',
  configs: 'configs',
  overlay: 'overlay',
};

const sceneKeys = Object.keys(screens);

export {screens, sceneKeys};
