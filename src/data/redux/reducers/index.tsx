import { combineReducers } from 'redux';
import game from './game';
import history from './history';
import configs from './configs';
import UI from './loading';

// Combine reducers into the root reducer
const rootReducer = combineReducers({
  game,
  history,
  configs,
  UI,
});

// Define RootState type for type safety across the app
export type RootState = ReturnType<typeof rootReducer>;

export default rootReducer;
