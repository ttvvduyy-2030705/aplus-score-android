import {PixelRatio, StyleSheet} from 'react-native';

import {
  BASE_HEIGHT as BASE_LANDSCAPE_HEIGHT,
  BASE_WIDTH as BASE_LANDSCAPE_WIDTH,
  clamp,
  fontScale as responsiveFontScale,
  getResponsiveMetrics,
  round,
  scale as responsiveScale,
  scaleX as responsiveScaleX,
  scaleY as responsiveScaleY,
  moderateScale as responsiveModerateScale,
} from './responsive';

export const BASE_PORTRAIT_WIDTH = 800;
export const BASE_PORTRAIT_HEIGHT = 1280;
export {BASE_LANDSCAPE_WIDTH, BASE_LANDSCAPE_HEIGHT};

export type WidthClass = 'compact' | 'medium' | 'expanded';
export type DeviceClass = 'phone' | 'smallTablet' | 'tablet' | 'largeTablet';
export type LayoutPreset = 'phone' | 'tablet' | 'wideTablet' | 'tv';

export type AdaptiveMetrics = {
  width: number;
  height: number;
  shortSide: number;
  longSide: number;
  aspectRatio: number;
  isLandscape: boolean;
  widthClass: WidthClass;
  deviceClass: DeviceClass;
  scaleX: number;
  scaleY: number;
  moderateScale: number;
  compactScale: number;
  fontScale: number;
  spacingScale: number;
  isCompactWidth: boolean;
  isMediumWidth: boolean;
  isExpandedWidth: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  gutter: number;
};

type AnyRecord = Record<string, any>;
type StyleFactory<T> = T | ((metrics: AdaptiveMetrics) => T);

type AdaptiveFontOptions = {
  minFactor?: number;
  maxFactor?: number;
};

const FONT_KEYS = new Set([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textShadowRadius',
]);

const SPACING_KEYS = new Set([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'outlineWidth',
  'elevation',
  'minBorderRadius',
]);

const WIDTH_KEYS = new Set([
  'width',
  'minWidth',
  'maxWidth',
  'left',
  'right',
  'translateX',
]);

const HEIGHT_KEYS = new Set([
  'height',
  'minHeight',
  'maxHeight',
  'top',
  'bottom',
  'translateY',
]);

const NO_SCALE_KEYS = new Set([
  'flex',
  'flexGrow',
  'flexShrink',
  'opacity',
  'zIndex',
  'fontWeight',
  'aspectRatio',
  'lineClamp',
]);

const resolveDeviceClass = (layoutPreset: LayoutPreset): DeviceClass => {
  switch (layoutPreset) {
    case 'tablet':
      return 'smallTablet';
    case 'wideTablet':
      return 'tablet';
    case 'tv':
      return 'largeTablet';
    default:
      return 'phone';
  }
};

export const getAdaptiveMetrics = (
  widthArg?: number,
  heightArg?: number,
  fontScaleArg?: number,
): AdaptiveMetrics => {
  const metrics = getResponsiveMetrics({
    width: widthArg,
    height: heightArg,
    fontScale: fontScaleArg,
  });

  const deviceClass = resolveDeviceClass(metrics.layoutPreset);
  const spacingScale = clamp(metrics.moderateScale, 0.8, metrics.layoutPreset === 'tv' ? 1.1 : 1.06);
  const compactScale = clamp(metrics.scale, 0.78, metrics.layoutPreset === 'tv' ? 1.1 : 1.06);
  const gutter = round(
    clamp(
      24 * spacingScale,
      metrics.widthClass === 'compact' ? 16 : 20,
      metrics.widthClass === 'expanded' ? 32 : 28,
    ),
  );

  return {
    width: metrics.width,
    height: metrics.height,
    shortSide: metrics.shortSide,
    longSide: metrics.longSide,
    aspectRatio: metrics.aspectRatio,
    isLandscape: metrics.isLandscape,
    widthClass: metrics.widthClass,
    deviceClass,
    scaleX: metrics.scaleX,
    scaleY: metrics.scaleY,
    moderateScale: metrics.moderateScale,
    compactScale,
    fontScale: metrics.textScale,
    spacingScale,
    isCompactWidth: metrics.widthClass === 'compact',
    isMediumWidth: metrics.widthClass === 'medium',
    isExpandedWidth: metrics.widthClass === 'expanded',
    isPhone: metrics.layoutPreset === 'phone',
    isTablet: metrics.layoutPreset !== 'phone',
    isLargeTablet: metrics.layoutPreset === 'tv',
    gutter,
  };
};

export const getLayoutPreset = (
  metricsOrWidth?: AdaptiveMetrics | number,
  height?: number,
  fontScale?: number,
): LayoutPreset => {
  const metrics =
    typeof metricsOrWidth === 'object'
      ? metricsOrWidth
      : getAdaptiveMetrics(metricsOrWidth, height, fontScale);

  switch (metrics.deviceClass) {
    case 'smallTablet':
      return 'tablet';
    case 'tablet':
      return 'wideTablet';
    case 'largeTablet':
      return 'tv';
    default:
      return 'phone';
  }
};

export const s = (value: number, width?: number, height?: number) =>
  responsiveScaleX(value, width, height, {
    minFactor: 0.76,
    maxFactor: 1.12,
  });

export const vs = (value: number, width?: number, height?: number) =>
  responsiveScaleY(value, width, height, {
    minFactor: 0.76,
    maxFactor: 1.1,
  });

export const ms = (
  value: number,
  factor = 0.5,
  width?: number,
  height?: number,
) =>
  responsiveModerateScale(value, factor, width, height, {
    minFactor: 0.8,
    maxFactor: 1.08,
  });

export const adaptiveSize = (
  value: number,
  width?: number,
  height?: number,
) =>
  responsiveScale(value, width, height, {
    minFactor: 0.8,
    maxFactor: 1.08,
  });

export const adaptiveFont = (
  value: number,
  widthOrOptions?: number | AdaptiveFontOptions,
  height?: number,
) => {
  const options =
    typeof widthOrOptions === 'object' && widthOrOptions !== null
      ? widthOrOptions
      : undefined;
  const width = typeof widthOrOptions === 'number' ? widthOrOptions : undefined;
  const minFactor = options?.minFactor ?? 0.82;
  const maxFactor = options?.maxFactor ?? 1.08;
  return responsiveFontScale(value, width, height, {minFactor, maxFactor});
};

export const adaptiveGutter = (width?: number, height?: number) =>
  getAdaptiveMetrics(width, height).gutter;
export const adaptivePreset = (width?: number, height?: number) =>
  getAdaptiveMetrics(width, height).deviceClass;

export const getLegacyAdaptiveMeta = (
  widthArg?: number,
  heightArg?: number,
  fontScaleArg?: number,
) => {
  const metrics = getAdaptiveMetrics(widthArg, heightArg, fontScaleArg);
  const responsiveMetrics = getResponsiveMetrics({
    width: widthArg,
    height: heightArg,
    fontScale: fontScaleArg,
  });
  const safeWidth = metrics.width;
  const safeHeight = metrics.height;
  const layoutPreset = responsiveMetrics.layoutPreset;

  return {
    ...metrics,
    layoutPreset,
    styleKey: `${Math.round(safeWidth)}x${Math.round(safeHeight)}-${metrics.widthClass}-${Math.round(metrics.moderateScale * 1000)}`,
    scale: metrics.moderateScale,
    sizeScale: metrics.spacingScale,
    textScale: metrics.fontScale,
    isConstrainedLandscape: responsiveMetrics.isConstrainedLandscape,
    isShortLandscape: responsiveMetrics.isShortLandscape,
    isVeryShortLandscape: responsiveMetrics.isVeryShortLandscape,
    isUltraShortLandscape: responsiveMetrics.isUltraShortLandscape,
    s: (value: number) => s(value, safeWidth, safeHeight),
    vs: (value: number) => vs(value, safeWidth, safeHeight),
    ms: (value: number, factor = 0.5) => ms(value, factor, safeWidth, safeHeight),
    fs: (value: number, minFactor = 0.82, maxFactor = 1.08) =>
      responsiveFontScale(value, safeWidth, safeHeight, {minFactor, maxFactor}),
    systemMetrics: {
      width: safeWidth,
      height: safeHeight,
      fontScale: fontScaleArg || PixelRatio.getFontScale(),
      smallestScreenWidthDp: metrics.shortSide,
    },
  };
};

export type LegacyAdaptiveMeta = ReturnType<typeof getLegacyAdaptiveMeta>;

const scaleNumericValue = (
  key: string,
  value: number,
  metrics: AdaptiveMetrics,
): number => {
  if (!Number.isFinite(value) || NO_SCALE_KEYS.has(key)) {
    return value;
  }

  if (FONT_KEYS.has(key)) {
    return round(clamp(value * metrics.fontScale, value * 0.82, value * 1.08));
  }

  if (WIDTH_KEYS.has(key) || /(?:^|[A-Z])(left|right|width)$/i.test(key)) {
    return round(clamp(value * metrics.scaleX, value * 0.72, value * 1.12));
  }

  if (HEIGHT_KEYS.has(key) || /(?:^|[A-Z])(top|bottom|height)$/i.test(key)) {
    return round(clamp(value * metrics.scaleY, value * 0.74, value * 1.12));
  }

  if (
    SPACING_KEYS.has(key) ||
    /margin|padding|radius|gap|inset|offset|border/i.test(key)
  ) {
    return round(clamp(value * metrics.spacingScale, value * 0.8, value * 1.08));
  }

  return round(clamp(value * metrics.compactScale, value * 0.84, value * 1.08));
};

const scaleValueByKey = (key: string, value: any, metrics: AdaptiveMetrics): any => {
  if (value == null) {
    return value;
  }

  if (typeof value === 'number') {
    return scaleNumericValue(key, value, metrics);
  }

  if (Array.isArray(value)) {
    return value.map(item => scaleValueByKey(key, item, metrics));
  }

  if (typeof value === 'object') {
    const next: AnyRecord = {};
    Object.keys(value).forEach(childKey => {
      next[childKey] = scaleValueByKey(childKey, value[childKey], metrics);
    });
    return next;
  }

  return value;
};

const scaleStyles = <T extends AnyRecord>(input: T, metrics: AdaptiveMetrics): T => {
  const next = {} as T;

  Object.keys(input).forEach(styleKey => {
    next[styleKey as keyof T] = scaleValueByKey(styleKey, input[styleKey], metrics);
  });

  return next;
};

export const createAdaptiveStyles = <T extends AnyRecord>(factory: StyleFactory<T>): T => {
  let cacheKey = '';
  let cacheValue: T | null = null;

  const resolve = (): T => {
    const metrics = getAdaptiveMetrics();
    const nextKey = `${Math.round(metrics.width)}x${Math.round(metrics.height)}-${Math.round(metrics.fontScale * 1000)}`;

    if (cacheValue && cacheKey === nextKey) {
      return cacheValue;
    }

    const source = typeof factory === 'function' ? (factory as (metrics: AdaptiveMetrics) => T)(metrics) : factory;
    const scaled = scaleStyles(source, metrics);
    cacheKey = nextKey;
    cacheValue = StyleSheet.create(scaled) as T;
    return cacheValue;
  };

  return new Proxy({} as T, {
    get: (_target, property: string | symbol) => {
      const styles = resolve() as AnyRecord;
      return styles[property as keyof T];
    },
    ownKeys: () => Reflect.ownKeys(resolve() as AnyRecord),
    getOwnPropertyDescriptor: (_target, property) => {
      const styles = resolve() as AnyRecord;
      if (!(property in styles)) {
        return undefined;
      }
      return {
        enumerable: true,
        configurable: true,
        value: styles[property as keyof T],
      };
    },
  });
};
