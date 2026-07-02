import {gameTypes} from 'data/redux/actions/game';
import {combineReducers} from 'redux';
import {reducerFactory} from 'utils/redux';

const Game = combineReducers({
  updateGameSettings: reducerFactory({
    onStart: gameTypes.UPDATE_GAME_SETTINGS,
    onSuccess: gameTypes.UPDATE_GAME_SETTINGS_SUCCESS,
    onError: gameTypes.UPDATE_GAME_SETTINGS_ERROR,
  }),
});

export default Game;
