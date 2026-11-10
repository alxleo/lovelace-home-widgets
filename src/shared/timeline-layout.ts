import type { Scale, TimeRange } from "./history-model";

// Choose civil-clock boundaries in the same zone as the displayed labels.
// Absolute quarter-hour stepping handles DST and half/quarter-hour offsets.
export const localTimelineMarks = (range: TimeRange, scale: Scale, timeZone?: string): number[] => {
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const quantum = 15 * 60_000;
  const marks: number[] = [];
  for (let time = Math.ceil(range.start / quantum) * quantum; time <= range.end; time += quantum) {
    const parts = clock.formatToParts(time);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (minute === 0 && (scale === "week" ? hour === 0 : hour % 4 === 0)) marks.push(time);
  }
  return marks;
};
