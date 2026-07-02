type StatusItem = {
  valuePrefix: string;
  keyPostfix: string;
};

type Status = {
  start: StatusItem;
  success: StatusItem;
  error: StatusItem;
};

const status: Status = {
  start: {
    valuePrefix: '@@FETCH_START/',
    keyPostfix: '_START',
  },
  success: {
    valuePrefix: '@@FETCH_SUCCESS/',
    keyPostfix: '_SUCCESS',
  },
  error: {
    valuePrefix: '@@FETCH_ERROR/',
    keyPostfix: '_ERROR',
  },
};

//Recreate type to know whether it is loading, error or success
const mapType = (type: string, newStatus: StatusItem) =>
  `${newStatus.valuePrefix}${type}`;

//HOF create action
const createAction =
  (type: string) =>
  (
    payload = {},
    onSuccess = (_data: any | any[]) => {},
    onError = (_data: any | any[]) => {},
  ) => {
    return {
      type,
      payload,
      onSuccess,
      onError,
    };
  };

//Initial state for reducer factory
const initialState = {
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: null,
};

//Create reducer for each action which is needed to check loading
const reducerFactory =
  ({
    onStart,
    onSuccess,
    onError,
  }: {
    onStart: string;
    onSuccess: string;
    onError: string;
  }) =>
  (state = initialState, {type, payload}: {type: string; payload: any}) => {
    switch (type) {
      case onStart:
        return {
          isLoading: true,
          isSuccess: false,
          isError: false,
          error: null,
        };

      case onSuccess:
        return {
          isLoading: false,
          isSuccess: true,
          isError: false,
          error: null,
        };

      case onError:
        return {
          isLoading: false,
          isSuccess: false,
          isError: true,
          error: payload,
        };

      case 'CANCEL_TASK':
        return {
          isLoading: false,
          isSuccess: false,
          isError: false,
          error: null,
        };

      default:
        return state;
    }
  };

export {status, mapType, createAction, reducerFactory};
