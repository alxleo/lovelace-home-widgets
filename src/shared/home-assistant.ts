export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HomeAssistant {
  states: Record<string, HassState>;
  callWS<T>(command: Record<string, unknown>): Promise<T>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  config?: { unit_system?: { temperature?: string } };
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: unknown): void;
}

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
      preview?: boolean;
      documentationURL?: string;
    }>;
  }
}

export const registerCard = (
  type: string,
  name: string,
  description: string,
): void => {
  window.customCards ??= [];
  if (!window.customCards.some((entry) => entry.type === type)) {
    window.customCards.push({
      type,
      name,
      description,
      preview: true,
      documentationURL: "https://github.com/alxleo/lovelace-home-widgets",
    });
  }
};

export const fireConfigChanged = (target: HTMLElement, config: unknown): void => {
  target.dispatchEvent(
    new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }),
  );
};

export const splitAction = (action: string): [string, string] => {
  const parts = action.split(".");
  if (parts.length !== 2 || parts.some((part) => !/^[a-z0-9_]+$/.test(part))) {
    throw new Error("action must use domain.service form");
  }
  return [parts[0]!, parts[1]!];
};
