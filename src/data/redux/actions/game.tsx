import {createAction, mapType, status} from 'utils/redux';

export const gameTypes = {
  UPDATE_GAME_SETTINGS: mapType('UPDATE_GAME_SETTINGS', status.start),
  UPDATE_GAME_SETTINGS_SUCCESS: mapType('UPDATE_GAME_SETTINGS', status.success),
  UPDATE_GAME_SETTINGS_ERROR: mapType('UPDATE_GAME_SETTINGS', status.error),

  END_GAME: mapType('END_GAME', status.start),
  END_GAME_SUCCESS: mapType('END_GAME', status.success),
  END_GAME_ERROR: mapType('END_GAME', status.error),
};

export const gameActions = {
  updateGameSettings: createAction(gameTypes.UPDATE_GAME_SETTINGS),
  updateGameSettingsSuccess: createAction(
    gameTypes.UPDATE_GAME_SETTINGS_SUCCESS,
  ),
  updateGameSettingsError: createAction(gameTypes.UPDATE_GAME_SETTINGS_ERROR),

  endGame: createAction(gameTypes.END_GAME),
  endGameSuccess: createAction(gameTypes.END_GAME_SUCCESS),
  endGameError: createAction(gameTypes.END_GAME_ERROR),
};
