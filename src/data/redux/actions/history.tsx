import {createAction, mapType, status} from 'utils/redux';

export const historyTypes = {
  DELETE_HISTORY: mapType('DELETE_HISTORY', status.start),
  DELETE_HISTORY_SUCCESS: mapType('DELETE_HISTORY', status.success),
  DELETE_HISTORY_ERROR: mapType('DELETE_HISTORY', status.error),
};

export const historyActions = {
  deleteHistory: createAction(historyTypes.DELETE_HISTORY),
  deleteHistorySuccess: createAction(historyTypes.DELETE_HISTORY_SUCCESS),
  deleteHistoryError: createAction(historyTypes.DELETE_HISTORY_ERROR),
};
