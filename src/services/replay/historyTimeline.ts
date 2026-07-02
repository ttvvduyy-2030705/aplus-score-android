export type HistorySegment = {
  index: number;
  path: string;
  durationMs: number;
  startedAt?: number;
  endedAt?: number;
  size?: number;
};

export type TimelineSegment = HistorySegment & {
  globalStartMs: number;
  globalEndMs: number;
};

export type ContinuousTimeline = {
  segments: TimelineSegment[];
  totalDurationMs: number;
};

const normalizeDurationMs = (value: number) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export function buildContinuousTimeline(
  segments: HistorySegment[],
): ContinuousTimeline {
  let cursor = 0;

  const timeline = segments
    .filter(segment => String(segment?.path || '').trim().length > 0)
    .map(segment => {
      const durationMs = normalizeDurationMs(segment.durationMs);
      const item: TimelineSegment = {
        ...segment,
        durationMs,
        globalStartMs: cursor,
        globalEndMs: cursor + durationMs,
      };
      cursor += durationMs;
      return item;
    });

  return {
    segments: timeline,
    totalDurationMs: cursor,
  };
}

export function mapGlobalPositionToSegment(
  timeline: TimelineSegment[],
  globalPositionMs: number,
): {
  segmentIndex: number;
  localPositionMs: number;
  segment: TimelineSegment;
} | undefined {
  if (!timeline.length) {
    return undefined;
  }

  const totalDurationMs = timeline[timeline.length - 1]?.globalEndMs || 0;
  const clampedGlobalMs = Math.max(
    0,
    Math.min(
      Number.isFinite(globalPositionMs) ? globalPositionMs : 0,
      Math.max(0, totalDurationMs),
    ),
  );

  let segment = timeline[timeline.length - 1];

  for (const item of timeline) {
    if (
      clampedGlobalMs >= item.globalStartMs &&
      (clampedGlobalMs < item.globalEndMs || item === timeline[timeline.length - 1])
    ) {
      segment = item;
      break;
    }
  }

  return {
    segmentIndex: segment.index,
    localPositionMs: Math.max(
      0,
      Math.min(clampedGlobalMs - segment.globalStartMs, segment.durationMs),
    ),
    segment,
  };
}
