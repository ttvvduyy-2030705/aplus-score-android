type GAME_PLAY_POINTS_STEPS_SHORT_TYPE = 'gs-2' | 'gs-3' | 'gs-4' | 'gs-5';
type GAME_PLAY_POINTS_STEPS_TYPE =
  | GAME_PLAY_POINTS_STEPS_SHORT_TYPE
  | 'gs-10'
  | 'gs-20'
  | 'gs-50';

const GAME_PLAY_POINTS_STEPS_SHORT: {
  [key in GAME_PLAY_POINTS_STEPS_SHORT_TYPE]: number;
} = {
  'gs-2': 2,
  'gs-3': 3,
  'gs-4': 4,
  'gs-5': 5,
};

const GAME_PLAY_POINTS_STEPS: {[key in GAME_PLAY_POINTS_STEPS_TYPE]: number} = {
  'gs-2': 2,
  'gs-3': 3,
  'gs-4': 4,
  'gs-5': 5,
  'gs-10': 10,
  'gs-20': 20,
  'gs-50': 50,
};

export {GAME_PLAY_POINTS_STEPS_SHORT, GAME_PLAY_POINTS_STEPS};
