import {PLAYER_COLOR} from 'constants/player';
import {PlayerSettings} from 'types/player';
import {GameSettingsMode} from 'types/settings';
import i18n from 'i18n';
import {GAME_EXTRA_TIME_BONUS} from 'constants/game-settings';
import {COUNTRIES} from './player/countries';

const DEFAULT_COUNTRY =
  COUNTRIES.find(item => item.code === 'VN') ?? {
    code: 'VN',
    name: 'Viet Nam',
    normalizedName: 'viet nam',
    flag: '🇻🇳',
  };

const createDefaultPlayer = (name: string) => ({
  name,
  color: PLAYER_COLOR[1],
  totalPoint: 0,
  setScore: 0,
  frameScore: 0,
  snooker: {setScore: 0},
  countryCode: DEFAULT_COUNTRY.code,
  countryName: DEFAULT_COUNTRY.name,
  flag: DEFAULT_COUNTRY.flag,
  flagImage: '',
});

const DEFAULT_PLAYERS = () => [
  createDefaultPlayer(i18n.t('player1')),
  createDefaultPlayer(i18n.t('player2')),
];

const GAME_SETTINGS: GameSettingsMode = {
  mode: 'pro',
  extraTimeTurns: 1,
  countdownTime: 35,
  warmUpTime: 300,
  extraTimeBonus: GAME_EXTRA_TIME_BONUS.s0,
};

const PLAYER_SETTINGS = (): PlayerSettings => ({
  playerNumber: 2,
  playingPlayers: DEFAULT_PLAYERS(),
  goal: {
    goal: 9,
    pointSteps: [-5, -1, 1, 5],
    snookerSetTarget: 75,
    framePointTarget: 75,
  },
});

export {DEFAULT_PLAYERS, GAME_SETTINGS, PLAYER_SETTINGS};
