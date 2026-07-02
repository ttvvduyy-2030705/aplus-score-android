export type CaromCameraScoreboardState = {
  isStarted?: boolean;
  isPaused?: boolean;
  isMatchPaused?: boolean;
  currentPlayerIndex?: number;
  countdownTime?: number;
  totalTurns?: number;
  gameSettings?: any;
  playerSettings?: any;
};

export const EMPTY_CAROM_CAMERA_SCOREBOARD_STATE: CaromCameraScoreboardState = {
  isStarted: false,
  isPaused: false,
  isMatchPaused: false,
  currentPlayerIndex: 0,
  countdownTime: 0,
  totalTurns: 1,
  gameSettings: undefined,
  playerSettings: undefined,
};

let currentState: CaromCameraScoreboardState =
  EMPTY_CAROM_CAMERA_SCOREBOARD_STATE;
const listeners = new Set<(state: CaromCameraScoreboardState) => void>();

export const getCaromCameraScoreboardState = () => currentState;

export const setCaromCameraScoreboardState = (
  nextState: CaromCameraScoreboardState,
) => {
  currentState = {
    ...currentState,
    ...nextState,
  };

  listeners.forEach(listener => listener(currentState));
};

export const subscribeCaromCameraScoreboardState = (
  listener: (state: CaromCameraScoreboardState) => void,
) => {
  listeners.add(listener);
  listener(currentState);

  return () => {
    listeners.delete(listener);
  };
};
