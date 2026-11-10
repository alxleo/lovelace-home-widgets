import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireConfigChanged, type HomeAssistant } from "../../shared/home-assistant";
import { parseTimedAwayConfig, type TimedAwayCardConfig } from "./model";

type EditableKey = "title" | "intent" | "start_action" | "cancel_action" | "mode_entity" | "mode_attribute" | "active_entity" | "ends_at_entity" | "duration_field" | "ends_at_attribute";
const FIELDS: Array<[EditableKey, string]> = [
  ["title", "Title"], ["intent", "Intent (away or pause)"], ["start_action", "Start action (domain.service)"],
  ["cancel_action", "Resume/cancel action (domain.service)"], ["mode_entity", "Authoritative mode entity"],
  ["mode_attribute", "Mode attribute (optional)"],
  ["active_entity", "Legacy v0.1.0 active entity (optional)"],
  ["ends_at_entity", "End-time entity (optional)"], ["duration_field", "Duration field"],
  ["ends_at_attribute", "End-time attribute (optional)"],
];

@customElement("alx-timed-away-card-editor")
export class TimedAwayEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: TimedAwayCardConfig;
  @state() private draft: Partial<Record<EditableKey, string>> = {};
  @state() private error?: string;

  setConfig(config: TimedAwayCardConfig): void {
    this.config = structuredClone(config);
    this.draft = Object.fromEntries(
      FIELDS.map(([key]) => [key, String(config[key] ?? "")]),
    ) as Partial<Record<EditableKey, string>>;
  }

  protected render() {
    if (!this.config) return html``;
    return html`${FIELDS.map(([key, label]) => html`
      <ha-textfield label=${label} .value=${this.draft[key] ?? String(this.config?.[key] ?? "")} data-key=${key} @input=${this.changed}></ha-textfield>
    `)}${this.error ? html`<p role="alert">${this.error}</p>` : html`<p>Duration bounds, presets and static action data remain available in YAML.</p>`}`;
  }

  private changed(inputEvent: Event): void {
    if (!this.config) return;
    const target = inputEvent.target as HTMLInputElement;
    const key = target.dataset.key as EditableKey;
    this.draft = { ...this.draft, [key]: target.value };
    try {
      const candidate: Record<string, unknown> = { ...this.config };
      for (const [draftKey, value] of Object.entries(this.draft)) candidate[draftKey] = value || undefined;
      if (key === "intent" && candidate.intent !== this.config.intent) {
        candidate.duration = undefined;
        if (["Away", "Heating"].includes(String(candidate.title))) candidate.title = undefined;
      }
      const parsed = parseTimedAwayConfig(candidate);
      this.config = parsed;
      if (key === "intent") this.draft = { ...this.draft, title: parsed.title };
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
