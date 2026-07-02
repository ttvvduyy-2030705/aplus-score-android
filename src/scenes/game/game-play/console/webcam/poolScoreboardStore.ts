export type PoolCameraScoreboardState = {
  currentPlayerIndex?: number;
  countdownTime?: number;
  gameSettings?: any;
  playerSettings?: any;
};

export const EMPTY_POOL_CAMERA_SCOREBOARD_STATE: PoolCameraScoreboardState = {
  currentPlayerIndex: 0,
  countdownTime: 0,
  gameSettings: undefined,
  playerSettings: undefined,
};

let currentState: PoolCameraScoreboardState = EMPTY_POOL_CAMERA_SCOREBOARD_STATE;
const listeners = new Set<(state: PoolCameraScoreboardState) => void>();

export const getPoolCameraScoreboardState = () => currentState;

export const setPoolCameraScoreboardState = (
  nextState: PoolCameraScoreboardState,
) => {
  currentState = {
    ...currentState,
    ...nextState,
  };

  listeners.forEach(listener => listener(currentState));
};

export const subscribePoolCameraScoreboardState = (
  listener: (state: PoolCameraScoreboardState) => void,
) => {
  listeners.add(listener);
  listener(currentState);

  return () => {
    listeners.delete(listener);
  };
};
