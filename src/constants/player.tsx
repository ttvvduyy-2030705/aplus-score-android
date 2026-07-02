import colors from 'configuration/colors';
import {PlayerNumber, PlayerPointStep} from 'types/player';

type PLAYER_NUMBER_TYPE = 'pn2' | 'pn3' | 'pn4';
type PLAYER_NUMBER_POOL_TYPE = 'pn2' | 'pn3' | 'pn4';
type PLAYER_NUMBER_POOL_15_TYPE = 'pn2';
type PLAYER_POINT_STEPS_TYPE =
  | 'ps-50'
  | 'ps-10'
  | 'ps-5'
  | 'ps-1'
  | 'point'
  | 'ps1'
  | 'ps5'
  | 'ps10'
  | 'ps50';
type PLAYER_COLOR_TYPE = '0' | '1' | '2' | '3' | '4';

const PLAYER_NUMBER: {[key in PLAYER_NUMBER_TYPE]: PlayerNumber} = {
  pn2: 2,
  pn3: 3,
  pn4: 4,
};

const PLAYER_NUMBER_POOL: {[key in PLAYER_NUMBER_POOL_TYPE]: PlayerNumber} = {
  pn2: 2,
  pn3: 3,
  pn4: 4,
};

const PLAYER_NUMBER_POOL_15: {
  [key in PLAYER_NUMBER_POOL_15_TYPE]: PlayerNumber;
} = {
  pn2: 2,
};

const PLAYER_POINT_STEPS: {[key in PLAYER_POINT_STEPS_TYPE]: PlayerPointStep} =
  {
    'ps-50': -50,
    'ps-10': -10,
    'ps-5': -5,
    'ps-1': -1,
    point: 0,
    ps1: 1,
    ps5: 5,
    ps10: 10,
    ps50: 50,
  };

const PLAYER_COLOR: {[key in PLAYER_COLOR_TYPE]: string} = {
  '0': colors.white,
  '1': colors.yellow2,
  '2': colors.red,
  '3': colors.blue,
  '4': colors.green,
};

export {
  PLAYER_NUMBER,
  PLAYER_NUMBER_POOL,
  PLAYER_NUMBER_POOL_15,
  PLAYER_POINT_STEPS,
  PLAYER_COLOR,
};
