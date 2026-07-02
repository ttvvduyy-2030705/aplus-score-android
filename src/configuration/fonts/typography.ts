import {adaptiveFont, getAdaptiveMetrics, ms} from 'utils/adaptive';

export type TypographyVariant =
  | 'caption'
  | 'body'
  | 'bodyStrong'
  | 'title'
  | 'titleLarge'
  | 'display';

const TYPOGRAPHY_BASE = {
  caption: 12,
  body: 14,
  bodyStrong: 16,
  title: 20,
  titleLarge: 26,
  display: 34,
} as const;

export const getTypographySize = (
  variant: TypographyVariant,
  width?: number,
  height?: number,
) => {
  return adaptiveFont(TYPOGRAPHY_BASE[variant], width, height);
};

export const getLineHeight = (
  variant: TypographyVariant,
  width?: number,
  height?: number,
) => {
  const size = getTypographySize(variant, width, height);
  const ratio = variant === 'caption' ? 1.3 : variant === 'display' ? 1.08 : 1.18;
  return Math.round(size * ratio);
};

export const createTypography = (width?: number, height?: number) => {
  const metrics = getAdaptiveMetrics(width, height);

  return {
    metrics,
    variants: {
      caption: {
        fontSize: getTypographySize('caption', width, height),
        lineHeight: getLineHeight('caption', width, height),
      },
      body: {
        fontSize: getTypographySize('body', width, height),
        lineHeight: getLineHeight('body', width, height),
      },
      bodyStrong: {
        fontSize: getTypographySize('bodyStrong', width, height),
        lineHeight: getLineHeight('bodyStrong', width, height),
      },
      title: {
        fontSize: getTypographySize('title', width, height),
        lineHeight: getLineHeight('title', width, height),
      },
      titleLarge: {
        fontSize: getTypographySize('titleLarge', width, height),
        lineHeight: getLineHeight('titleLarge', width, height),
      },
      display: {
        fontSize: getTypographySize('display', width, height),
        lineHeight: getLineHeight('display', width, height),
      },
    },
    spacing: {
      xs: ms(6, 0.5, width, height),
      sm: ms(10, 0.5, width, height),
      md: ms(14, 0.5, width, height),
      lg: ms(18, 0.5, width, height),
      xl: ms(24, 0.5, width, height),
      xxl: ms(32, 0.5, width, height),
    },
  };
};

export default createTypography;
