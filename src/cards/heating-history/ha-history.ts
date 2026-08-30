import type { HistoryBatch, HistoryPoint, TimeRange } from "../../shared/history-model";
import type { HomeAssistant } from "../../shared/home-assistant";
import type { HeatingHistoryCardConfig, HistorySeriesConfig } from "./config";
import { seriesId } from "./config";

interface HistoryState {
  s: string;
  a?: Record<string, unknown>;
  lu: number;
}

type HistoryResponse = Record<string, HistoryState[]>;

const defaultAttribute = (series: HistorySeriesConfig): string | undefined => {
  if (series.attribute) return series.attribute;
  if (series.entity.startsWith("climate.") && series.kind === "actual_temperature") return "current_temperature";
  if (series.entity.startsWith("climate.") && series.kind === "target_temperature") return "temperature";
  if (series.entity.startsWith("climate.") && series.kind === "heating_request") return "hvac_action";
  if (series.entity.startsWith("weather.") && series.kind === "outdoor_temperature") return "temperature";
  return undefined;
};

const valueFor = (
  series: HistorySeriesConfig,
  state: string,
  attributes: Record<string, unknown>,
): number | boolean | undefined => {
  const attribute = defaultAttribute(series);
  const raw = attribute ? attributes[attribute] : state;
  if (series.kind === "heating_request") {
    if (raw === undefined || raw === null) return undefined;
    const normalized = String(raw).trim().toLowerCase();
    if (["", "unknown", "unavailable"].includes(normalized)) return undefined;
    return raw === true || ["on", "heat", "heating"].includes(normalized);
  }
  const numeric = Number.parseFloat(String(raw));
  return Number.isFinite(numeric) ? numeric : undefined;
};

const parseSeries = (series: HistorySeriesConfig, states: HistoryState[]): HistoryPoint[] => {
  let attributes: Record<string, unknown> = {};
  const result: HistoryPoint[] = [];
  for (const state of states) {
    attributes = { ...attributes, ...(state.a ?? {}) };
    const value = valueFor(series, state.s, attributes);
    if (value !== undefined) result.push({ time: state.lu * 1000, value });
  }
  return result;
};

export const fetchHistory = async (
  hass: HomeAssistant,
  config: HeatingHistoryCardConfig,
  range: TimeRange,
  signal: AbortSignal,
): Promise<HistoryBatch> => {
  // Wire contract: home-assistant/core@759e465 (2026.8.3),
  // homeassistant/components/history/websocket_api.py and its component tests.
  // `s` is state, `a` is attributes, and `lu` is last-updated epoch seconds.
  // With minimal_response, ordinary domains include `a` only on the first item,
  // while NEED_ATTRIBUTE_DOMAINS such as climate include it on every item.
  // State-only series remain correct because parseSeries reads `s` directly.
  if (signal.aborted) throw new DOMException("superseded", "AbortError");
  const entityIds = [...new Set(config.series.map((series) => series.entity))];
  if (entityIds.length === 0) return {};
  const response = await hass.callWS<HistoryResponse>({
    type: "history/history_during_period",
    start_time: new Date(range.start).toISOString(),
    end_time: new Date(range.end).toISOString(),
    entity_ids: entityIds,
    minimal_response: !config.series.some((series) => defaultAttribute(series) !== undefined),
    no_attributes: false,
  });
  if (signal.aborted) throw new DOMException("superseded", "AbortError");
  return Object.fromEntries(
    config.series.map((series) => [seriesId(series), parseSeries(series, response[series.entity] ?? [])]),
  );
};
