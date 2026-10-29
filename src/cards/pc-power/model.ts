import type { HassState } from "../../shared/home-assistant";

export interface PcPowerCardConfig {
  type: "custom:alx-pc-power-card";
  title: string;
  power_entity: string;
  timer_entity?: string;
  presets?: number[];
}

const required = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
};

const entity = (value: unknown, field: string): string => {
  const result = required(value, field);
  if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(result)) throw new Error(`${field} must be an entity id`);
  return result;
};

export const parsePcPowerConfig = (input: unknown): PcPowerCardConfig => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("card config must be an object");
  const raw = input as Record<string, unknown>;
  if (raw.type !== "custom:alx-pc-power-card") throw new Error("type must be custom:alx-pc-power-card");
  const powerEntity = entity(raw.power_entity, "power_entity");
  const timerEntity = raw.timer_entity === undefined ? undefined : entity(raw.timer_entity, "timer_entity");
  let presets: number[] | undefined;
  if (raw.presets !== undefined) {
    if (!Array.isArray(raw.presets) || raw.presets.length === 0 || raw.presets.length > 6) {
      throw new Error("presets must be a non-empty list of at most 6 minute values");
    }
    presets = raw.presets.map((minutes) => {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        throw new Error("preset minutes must be whole numbers between 1 and 1440");
      }
      return minutes;
    });
  }
  return {
    type: "custom:alx-pc-power-card",
    title: raw.title === undefined ? "PC" : required(raw.title, "title"),
    power_entity: powerEntity,
    timer_entity: timerEntity,
    presets,
  };
};

export type PcPowerStatus = "unavailable" | "off" | "on" | "countdown" | "mismatch";

export interface PcPowerStatusInfo {
  status: PcPowerStatus;
  remaining?: string;
}

export const pcPowerStatus = (
  config: PcPowerCardConfig,
  states: Record<string, HassState>,
): PcPowerStatusInfo => {
  const powerState = states[config.power_entity]?.state?.trim().toLowerCase();
  if (!powerState || ["unknown", "unavailable"].includes(powerState)) return { status: "unavailable" };
  const timerState = config.timer_entity
    ? states[config.timer_entity]?.state?.trim().toLowerCase()
    : undefined;
  const timerKnown = config.timer_entity && timerState && timerState !== "unavailable";
  if (timerKnown && timerState === "active") {
    if (powerState !== "on") return { status: "mismatch", remaining: remainingOf(config, states) };
    return { status: "countdown", remaining: remainingOf(config, states) };
  }
  if (timerKnown && timerState === "paused") return { status: "mismatch" };
  if (powerState === "on") return { status: "on" };
  return { status: "off" };
};

const remainingOf = (config: PcPowerCardConfig, states: Record<string, HassState>): string | undefined => {
  if (!config.timer_entity) return undefined;
  const attributes = states[config.timer_entity]?.attributes ?? {};
  if (typeof attributes.remaining === "string" && /^\d+:\d{2}:\d{2}$/.test(attributes.remaining)) {
    return attributes.remaining;
  }
  const finishesAt = attributes.finishes_at;
  if (typeof finishesAt === "string" && Number.isFinite(Date.parse(finishesAt))) {
    const seconds = Math.max(0, Math.round((Date.parse(finishesAt) - Date.now()) / 1000));
    return formatSeconds(seconds);
  }
  return undefined;
};

export const formatSeconds = (totalSeconds: number): string => {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

export const remainingLabel = (remaining: string): string => {
  const [hours, minutes, seconds] = remaining.split(":").map(Number);
  if (hours === undefined || minutes === undefined || seconds === undefined || [hours, minutes, seconds].some(Number.isNaN)) return remaining;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

const ANCHORS = [
  { position: 0, minutes: 5 },
  { position: 30, minutes: 15 },
  { position: 60, minutes: 30 },
  { position: 80, minutes: 60 },
  { position: 100, minutes: 240 },
] as const;

export const sliderToMinutes = (position: number): number => {
  const clamped = Math.min(100, Math.max(0, position));
  const upper = ANCHORS.find((anchor) => anchor.position >= clamped) ?? ANCHORS.at(-1)!;
  const index = ANCHORS.indexOf(upper);
  const lower = ANCHORS[Math.max(0, index - 1)]!;
  if (upper.position === lower.position) return upper.minutes;
  const ratio = (clamped - lower.position) / (upper.position - lower.position);
  return Math.round((lower.minutes + ratio * (upper.minutes - lower.minutes)) / 5) * 5;
};

export const minutesToSlider = (minutes: number): number => {
  const clamped = Math.min(240, Math.max(5, minutes));
  const upper = ANCHORS.find((anchor) => anchor.minutes >= clamped) ?? ANCHORS.at(-1)!;
  const index = ANCHORS.indexOf(upper);
  const lower = ANCHORS[Math.max(0, index - 1)]!;
  if (upper.minutes === lower.minutes) return upper.position;
  return Math.round(lower.position + ((clamped - lower.minutes) / (upper.minutes - lower.minutes)) * (upper.position - lower.position));
};
