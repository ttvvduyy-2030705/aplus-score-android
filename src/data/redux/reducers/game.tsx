import {ReduxAction} from 'data/redux/actions';
import {gameTypes} from 'data/redux/actions/game';
import {GameSettings} from 'types/settings';

type InitialState = {
  gameSettings?: GameSettings;
};

const initialState: InitialState = {
  gameSettings: undefined,
};

const Game = (state = initialState, action: ReduxAction): InitialState => {
  const {type} = action;

  switch (type) {
    case gameTypes.UPDATE_GAME_SETTINGS_SUCCESS:
      return {...state, gameSettings: action.payload};
    default:
      return state;
  }
};

export default Game;
