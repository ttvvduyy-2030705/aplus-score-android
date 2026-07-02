export type DispatchAction = {
  type: string;
  payload: {};
  onSuccess: (data: any) => void;
  onError: (data: any) => void;
};

export type ReduxAction = {type: string; payload: any};
