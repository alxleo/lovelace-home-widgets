import type { HistoryPoint } from "../../shared/history-model";

export interface HeldInterval {
  start: number;
  end: number;
}

const sorted = (points: HistoryPoint[]): HistoryPoint[] =>
  [...points].sort((left, right) => left.time - right.time);

export const heldPointAt = (points: HistoryPoint[], time: number): HistoryPoint | undefined =>
  sorted(points).findLast((point) => point.time <= time);

export const heldStepPaths = (
  points: HistoryPoint[],
  mapX: (value: number) => number,
  mapY: (time: number) => number,
  end: number,
): string[] => {
  const ordered = sorted(points);
  const paths: string[] = [];
  let commands: string[] = [];
  let lastNumericTime: number | undefined;
  for (const point of ordered) {
    if (typeof point.value === "number") {
      if (commands.length === 0) commands = [`M ${mapX(point.value)},${mapY(point.time)}`];
      else commands.push(`V ${mapY(point.time)}`, `H ${mapX(point.value)}`);
      lastNumericTime = point.time;
      continue;
    }
    if (commands.length > 0) {
      if (lastNumericTime !== undefined && point.time > lastNumericTime) commands.push(`V ${mapY(point.time)}`);
      paths.push(commands.join(" "));
      commands = [];
      lastNumericTime = undefined;
    }
  }
  if (commands.length > 0) {
    if (lastNumericTime !== undefined && end > lastNumericTime) commands.push(`V ${mapY(end)}`);
    paths.push(commands.join(" "));
  }
  return paths;
};

export const heldTrueIntervals = (
  points: HistoryPoint[],
  start: number,
  end: number,
): HeldInterval[] => {
  if (start >= end) return [];
  const ordered = sorted(points);
  let held = heldPointAt(ordered, start);
  let cursor = start;
  const intervals: HeldInterval[] = [];
  for (const transition of ordered.filter((point) => point.time > start && point.time <= end)) {
    if (held?.value === true && transition.time > cursor) intervals.push({ start: cursor, end: transition.time });
    held = transition;
    cursor = transition.time;
  }
  if (held?.value === true && end > cursor) intervals.push({ start: cursor, end });
  return intervals;
};
