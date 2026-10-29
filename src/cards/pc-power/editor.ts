import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireConfigChanged, type HomeAssistant } from "../../shared/home-assistant";
import { parsePcPowerConfig, type PcPowerCardConfig } from "./model";

type EditableKey = "title" | "power_entity" | "state_entity" | "timer_entity" | "usage_entity" | "presets";
const FIELDS: Array<[EditableKey, string]> = [
  ["title", "Title"],
  ["power_entity", "Power switch entity (receives turn on/off)"],
  ["state_entity", "Power state entity (optional; defaults to the switch)"],
  ["timer_entity", "Shutdown timer entity (optional)"],
  ["usage_entity", "Time-on sensor entity (optional)"],
  ["presets", "Delay presets in minutes, comma separated (optional)"],
];

@customElement("alx-pc-power-card-editor")
export class PcPowerEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: PcPowerCardConfig;
  @state() private draft: Partial<Record<EditableKey, string>> = {};
  @state() private error?: string;

  setConfig(config: PcPowerCardConfig): void {
    this.config = structuredClone(config);
    this.draft = Object.fromEntries(
      FIELDS.map(([key]) => [key, key === "presets" && Array.isArray(config[key]) ? (config[key] as number[]).join(", ") : String(config[key] ?? "")]),
    ) as Partial<Record<EditableKey, string>>;
  }

  protected render() {
    if (!this.config) return html``;
    return html`${FIELDS.map(([key, label]) => html`
      <ha-textfield label=${label} .value=${this.draft[key] ?? String(this.config?.[key] ?? "")} data-key=${key} @input=${this.changed}></ha-textfield>
    `)}${this.error ? html`<p role="alert">${this.error}</p>` : html`<p>Presets stay editable in YAML for full control.</p>`}`;
  }

  private changed(inputEvent: Event): void {
    if (!this.config) return;
    const target = inputEvent.target as HTMLInputElement;
    const key = target.dataset.key as EditableKey;
    this.draft = { ...this.draft, [key]: target.value };
    try {
      const candidate: Record<string, unknown> = { ...this.config };
      for (const [draftKey, value] of Object.entries(this.draft)) {
        if (value === "") candidate[draftKey] = undefined;
        else if (draftKey === "presets") {
          candidate[draftKey] = value.split(",").map((part) => Number(part.trim())).filter(Number.isInteger);
          if (candidate[draftKey] === undefined || (candidate[draftKey] as number[]).length === 0) delete candidate[draftKey];
        } else candidate[draftKey] = value;
      }
      const parsed = parsePcPowerConfig(candidate);
      this.config = parsed;
      this.error = undefined;
      fireConfigChanged(this, parsed);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Invalid configuration";
    }
  }

  static styles = css`
    :host { display:grid; gap:12px; padding:8px 0; }
    p { margin:0; color:var(--secondary-text-color); font-size:12px; }
  `;
}
