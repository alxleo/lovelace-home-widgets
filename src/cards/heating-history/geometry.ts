import type { HistoryPoint } from "../../shared/history-model";

export interface HeldInterval {
  start: number;
  end: number;
}

const sorted = (points: HistoryPoint[]): HistoryPoint[] =>
  [...points].sort((left, right) => left.time - right.time);

export const heldPointAt = (points: HistoryPoint[], time: number): HistoryPoint | undefined =>
  sorted(points).findLast((point) => point.time <= time);

export const heldStepPath = (
  points: Array<HistoryPoint & { value: number }>,
  mapX: (value: number) => number,
  mapY: (time: number) => number,
  end: number,
): string => {
  const ordered = sorted(points) as Array<HistoryPoint & { value: number }>;
  const first = ordered[0];
  if (!first) return "";
  const commands = [`M ${mapX(first.value)},${mapY(first.time)}`];
  for (const point of ordered.slice(1)) {
    commands.push(`V ${mapY(point.time)}`, `H ${mapX(point.value)}`);
  }
  if (end > ordered.at(-1)!.time) commands.push(`V ${mapY(end)}`);
  return commands.join(" ");
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
