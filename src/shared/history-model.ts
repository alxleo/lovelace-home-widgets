export type Scale = "day" | "week";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const SCALE_SPANS: Record<Scale, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
};
export const MAX_FETCH_SPAN = 7 * DAY_MS;

export interface TimeRange {
  start: number;
  end: number;
}

export interface HistoryPoint {
  time: number;
  value: number | boolean;
}

export type HistoryBatch = Record<string, HistoryPoint[]>;
type FetchHistory = (range: TimeRange, signal: AbortSignal) => Promise<HistoryBatch>;
type Listener = () => void;

const assertRange = (range: TimeRange): void => {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start >= range.end) {
    throw new Error("history range must have a finite start before end");
  }
};

export const splitBounded = (range: TimeRange): TimeRange[] => {
  assertRange(range);
  const chunks: TimeRange[] = [];
  for (let start = range.start; start < range.end; start += MAX_FETCH_SPAN) {
    chunks.push({ start, end: Math.min(start + MAX_FETCH_SPAN, range.end) });
  }
  return chunks;
};

class IntervalCache {
  private intervals: TimeRange[] = [];

  add(range: TimeRange): void {
    assertRange(range);
    const all = [...this.intervals, range].sort((a, b) => a.start - b.start);
    const merged: TimeRange[] = [];
    for (const current of all) {
      const previous = merged.at(-1);
      if (!previous || previous.end < current.start) merged.push({ ...current });
      else previous.end = Math.max(previous.end, current.end);
    }
    this.intervals = merged;
  }

  missing(range: TimeRange): TimeRange[] {
    assertRange(range);
    const result: TimeRange[] = [];
    let cursor = range.start;
    for (const interval of this.intervals) {
      if (interval.end <= cursor || interval.start >= range.end) continue;
      if (interval.start > cursor) result.push({ start: cursor, end: interval.start });
      cursor = Math.max(cursor, interval.end);
    }
    if (cursor < range.end) result.push({ start: cursor, end: range.end });
    return result;
  }

  snapshot(): TimeRange[] {
    return this.intervals.map((range) => ({ ...range }));
  }
}

export class TimelineStore {
  private readonly values = new Map<string, Map<number, HistoryPoint>>();

  merge(batch: HistoryBatch): void {
    for (const [id, points] of Object.entries(batch)) {
      const values = this.values.get(id) ?? new Map<number, HistoryPoint>();
      for (const point of points) {
        if (Number.isFinite(point.time)) values.set(point.time, point);
      }
      this.values.set(id, values);
    }
  }

  points(id: string, range: TimeRange, step = false): HistoryPoint[] {
    const all = [...(this.values.get(id)?.values() ?? [])].sort((a, b) => a.time - b.time);
    const visible = all.filter((point) => point.time >= range.start && point.time <= range.end);
    if (!step || visible[0]?.time === range.start) return visible;
    const prior = all.findLast((point) => point.time < range.start);
    return prior ? [{ ...prior, time: range.start }, ...visible] : visible;
  }
}

export class ScrollHistoryController {
  readonly cache = new IntervalCache();
  readonly data = new TimelineStore();
  scale: Scale;
  loadedRange: TimeRange;
  status: "idle" | "loading" | "ready" | "error" = "idle";
  error?: string;
  private request?: AbortController;
  private requestSequence = 0;
  private readonly listeners = new Set<Listener>();

  constructor(
    scale: Scale,
    private readonly fetchHistory: FetchHistory,
    private readonly now: () => number = Date.now,
  ) {
    this.scale = scale;
    const end = now();
    this.loadedRange = { start: end - SCALE_SPANS[scale], end };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setScale(scale: Scale): Promise<void> {
    this.request?.abort();
    this.scale = scale;
    const end = this.now();
    this.loadedRange = { start: end - SCALE_SPANS[scale], end };
    this.emit();
    await this.load(this.loadedRange);
  }

  async loadInitial(): Promise<void> {
    await this.load(this.loadedRange);
  }

  async loadEarlier(): Promise<number> {
    if (this.status === "loading") return 0;
    const previousStart = this.loadedRange.start;
    const start = previousStart - SCALE_SPANS[this.scale];
    if (!Number.isFinite(start)) return 0;
    const current = await this.load({ start, end: previousStart });
    if (current) {
      this.loadedRange = { start, end: this.loadedRange.end };
      this.emit();
      return previousStart - start;
    }
    return 0;
  }

  async retry(): Promise<void> {
    await this.load(this.loadedRange);
  }

  private async load(range: TimeRange): Promise<boolean> {
    this.request?.abort();
    const request = new AbortController();
    const sequence = ++this.requestSequence;
    this.request = request;
    const missing = this.cache.missing(range).flatMap(splitBounded);
    if (missing.length === 0) {
      this.status = "ready";
      this.error = undefined;
      this.emit();
      return sequence === this.requestSequence;
    }
    this.status = "loading";
    this.error = undefined;
    this.emit();
    try {
      for (const chunk of missing) {
        const batch = await this.fetchHistory(chunk, request.signal);
        if (request.signal.aborted) throw new DOMException("superseded", "AbortError");
        this.data.merge(batch);
        this.cache.add(chunk);
      }
      if (sequence !== this.requestSequence) return false;
      this.status = "ready";
    } catch (error) {
      if (request.signal.aborted || sequence !== this.requestSequence) return false;
      this.status = "error";
      this.error = error instanceof Error ? error.message : "History unavailable";
    }
    this.emit();
    return sequence === this.requestSequence && this.status === "ready";
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
