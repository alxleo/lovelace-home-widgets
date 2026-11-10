import { splitAction } from "../../shared/home-assistant";
import type { HassState, HomeAssistant } from "../../shared/home-assistant";

export interface TimedDuration {
  min_minutes: number;
  max_minutes: number;
  presets: number[];
  default_minutes: number;
}

export interface TimedAwayCardConfig {
  type: "custom:alx-timed-away-card";
  title: string;
  intent: "away" | "pause";
  duration: TimedDuration;
  start_action: string;
  cancel_action: string;
  mode_entity?: string;
  mode_attribute?: string;
  active_entity?: string;
  ends_at_entity?: string;
  ends_at_attribute?: string;
  duration_field: string;
  start_data: Record<string, unknown>;
  cancel_data: Record<string, unknown>;
}

const object = (value: unknown, field: string): Record<string, unknown> => {
  if (value === undefined) return {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error(`${field} must be an object`);
};

const required = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
};

const entity = (value: unknown, field: string): string => {
  const result = required(value, field);
  if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(result)) throw new Error(`${field} must be an entity id`);
  return result;
};

export const parseTimedAwayConfig = (input: unknown): TimedAwayCardConfig => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("card config must be an object");
  const raw = input as Record<string, unknown>;
  if (raw.type !== "custom:alx-timed-away-card") throw new Error("type must be custom:alx-timed-away-card");
  const intent = raw.intent ?? "away";
  if (intent !== "away" && intent !== "pause") throw new Error("intent must be away or pause");
  const duration = object(raw.duration, "duration");
  const min = duration.min_minutes ?? (intent === "pause" ? 1 : 30);
  const max = duration.max_minutes ?? 2880;
  const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (!whole(min) || !whole(max) || max <= min || max > 525600) throw new Error("duration bounds must be positive whole minutes with min < max <= 525600");
  const presets = duration.presets ?? (intent === "pause" ? [15, 30, 60, 120] : [60, 240, 510]);
  if (!Array.isArray(presets) || presets.length === 0 || presets.length > 6 || presets.some((value) => !whole(value) || value < min || value > max)) throw new Error("duration presets must contain 1–6 whole-minute values within bounds");
  const defaultMinutes = duration.default_minutes ?? (intent === "pause" ? 60 : 510);
  if (!whole(defaultMinutes) || defaultMinutes < min || defaultMinutes > max) throw new Error("duration default_minutes must be whole minutes within bounds");
  const startAction = required(raw.start_action, "start_action");
  const cancelAction = required(raw.cancel_action, "cancel_action");
  splitAction(startAction);
  splitAction(cancelAction);
  const modeEntity = raw.mode_entity === undefined ? undefined : entity(raw.mode_entity, "mode_entity");
  const activeEntity = raw.active_entity === undefined ? undefined : entity(raw.active_entity, "active_entity");
  if (!modeEntity && !activeEntity) throw new Error("mode_entity is required (or active_entity for v0.1.0 compatibility)");
  if (raw.mode_attribute !== undefined && !modeEntity) throw new Error("mode_attribute requires mode_entity");
  const endsAtEntity = raw.ends_at_entity === undefined ? undefined : entity(raw.ends_at_entity, "ends_at_entity");
  if (raw.ends_at_attribute !== undefined && !endsAtEntity) throw new Error("ends_at_attribute requires ends_at_entity");
  const durationField = raw.duration_field === undefined ? "duration_minutes" : required(raw.duration_field, "duration_field");
  if (!/^[a-z][a-z0-9_]*$/.test(durationField)) throw new Error("duration_field must be a safe service-data key");
  return {
    type: "custom:alx-timed-away-card",
    title: raw.title === undefined ? (intent === "pause" ? "Heating" : "Away") : required(raw.title, "title"),
    intent,
    duration: { min_minutes: min, max_minutes: max, presets: [...new Set(presets)], default_minutes: defaultMinutes },
    start_action: startAction,
    cancel_action: cancelAction,
    mode_entity: modeEntity,
    mode_attribute: raw.mode_attribute === undefined ? undefined : required(raw.mode_attribute, "mode_attribute"),
    active_entity: activeEntity,
    ends_at_entity: endsAtEntity,
    ends_at_attribute: raw.ends_at_attribute === undefined ? undefined : required(raw.ends_at_attribute, "ends_at_attribute"),
    duration_field: durationField,
    start_data: object(raw.start_data, "start_data"),
    cancel_data: object(raw.cancel_data, "cancel_data"),
  };
};

const AWAY_DURATION: TimedDuration = { min_minutes: 30, max_minutes: 2880, presets: [60, 240, 510], default_minutes: 510 };

// A logarithmic scrubber gives short durations useful space; exact input and
// presets remain exact instead of being round-tripped through a slider position.
export const sliderToMinutes = (position: number, duration: TimedDuration = AWAY_DURATION): number => {
  const fraction = Math.min(100, Math.max(0, position)) / 100;
  return Math.min(duration.max_minutes, Math.max(duration.min_minutes, Math.round(duration.min_minutes * (duration.max_minutes / duration.min_minutes) ** fraction)));
};

export const minutesToSlider = (minutes: number, duration: TimedDuration = AWAY_DURATION): number => {
  const clamped = Math.min(duration.max_minutes, Math.max(duration.min_minutes, minutes));
  return 100 * Math.log(clamped / duration.min_minutes) / Math.log(duration.max_minutes / duration.min_minutes);
};

export const durationLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
};

export const formatEndTime = (end: Date, hass?: HomeAssistant): string => {
  const clock = hass?.locale?.time_format;
  return end.toLocaleString(clock === "system" ? undefined : hass?.locale?.language, {
    weekday: "short", hour: "2-digit", minute: "2-digit",
    hourCycle: clock === "24" ? "h23" : clock === "12" ? "h12" : undefined,
    timeZone: hass?.locale?.time_zone === "server" ? hass.config?.time_zone : undefined,
  });
};

export const endLabel = (minutes: number, now = Date.now(), hass?: HomeAssistant): string => {
  const end = new Date(now + minutes * 60_000);
  return formatEndTime(end, hass);
};

export type TimedAwayMode = "schedule" | "applying-away" | "away" | "applying-pause" | "paused" | "restoring" | "fault" | "mismatch";

const normalizeMode = (value: unknown): TimedAwayMode => {
  if (typeof value !== "string") return "mismatch";
  const normalized = value.trim().toLowerCase().replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ");
  if (normalized === "schedule") return "schedule";
  if (normalized === "applying away") return "applying-away";
  if (normalized === "away") return "away";
  if (normalized === "applying pause") return "applying-pause";
  if (normalized === "paused") return "paused";
  if (normalized === "restoring") return "restoring";
  if (normalized === "fault") return "fault";
  return "mismatch";
};

export const authoritativeMode = (
  config: TimedAwayCardConfig,
  states: Record<string, HassState>,
): TimedAwayMode => {
  let mode: TimedAwayMode;
  if (config.mode_entity) {
    const modeState = states[config.mode_entity];
    const raw = config.mode_attribute ? modeState?.attributes[config.mode_attribute] : modeState?.state;
    mode = normalizeMode(raw);
  } else {
    const legacyState = config.active_entity ? states[config.active_entity]?.state.trim().toLowerCase() : undefined;
    if (legacyState && ["active", "on", "true", "1"].includes(legacyState)) mode = config.intent === "pause" ? "paused" : "away";
    else if (legacyState && ["idle", "off", "false", "0"].includes(legacyState)) mode = "schedule";
    else mode = "mismatch";
  }
  const timerState = config.ends_at_entity ? states[config.ends_at_entity]?.state.toLowerCase() : undefined;
  if (config.ends_at_entity && mode === "schedule" && timerState !== "idle") return "mismatch";
  if (config.ends_at_entity && (mode === "away" || mode === "paused") && timerState !== "active") return "mismatch";
  if (mode === "away" || mode === "paused") {
    const endState = config.ends_at_entity ? states[config.ends_at_entity] : undefined;
    const endValue = config.ends_at_attribute ? endState?.attributes[config.ends_at_attribute] : endState?.state;
    if (typeof endValue !== "string" || !Number.isFinite(Date.parse(endValue))) return "mismatch";
  }
  return mode;
};
