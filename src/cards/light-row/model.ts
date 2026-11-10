import type { HassState } from "../../shared/home-assistant";

export interface LightRowConfig {
  type: "custom:alx-light-row-card";
  entity: string;
  name?: string;
  name_prefix?: string;
  cards?: Record<string, unknown>[];
  expanded?: boolean;
  icon?: string;
  group: boolean;
  scene_entity?: string;
}

export const parseLightRowConfig = (input: unknown): LightRowConfig => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("light row config must be an object");
  const raw = input as Record<string, unknown>;
  if (raw.type !== "custom:alx-light-row-card") throw new Error("type must be custom:alx-light-row-card");
  if (typeof raw.entity !== "string" || !/^light\.[a-z0-9_]+$/.test(raw.entity)) throw new Error("entity must be a light entity id");
  if (raw.group !== undefined && typeof raw.group !== "boolean") throw new Error("group must be true or false");
  if (raw.scene_entity !== undefined && (raw.group !== true || typeof raw.scene_entity !== "string" || !/^select\.[a-z0-9_]+$/.test(raw.scene_entity))) throw new Error("scene_entity requires an explicit group row and a native select entity");
  if (raw.cards !== undefined && (raw.group !== true || !Array.isArray(raw.cards) || raw.cards.some((card) => !card || typeof card !== "object" || typeof card.type !== "string"))) throw new Error("cards requires an explicit group and native card configurations");
  if (raw.expanded !== undefined && typeof raw.expanded !== "boolean") throw new Error("expanded must be true or false");
  for (const field of ["name", "name_prefix", "icon"] as const) if (raw[field] !== undefined && (typeof raw[field] !== "string" || !raw[field].trim())) throw new Error(`${field} must be non-empty text`);
  return { type: "custom:alx-light-row-card", entity: raw.entity, name: raw.name as string | undefined, name_prefix: raw.name_prefix as string | undefined, cards: raw.cards as Record<string, unknown>[] | undefined, expanded: raw.expanded as boolean | undefined, icon: raw.icon as string | undefined, group: raw.group === true, scene_entity: raw.scene_entity as string | undefined };
};

export const finite = (raw: unknown): number | undefined => {
  if (typeof raw !== "number" && typeof raw !== "string" || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};
const COLOR_MODES = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);
export const capabilities = (state?: HassState) => {
  const modes = Array.isArray(state?.attributes.supported_color_modes) ? state.attributes.supported_color_modes as string[] : [];
  const color = modes.some((mode) => COLOR_MODES.has(mode));
  const white = modes.includes("color_temp");
  return { color, white, brightness: color || white || modes.some((mode) => ["brightness", "white"].includes(mode)), icon: color ? "mdi:palette" : white ? "mdi:thermometer" : "mdi:lightbulb-outline" };
};
export const available = (state?: HassState): state is HassState & { state: "on" | "off" } => !!state && ["on", "off"].includes(state.state);
export const brightness = (state?: HassState): number | undefined => {
  if (!available(state)) return undefined;
  if (state.state === "off") return 0;
  const value = finite(state.attributes.brightness);
  return value === undefined ? undefined : Math.max(0, Math.min(100, value * 100 / 255));
};
export const whiteBounds = (state?: HassState): [number, number] | undefined => {
  const minimum = finite(state?.attributes.min_color_temp_kelvin);
  const maximum = finite(state?.attributes.max_color_temp_kelvin);
  return minimum !== undefined && maximum !== undefined && minimum > 0 && maximum > minimum ? [minimum, maximum] : undefined;
};
export const hsColor = (state?: HassState): [number, number] | undefined => {
  const raw = state?.attributes.hs_color;
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const hue = finite(raw[0]); const saturation = finite(raw[1]);
  return hue !== undefined && saturation !== undefined && hue >= 0 && hue <= 360 && saturation >= 0 && saturation <= 100 ? [hue, saturation] : undefined;
};
export const hueLabel = (hue: number): string => ["Red", "Orange", "Yellow", "Lime", "Green", "Teal", "Cyan", "Sky blue", "Blue", "Purple", "Magenta", "Pink"][Math.round(hue / 30) % 12]!;
export type LightChange = { kind: "power"; value: "on" | "off" } | { kind: "brightness"; value: number } | { kind: "white"; value: number } | { kind: "color"; value: [number, number] };
export interface LightCommand { service: "turn_on" | "turn_off"; data: Record<string, unknown>; expected: LightChange }
export const lightCommand = (state: HassState, kind: "power" | "brightness" | "white" | "hue" | "saturation", value?: number): LightCommand | undefined => {
  if (!available(state)) return undefined;
  const caps = capabilities(state);
  if (kind === "power") {
    const next = state.state === "on" ? "off" : "on";
    return { service: next === "on" ? "turn_on" : "turn_off", data: {}, expected: { kind: "power", value: next } };
  }
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (kind === "brightness" && caps.brightness) {
    const requested = Math.round(Math.max(0, Math.min(100, value)));
    return { service: requested === 0 ? "turn_off" : "turn_on", data: requested === 0 ? {} : { brightness_pct: requested }, expected: { kind: "brightness", value: requested } };
  }
  const bounds = whiteBounds(state);
  if (kind === "white" && caps.white && bounds) {
    const requested = Math.round(Math.max(bounds[0], Math.min(bounds[1], value)));
    return { service: "turn_on", data: { color_temp_kelvin: requested }, expected: { kind: "white", value: requested } };
  }
  if (caps.color && ["hue", "saturation"].includes(kind)) {
    const current = hsColor(state);
    if (kind === "saturation" && !current) return undefined;
    // Choosing a colour should be visible when the previous colour is unknown
    // or completely desaturated. A known non-zero strength is retained.
    const requested: [number, number] = kind === "hue"
      ? [Math.max(0, Math.min(359, value)), current && current[1] > 0 ? current[1] : 100]
      : [current![0], Math.max(0, Math.min(100, value))];
    return { service: "turn_on", data: { hs_color: requested }, expected: { kind: "color", value: requested } };
  }
  return undefined;
};
export const confirmed = (expected: LightChange, state?: HassState): boolean => {
  if (!available(state)) return false;
  if (expected.kind === "power") return state.state === expected.value;
  if (expected.kind === "brightness") return expected.value === 0 ? state.state === "off" : state.state === "on" && Math.abs((brightness(state) ?? -100) - expected.value) <= 1;
  if (state.state !== "on") return false;
  if (expected.kind === "white") return Math.abs((finite(state.attributes.color_temp_kelvin) ?? -10000) - expected.value) <= 100 && (!state.attributes.color_mode || state.attributes.color_mode === "color_temp");
  const current = hsColor(state);
  if (!current || state.attributes.color_mode === "color_temp") return false;
  const difference = Math.abs(current[0] - expected.value[0]);
  return Math.min(difference, 360 - difference) <= 4 && Math.abs(current[1] - expected.value[1]) <= 4;
};

export const readbackFingerprint = (expected: LightChange, state?: HassState): string => JSON.stringify([
  state?.state,
  ...(expected.kind === "brightness" ? [state?.attributes.brightness] : []),
  ...(expected.kind === "white" ? [state?.attributes.color_mode, state?.attributes.color_temp_kelvin] : []),
  ...(expected.kind === "color" ? [state?.attributes.color_mode, state?.attributes.hs_color] : []),
]);

export const displayLightName = (raw: string, prefix?: string): string => {
  const normalized = raw.replaceAll("_", " ");
  const relative = prefix && normalized.toLowerCase().startsWith(prefix.toLowerCase()) ? normalized.slice(prefix.length) : normalized;
  const displayName = relative.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  if (/^\d+$/.test(displayName)) return `Light ${displayName}`;
  return displayName ? displayName[0]!.toUpperCase() + displayName.slice(1) : raw;
};
