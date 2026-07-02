import {ReduxAction} from 'data/redux/actions';

type InitialState = {};

const initialState: InitialState = {};

const History = (state = initialState, action: ReduxAction): InitialState => {
  const {type} = action;

  switch (type) {
    default:
      return state;
  }
};

export default History;
