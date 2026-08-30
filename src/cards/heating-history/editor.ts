import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireConfigChanged, type HomeAssistant } from "../../shared/home-assistant";
import { normalizeHistoryConfig, type HeatingHistoryCardConfig } from "./config";

@customElement("alx-heating-history-card-editor")
export class HeatingHistoryEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: HeatingHistoryCardConfig & Record<string, unknown>;
  @state() private seriesText = "[]";
  @state() private error?: string;

  setConfig(config: HeatingHistoryCardConfig): void {
    const normalized = normalizeHistoryConfig(structuredClone(config));
    this.config = normalized;
    this.seriesText = JSON.stringify(normalized.series, null, 2);
  }

  protected render() {
    if (!this.config) return html``;
    return html`
      <ha-textfield label="Title" .value=${this.config.title ?? ""} @input=${this.changeTitle}></ha-textfield>
      <label>Scale
        <select .value=${this.config.default_scale} @change=${this.changeScale}>
          <option value="day">Day</option><option value="week">Week</option>
        </select>
      </label>
      <label>Series (JSON)
        <textarea .value=${this.seriesText} @input=${this.changeSeries}></textarea>
      </label>
      ${this.error ? html`<p role="alert">${this.error}</p>` : html``}
    `;
  }

  private changeTitle(inputEvent: Event): void {
    this.updateConfig({ title: (inputEvent.target as HTMLInputElement).value });
  }

  private changeScale(inputEvent: Event): void {
    this.updateConfig({ default_scale: (inputEvent.target as HTMLSelectElement).value as "day" | "week" });
  }

  private changeSeries(inputEvent: Event): void {
    this.seriesText = (inputEvent.target as HTMLTextAreaElement).value;
    try {
      const series = JSON.parse(this.seriesText) as HeatingHistoryCardConfig["series"];
      if (!Array.isArray(series)) throw new Error("Expected an array");
      this.error = undefined;
      this.updateConfig({ series });
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Invalid JSON";
    }
  }

  private updateConfig(change: Partial<HeatingHistoryCardConfig>): void {
    if (!this.config) return;
    try {
      const next = normalizeHistoryConfig({ ...this.config, ...change });
      this.config = next;
      this.error = undefined;
      fireConfigChanged(this, next);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Invalid configuration";
    }
  }

  static styles = css`
    :host { display:grid; gap:14px; padding:8px 0; }
    label { display:grid; gap:6px; color:var(--primary-text-color); }
    select,textarea { color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:8px; padding:10px; font:inherit; }
    textarea { min-height:220px; font-family:monospace; font-size:12px; }
    p { color:var(--error-color,#db4437); margin:0; }
  `;
}
