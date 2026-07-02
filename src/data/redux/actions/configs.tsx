import {createAction, mapType, status} from 'utils/redux';

export const configsTypes = {
  RETRIEVE_STREAM_KEY: mapType('RETRIEVE_STREAM_KEY', status.start),
  RETRIEVE_STREAM_KEY_SUCCESS: mapType('RETRIEVE_STREAM_KEY', status.success),
  RETRIEVE_STREAM_KEY_ERROR: mapType('RETRIEVE_STREAM_KEY', status.error),
};

export const configsActions = {
  retrieveStreamKey: createAction(configsTypes.RETRIEVE_STREAM_KEY),
  retrieveStreamKeySuccess: createAction(
    configsTypes.RETRIEVE_STREAM_KEY_SUCCESS,
  ),
  retrieveStreamKeyError: createAction(configsTypes.RETRIEVE_STREAM_KEY_ERROR),
};
