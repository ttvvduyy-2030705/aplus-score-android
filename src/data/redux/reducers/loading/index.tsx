import {combineReducers} from 'redux';

import game from './game';
import history from './history';
import configs from './configs';

//Loading reducer
const rootUILoading = combineReducers({game, history, configs});

export default rootUILoading;
