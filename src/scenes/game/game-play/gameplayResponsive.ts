import {PixelRatio} from 'react-native';

import type {AdaptiveLayout} from '../useAdaptiveLayout';

const REFERENCE_WIDTH = 1280;
const REFERENCE_HEIGHT = 800;
const REFERENCE_ASPECT = REFERENCE_WIDTH / REFERENCE_HEIGHT;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const round = (value: number) => {
  const next = PixelRatio.roundToNearestPixel(value);
  return Number.isFinite(next) ? next : value;
};

export const getGameplayReferenceScale = (
  adaptive: AdaptiveLayout,
  options?: {min?: number; max?: number; boost?: number},
) => {
  const {min = 0.68, max = 1.04, boost = 1} = options || {};
  const width = Math.max(adaptive.width, 1);
  const height = Math.max(adaptive.height, 1);
  const widthFactor = width / REFERENCE_WIDTH;
  const heightFactor = height / REFERENCE_HEIGHT;

  const base = adaptive.isLandscape
    ? heightFactor * 0.74 + widthFactor * 0.26
    : heightFactor * 0.64 + widthFactor * 0.36;

  const aspectPenalty = adaptive.isLandscape
    ? clamp((adaptive.aspectRatio - REFERENCE_ASPECT) * 0.08, 0, 0.14)
    : 0;

  const heightPenalty = adaptive.isLandscape
    ? clamp((REFERENCE_HEIGHT - height) / 520, 0, 0.2)
    : clamp((REFERENCE_HEIGHT - height) / 760, 0, 0.12);

  const constrainedPenalty = adaptive.isConstrainedLandscape ? 0.03 : 0;

  return clamp(
    (base - aspectPenalty - heightPenalty - constrainedPenalty) * boost,
    min,
    max,
  );
};

export const gameplaySize = (
  adaptive: AdaptiveLayout,
  value: number,
  options?: {minFactor?: number; maxFactor?: number; boost?: number},
) => {
  const {minFactor = 0.72, maxFactor = 1.06, boost = 1} = options || {};
  const scale = getGameplayReferenceScale(adaptive, {
    min: minFactor,
    max: maxFactor,
    boost,
  });

  return round(clamp(value * scale, value * minFactor, value * maxFactor));
};

export const gameplayFont = (
  adaptive: AdaptiveLayout,
  value: number,
  options?: {minFactor?: number; maxFactor?: number; boost?: number},
) => {
  const {minFactor = 0.72, maxFactor = 1.04, boost = 1} = options || {};
  const scale = getGameplayReferenceScale(adaptive, {
    min: minFactor,
    max: maxFactor,
    boost,
  });

  return round(clamp(value * scale, value * minFactor, value * maxFactor));
};

export const clampGameplay = clamp;
