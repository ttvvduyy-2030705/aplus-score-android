import {takeLatest} from 'redux-saga/effects';
import {configsTypes} from '../actions/configs';

const retrieveStreamKey = function* ({onError}: ReturnType<any>) {
  if (typeof onError === 'function') {
    onError();
  }
};

const watcher = function* () {
  yield takeLatest(configsTypes.RETRIEVE_STREAM_KEY, retrieveStreamKey);
};

export default watcher();
