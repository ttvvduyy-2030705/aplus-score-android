export enum BallType {
  B1 = '1',
  B2 = '2',
  B3 = '3',
  B4 = '4',
  B5 = '5',
  B6 = '6',
  B7 = '7',
  B8 = '8',
  B9 = '9',
  B10 = '10',
  B11 = '11',
  B12 = '12',
  B13 = '13',
  B14 = '14',
  B15 = '15',
}

export type PoolBallType = {
  number: BallType;
  color: string;
  cut: boolean;
};
