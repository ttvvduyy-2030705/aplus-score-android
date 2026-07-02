export type SnookerBallScore = {
  labelVi: string;
  labelEn: string;
  value: number;
};

export const SNOOKER_BALL_SCORES: SnookerBallScore[] = [
  {labelVi: 'Đỏ', labelEn: 'Red', value: 1},
  {labelVi: 'Vàng', labelEn: 'Yellow', value: 2},
  {labelVi: 'Xanh lá', labelEn: 'Green', value: 3},
  {labelVi: 'Nâu', labelEn: 'Brown', value: 4},
  {labelVi: 'Xanh dương', labelEn: 'Blue', value: 5},
  {labelVi: 'Hồng', labelEn: 'Pink', value: 6},
  {labelVi: 'Đen', labelEn: 'Black', value: 7},
];

export const SNOOKER_FOUL_SCORES = [4, 5, 6, 7] as const;
