export type Navigation = {
  navigate: (name: string, params?: Object) => void;
  goBack: () => void;
};
