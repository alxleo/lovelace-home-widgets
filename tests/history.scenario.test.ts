import { describe, expect, it } from "vitest";
import { DAY_MS, MAX_FETCH_SPAN, ScrollHistoryController, type HistoryBatch, type TimeRange } from "../src/shared/history-model";
import { placeDirectLabel, type LabelRect } from "../src/shared/label-layout";
import { fetchHistory } from "../src/cards/heating-history/ha-history";
import { normalizeHistoryConfig, parseHistoryConfig, seriesId } from "../src/cards/heating-history/config";
import type { HomeAssistant } from "../src/shared/home-assistant";
import { localTimelineMarks } from "../src/shared/timeline-layout";
import { heldPointAt, heldStepPath, heldTrueIntervals } from "../src/cards/heating-history/geometry";

const NOW = Date.parse("2026-08-30T14:00:00Z");

describe("heating history", () => {
  it("scenario: day and week are scroll scales while older pages are bounded and cached", async () => {
    const calls: TimeRange[] = [];
    const controller = new ScrollHistoryController("day", async (range) => {
      calls.push(range);
      return {};
    }, () => NOW);
    await controller.loadInitial();
    expect(calls).toEqual([{ start: NOW - DAY_MS, end: NOW }]);
    await controller.loadEarlier();
    expect(controller.loadedRange).toEqual({ start: NOW - 2 * DAY_MS, end: NOW });
    for (let day = 0; day < 100; day += 1) await controller.loadEarlier();
    expect(controller.loadedRange.start).toBe(NOW - 102 * DAY_MS);
    await controller.setScale("week");
    expect(controller.loadedRange).toEqual({ start: NOW - 7 * DAY_MS, end: NOW });
    expect(calls.every((range) => range.end - range.start <= MAX_FETCH_SPAN)).toBe(true);
    const before = calls.length;
    await controller.loadInitial();
    expect(calls).toHaveLength(before);

    const previousTimezone = process.env.TZ;
    process.env.TZ = "Australia/Adelaide";
    try {
      const localStart = new Date(2026, 9, 3, 21, 10).getTime();
      const localEnd = new Date(2026, 9, 5, 4, 10).getTime();
      const dayMarks = localTimelineMarks({ start: localStart, end: localEnd }, "day");
      expect(dayMarks.every((time) => {
        const date = new Date(time);
        return date.getHours() % 4 === 0 && date.getMinutes() === 0;
      })).toBe(true);
      expect(dayMarks.some((time, index) => index > 0 && time - dayMarks[index - 1]! === 3 * 60 * 60 * 1000)).toBe(true);
      const weekMarks = localTimelineMarks({ start: localStart, end: localEnd }, "week");
      expect(weekMarks.every((time) => new Date(time).getHours() === 0)).toBe(true);
      expect(weekMarks.some((time, index) => index > 0 && time - weekMarks[index - 1]! === 23 * 60 * 60 * 1000)).toBe(true);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }

    let releaseEarlier!: () => void;
    let earlierStarted!: () => void;
    const held = new Promise<void>((resolve) => { releaseEarlier = resolve; });
    const started = new Promise<void>((resolve) => { earlierStarted = resolve; });
    const racing = new ScrollHistoryController("week", async (range) => {
      if (range.end === NOW - 7 * DAY_MS) {
        earlierStarted();
        await held;
      }
      return {};
    }, () => NOW);
    await racing.loadInitial();
    const earlier = racing.loadEarlier();
    await started;
    await racing.setScale("day");
    releaseEarlier();
    await earlier;
    expect(racing.loadedRange).toEqual({ start: NOW - DAY_MS, end: NOW });
  });

  it("scenario: recorder failures fail closed and retry without caching missing data", async () => {
    let fails = true;
    const controller = new ScrollHistoryController("day", async () => {
      if (fails) throw new Error("recorder unavailable");
      return { room: [{ time: NOW, value: 21 }] } satisfies HistoryBatch;
    }, () => NOW);
    await controller.loadInitial();
    expect(controller.status).toBe("error");
    expect(controller.cache.snapshot()).toEqual([]);
    fails = false;
    await controller.retry();
    expect(controller.status).toBe("ready");
    expect(controller.data.points("room", controller.loadedRange)).toEqual([{ time: NOW, value: 21 }]);
  });

  it("scenario: target and heating request remain held through transitions including true to false", () => {
    const target = [
      { time: 0, value: 18 },
      { time: 10, value: 21 },
      { time: 20, value: 19 },
    ];
    expect(heldStepPath(target, (value) => value, (time) => time, 30))
      .toBe("M 18,0 V 10 H 21 V 20 H 19 V 30");

    const request = [
      { time: 0, value: false },
      { time: 8, value: true },
      { time: 18, value: false },
    ];
    expect(heldTrueIntervals(request, 5, 25)).toEqual([{ start: 8, end: 18 }]);
    expect(heldPointAt(request, 17)?.value).toBe(true);
    expect(heldPointAt(request, 25)?.value).toBe(false);
    expect(heldTrueIntervals([{ time: 0, value: true }], 5, 25)).toEqual([{ start: 5, end: 25 }]);
  });

  it("scenario: weather and climate history use authenticated HA commands without leaking tokens", async () => {
    const config = parseHistoryConfig({
      type: "custom:alx-heating-history-card",
      series: [
        { kind: "actual_temperature", entity: "climate.example_zone_a", label: "Zone A" },
        { kind: "outdoor_temperature", entity: "weather.example_location", label: "Out" },
      ],
    });
    let command: Record<string, unknown> = {};
    const hass: HomeAssistant = {
      states: {},
      async callWS<T>(value: Record<string, unknown>): Promise<T> {
        command = value;
        return {
          "climate.example_zone_a": [
            { s: "heat", a: { current_temperature: 20.5 }, lu: (NOW - 60_000) / 1000 },
            { s: "heat", lu: NOW / 1000 },
          ],
          "weather.example_location": [{ s: "cloudy", a: { temperature: 12.5 }, lu: NOW / 1000 }],
        } as T;
      },
      async callService() { return undefined; },
    };
    const result = await fetchHistory(hass, config, { start: NOW - DAY_MS, end: NOW }, new AbortController().signal);
    expect(command).toMatchObject({ type: "history/history_during_period", minimal_response: false, no_attributes: false });
    expect(command).not.toHaveProperty("token");
    expect(Object.values(result).flat().map((point) => point.value)).toEqual([20.5, 20.5, 12.5]);

    const stateOnly = parseHistoryConfig({
      type: "custom:alx-heating-history-card",
      series: [{ kind: "precipitation_estimate", entity: "sensor.example_precipitation_estimate", label: "Rain est." }],
    });
    await fetchHistory(hass, stateOnly, { start: NOW - DAY_MS, end: NOW }, new AbortController().signal);
    expect(command).toMatchObject({ minimal_response: true, no_attributes: false });
    expect(seriesId({ kind: "precipitation_estimate", entity: "sensor.example_precipitation_estimate", label: "Default" }))
      .not.toBe(seriesId({ kind: "precipitation_estimate", entity: "sensor.example_precipitation_estimate", label: "Explicit", attribute: "state" }));

    const heatingRequest = parseHistoryConfig({
      type: "custom:alx-heating-history-card",
      series: [{ kind: "heating_request", entity: "sensor.example_heating_request", label: "Heat" }],
    });
    hass.callWS = async <T>(): Promise<T> => ({
      "sensor.example_heating_request": [
        { s: "unknown", lu: (NOW - 2 * 60_000) / 1000 },
        { s: "off", lu: (NOW - 60_000) / 1000 },
        { s: "heating", lu: NOW / 1000 },
      ],
    }) as T;
    const requestResult = await fetchHistory(hass, heatingRequest, { start: NOW - DAY_MS, end: NOW }, new AbortController().signal);
    expect(Object.values(requestResult).flat().map((point) => point.value)).toEqual([false, true]);

    const normalized = normalizeHistoryConfig({
      type: "custom:alx-heating-history-card",
      series: [],
      view_layout: { column: 2 },
      future_container_key: "preserved",
    });
    expect(normalized).toMatchObject({
      title: "Heating history",
      default_scale: "day",
      view_layout: { column: 2 },
      future_container_key: "preserved",
    });

    const occupied: LabelRect[] = [];
    const first = placeDirectLabel(90, 50, 30, 10, { left: 0, right: 120, top: 0, bottom: 100 }, occupied);
    const second = placeDirectLabel(90, 50, 30, 10, { left: 0, right: 120, top: 0, bottom: 100 }, occupied);
    expect(second.baseline).not.toBe(first.baseline);
  });
});
