import type { Scale } from "../../shared/history-model";

export type HistorySeriesKind =
  | "actual_temperature"
  | "target_temperature"
  | "heating_request"
  | "outdoor_temperature"
  | "precipitation_estimate";

export interface HistorySeriesConfig {
  kind: HistorySeriesKind;
  entity: string;
  label: string;
  attribute?: string;
  color?: string;
}

export interface HeatingHistoryCardConfig {
  type: "custom:alx-heating-history-card";
  title?: string;
  default_scale: Scale;
  series: HistorySeriesConfig[];
}

const KINDS = new Set<HistorySeriesKind>([
  "actual_temperature",
  "target_temperature",
  "heating_request",
  "outdoor_temperature",
  "precipitation_estimate",
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
};

export const parseHistoryConfig = (input: unknown): HeatingHistoryCardConfig => {
  if (!isObject(input)) throw new Error("card config must be an object");
  if (input.type !== "custom:alx-heating-history-card") {
    throw new Error("type must be custom:alx-heating-history-card");
  }
  const scale = input.default_scale ?? "day";
  if (scale !== "day" && scale !== "week") throw new Error("default_scale must be day or week");
  if (!Array.isArray(input.series)) throw new Error("series must be an array");
  const series = input.series.map((raw, index): HistorySeriesConfig => {
    if (!isObject(raw) || typeof raw.kind !== "string" || !KINDS.has(raw.kind as HistorySeriesKind)) {
      throw new Error(`series[${index}].kind is unsupported`);
    }
    const entity = text(raw.entity, `series[${index}].entity`);
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entity)) {
      throw new Error(`series[${index}].entity must be a Home Assistant entity id`);
    }
    return {
      kind: raw.kind as HistorySeriesKind,
      entity,
      label: text(raw.label, `series[${index}].label`),
      attribute: raw.attribute === undefined ? undefined : text(raw.attribute, `series[${index}].attribute`),
      color: raw.color === undefined ? undefined : text(raw.color, `series[${index}].color`),
    };
  });
  return {
    type: "custom:alx-heating-history-card",
    title: input.title === undefined ? "Heating history" : text(input.title, "title"),
    default_scale: scale,
    series,
  };
};

export const normalizeHistoryConfig = (input: unknown): HeatingHistoryCardConfig & Record<string, unknown> => {
  if (!isObject(input)) throw new Error("card config must be an object");
  return { ...input, ...parseHistoryConfig(input) };
};

export const seriesId = (series: HistorySeriesConfig): string =>
  `${series.kind}:${series.entity}:${series.attribute === undefined ? "default" : `attribute:${series.attribute}`}`;
