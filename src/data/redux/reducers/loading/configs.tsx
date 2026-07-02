import {configsTypes} from 'data/redux/actions/configs';
import {combineReducers} from 'redux';
import {reducerFactory} from 'utils/redux';

const Configs = combineReducers({
  retrieveStreamKey: reducerFactory({
    onStart: configsTypes.RETRIEVE_STREAM_KEY,
    onSuccess: configsTypes.RETRIEVE_STREAM_KEY_SUCCESS,
    onError: configsTypes.RETRIEVE_STREAM_KEY_ERROR,
  }),
});

export default Configs;
