import type { HassState } from "../../shared/home-assistant";
import type { HistoryPoint } from "../../shared/history-model";
import { seriesId, type HistorySeriesConfig } from "./config";

export interface HistoryRoom {
  id: string;
  label: string;
  series: HistorySeriesConfig[];
  climate?: string;
  target?: HistorySeriesConfig;
}

export const historyRooms = (series: HistorySeriesConfig[]): HistoryRoom[] => {
  const rooms = new Map<string, HistoryRoom>();
  for (const item of series) {
    if (!["actual_temperature", "target_temperature", "heating_request"].includes(item.kind)) continue;
    const id = item.room ?? item.entity;
    const room = rooms.get(id) ?? { id, label: item.room ?? item.label, series: [] };
    if (item.kind === "actual_temperature") room.label = item.room ?? item.label;
    room.series.push(item);
    rooms.set(id, room);
  }
  return [...rooms.values()].map((room) => {
    const targets = [...new Map(room.series.filter((item) => item.kind === "target_temperature").map((item) => [seriesId(item), item])).values()];
    if (targets.length === 1) {
      room.target = targets[0];
      if (room.target!.entity.startsWith("climate.") && (!room.target!.attribute || room.target!.attribute === "temperature")) room.climate = room.target!.entity;
    }
    return room;
  });
};

export const finiteNumber = (input: unknown): number | undefined => {
  if (typeof input !== "number" && typeof input !== "string") return undefined;
  if (typeof input === "string" && input.trim() === "") return undefined;
  const number = Number(input);
  return Number.isFinite(number) ? number : undefined;
};

export interface TemperatureControl {
  target: number;
  minimum: number;
  maximum: number;
  step: number;
}

export const temperatureControl = (state?: HassState): TemperatureControl | undefined => {
  if (!state || ["unavailable", "unknown"].includes(state.state) || !state.entity_id.startsWith("climate.")) return undefined;
  const target = finiteNumber(state.attributes.temperature);
  const minimum = finiteNumber(state.attributes.min_temp);
  const maximum = finiteNumber(state.attributes.max_temp);
  const step = finiteNumber(state.attributes.target_temp_step);
  const features = finiteNumber(state.attributes.supported_features);
  if (target === undefined || minimum === undefined || maximum === undefined || step === undefined
    || step <= 0 || minimum >= maximum || features === undefined || (features & 1) === 0) return undefined;
  return { target, minimum, maximum, step };
};

export const nextTemperature = (control: TemperatureControl, direction: -1 | 1): number => {
  const position = (control.target - control.minimum) / control.step;
  const step = direction > 0 ? Math.floor(position + 1e-7) + 1 : Math.ceil(position - 1e-7) - 1;
  return Number(Math.min(control.maximum, Math.max(control.minimum, control.minimum + step * control.step)).toFixed(6));
};

export const temperatureExtent = (points: HistoryPoint[], fahrenheit = false): [number, number] => {
  const values = points.flatMap((point) => typeof point.value === "number" ? [point.value] : []);
  if (!values.length) return fahrenheit ? [64, 76] : [18, 24];
  let minimum = Math.floor(Math.min(...values) - 0.5);
  let maximum = Math.ceil(Math.max(...values) + 0.5);
  const span = fahrenheit ? 12 : 6;
  if (maximum - minimum < span) {
    const middle = Math.round((minimum + maximum) / 2);
    minimum = middle - span / 2;
    maximum = middle + span / 2;
  }
  return [minimum, maximum];
};

export const linearPaths = (
  points: HistoryPoint[],
  x: (time: number) => number,
  y: (value: number) => number,
  end: number,
): string[] => {
  const paths: string[] = [];
  let commands: string[] = [];
  let last: HistoryPoint | undefined;
  for (const point of points) {
    if (typeof point.value === "number") {
      commands.push(`${commands.length ? "L" : "M"} ${x(point.time)},${y(point.value)}`);
      last = point;
    } else {
      if (commands.length) paths.push(commands.join(" "));
      commands = [];
      last = undefined;
    }
  }
  if (commands.length && last && typeof last.value === "number") {
    if (last.time < end) commands.push(`L ${x(end)},${y(last.value)}`);
    paths.push(commands.join(" "));
  }
  return paths;
};
