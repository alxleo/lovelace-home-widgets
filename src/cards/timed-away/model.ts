import { splitAction } from "../../shared/home-assistant";
import type { HassState } from "../../shared/home-assistant";

export interface TimedAwayCardConfig {
  type: "custom:alx-timed-away-card";
  title: string;
  start_action: string;
  cancel_action: string;
  mode_entity: string;
  mode_attribute?: string;
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
  const startAction = required(raw.start_action, "start_action");
  const cancelAction = required(raw.cancel_action, "cancel_action");
  splitAction(startAction);
  splitAction(cancelAction);
  const modeEntity = entity(raw.mode_entity, "mode_entity");
  const endsAtEntity = raw.ends_at_entity === undefined ? undefined : entity(raw.ends_at_entity, "ends_at_entity");
  if (raw.ends_at_attribute !== undefined && !endsAtEntity) throw new Error("ends_at_attribute requires ends_at_entity");
  const durationField = raw.duration_field === undefined ? "duration_minutes" : required(raw.duration_field, "duration_field");
  if (!/^[a-z][a-z0-9_]*$/.test(durationField)) throw new Error("duration_field must be a safe service-data key");
  return {
    type: "custom:alx-timed-away-card",
    title: raw.title === undefined ? "Away" : required(raw.title, "title"),
    start_action: startAction,
    cancel_action: cancelAction,
    mode_entity: modeEntity,
    mode_attribute: raw.mode_attribute === undefined ? undefined : required(raw.mode_attribute, "mode_attribute"),
    ends_at_entity: endsAtEntity,
    ends_at_attribute: raw.ends_at_attribute === undefined ? undefined : required(raw.ends_at_attribute, "ends_at_attribute"),
    duration_field: durationField,
    start_data: object(raw.start_data, "start_data"),
    cancel_data: object(raw.cancel_data, "cancel_data"),
  };
};

const ANCHORS = [
  { position: 0, minutes: 30 },
  { position: 35, minutes: 240 },
  { position: 60, minutes: 510 },
  { position: 80, minutes: 1440 },
  { position: 100, minutes: 2880 },
] as const;

export const sliderToMinutes = (position: number): number => {
  const clamped = Math.min(100, Math.max(0, position));
  const upper = ANCHORS.find((anchor) => anchor.position >= clamped) ?? ANCHORS.at(-1)!;
  const index = ANCHORS.indexOf(upper);
  const lower = ANCHORS[Math.max(0, index - 1)]!;
  if (upper.position === lower.position) return upper.minutes;
  const ratio = (clamped - lower.position) / (upper.position - lower.position);
  return Math.round((lower.minutes + ratio * (upper.minutes - lower.minutes)) / 6) * 6;
};

export const minutesToSlider = (minutes: number): number => {
  const clamped = Math.min(2880, Math.max(30, minutes));
  const upper = ANCHORS.find((anchor) => anchor.minutes >= clamped) ?? ANCHORS.at(-1)!;
  const index = ANCHORS.indexOf(upper);
  const lower = ANCHORS[Math.max(0, index - 1)]!;
  if (upper.minutes === lower.minutes) return upper.position;
  return Math.round(lower.position + ((clamped - lower.minutes) / (upper.minutes - lower.minutes)) * (upper.position - lower.position));
};

export const durationLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
};

export const endLabel = (minutes: number, now = Date.now()): string => {
  const end = new Date(now + minutes * 60_000);
  return end.toLocaleString(undefined, {
    weekday: end.getDate() !== new Date(now).getDate() ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
};

export type TimedAwayMode = "schedule" | "applying-away" | "away" | "restoring" | "fault" | "mismatch";

const normalizeMode = (value: unknown): TimedAwayMode => {
  if (typeof value !== "string") return "mismatch";
  const normalized = value.trim().toLowerCase().replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ");
  if (normalized === "schedule") return "schedule";
  if (normalized === "applying away") return "applying-away";
  if (normalized === "away") return "away";
  if (normalized === "restoring") return "restoring";
  if (normalized === "fault") return "fault";
  return "mismatch";
};

export const authoritativeMode = (
  config: TimedAwayCardConfig,
  states: Record<string, HassState>,
): TimedAwayMode => {
  const modeState = states[config.mode_entity];
  const raw = config.mode_attribute ? modeState?.attributes[config.mode_attribute] : modeState?.state;
  const mode = normalizeMode(raw);
  const timerState = config.ends_at_entity ? states[config.ends_at_entity]?.state.toLowerCase() : undefined;
  if (config.ends_at_entity && mode === "schedule" && timerState !== "idle") return "mismatch";
  if (config.ends_at_entity && mode === "away" && timerState !== "active") return "mismatch";
  return mode;
};
