import type { Scale, TimeRange } from "./history-model";

export const localTimelineMarks = (range: TimeRange, scale: Scale): number[] => {
  const cursor = new Date(range.start);
  if (scale === "week") {
    cursor.setHours(0, 0, 0, 0);
    if (cursor.getTime() < range.start) cursor.setDate(cursor.getDate() + 1);
  } else {
    const startedWithinBoundary = cursor.getMinutes() !== 0 || cursor.getSeconds() !== 0 || cursor.getMilliseconds() !== 0;
    cursor.setMinutes(0, 0, 0);
    const remainder = cursor.getHours() % 4;
    if (remainder !== 0) cursor.setHours(cursor.getHours() + 4 - remainder);
    else if (startedWithinBoundary) cursor.setHours(cursor.getHours() + 4);
  }

  const marks: number[] = [];
  while (cursor.getTime() <= range.end) {
    marks.push(cursor.getTime());
    if (scale === "week") cursor.setDate(cursor.getDate() + 1);
    else cursor.setHours(cursor.getHours() + 4);
  }
  return marks;
};
