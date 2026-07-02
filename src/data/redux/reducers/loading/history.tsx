import {historyTypes} from 'data/redux/actions/history';
import {combineReducers} from 'redux';
import {reducerFactory} from 'utils/redux';

const History = combineReducers({
  deleteHistory: reducerFactory({
    onStart: historyTypes.DELETE_HISTORY,
    onSuccess: historyTypes.DELETE_HISTORY_SUCCESS,
    onError: historyTypes.DELETE_HISTORY_ERROR,
  }),
});

export default History;
