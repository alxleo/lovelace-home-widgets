import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { registerCard, type HomeAssistant, type LovelaceCardEditor } from "../../shared/home-assistant";
import {
  durationLabel,
  endLabel,
  minutesToSlider,
  parsePcPowerConfig,
  pcPowerStatus,
  remainingLabel,
  sliderToMinutes,
  usageLabel,
  type PcPowerCardConfig,
  type PcPowerStatus,
} from "./model";

const ELEMENT = "alx-pc-power-card";
const DEFAULT_PRESETS = [15, 30, 60] as const;

@customElement(ELEMENT)
export class PcPowerCard extends LitElement {
  static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("alx-pc-power-card-editor") as LovelaceCardEditor;
  }

  static getStubConfig(): Record<string, unknown> {
    return {
      type: "custom:alx-pc-power-card",
      title: "PC",
      power_entity: "switch.example_pc",
      state_entity: "binary_sensor.example_pc_connected",
      timer_entity: "timer.example_pc_shutdown",
      usage_entity: "sensor.example_pc_time_on_today",
      presets: [...DEFAULT_PRESETS],
    };
  }

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: PcPowerCardConfig;
  @state() private open = false;
  @state() private selectedMinutes = 30;
  @state() private busy?: "toggle" | "apply" | "cancel";
  @state() private error?: string;

  setConfig(input: unknown): void { this.config = parsePcPowerConfig(input); }

  protected render() {
    if (!this.config) return nothing;
    const info = this.hass ? pcPowerStatus(this.config, this.hass.states) : { status: "unavailable" as PcPowerStatus, remaining: undefined };
    const usage = this.hass ? usageLabel(this.config, this.hass.states) : undefined;
    return html`
      <ha-card>
        <div class="summary" data-mode=${info.status}>
          <div class="icon" aria-hidden="true">⏻</div>
          <div class="copy">
            <h2>${this.config.title}</h2>
            <span role=${info.status === "mismatch" ? "alert" : nothing}>${this.statusText(info.status, info.remaining, usage)}</span>
          </div>
          ${this.renderSummaryActions(info.status)}
        </div>
        ${this.error && !this.open ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      </ha-card>
      ${this.open ? this.renderSheet() : nothing}
    `;
  }

  private renderSummaryActions(status: PcPowerStatus) {
    if (status === "unavailable") {
      return html`<span class="working" aria-live="polite">Unavailable</span>`;
    }
    if (status === "countdown") {
      return html`<button class="cancel" aria-busy=${String(this.busy === "cancel")} ?disabled=${this.busy !== undefined} @click=${this.cancelCountdown}>${this.busy === "cancel" ? "Cancelling…" : "Cancel"}</button>`;
    }
    if (status === "mismatch") {
      return html`<button class="cancel" ?disabled=${this.busy !== undefined} @click=${this.cancelCountdown}>Cancel timer</button>`;
    }
    const toggleLabel = this.busy === "toggle"
      ? "Working…"
      : status === "off" ? "Power on" : "Shut down";
    return html`
      ${status === "on" ? html`<button class="open" ?disabled=${this.busy !== undefined} @click=${() => { this.error = undefined; this.open = true; }}>Delay…</button>` : nothing}
      <button class=${status === "off" ? "apply" : "danger"} aria-busy=${String(this.busy === "toggle")} ?disabled=${this.busy !== undefined} @click=${this.togglePower}>${toggleLabel}</button>
    `;
  }

  private statusText(status: PcPowerStatus, remaining?: string, usage?: string): string {
    if (status === "unavailable") return "Power state is not answering";
    if (status === "off") return usage ? `Off · on ${usage}` : "Off · wake sends a magic packet";
    if (status === "countdown") {
      return remaining ? `Shutting down in ${remainingLabel(remaining)}` : "Shutting down on schedule";
    }
    if (status === "mismatch") return "Countdown pending while the PC is off";
    return usage ? `On · ${usage}` : "On";
  }

  private renderSheet() {
    const presets = this.config?.presets ?? DEFAULT_PRESETS;
    return html`
      <div class="backdrop" @click=${() => { if (this.busy === undefined) this.open = false; }}></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="pc-power-title">
        <div class="grab"></div>
        <h3 id="pc-power-title">Shut down later?</h3>
        <div class="presets" role="group" aria-label="Shutdown delay presets">
          ${presets.map((minutes) => html`
            <button aria-pressed=${String(this.selectedMinutes === minutes)} @click=${() => { this.selectedMinutes = minutes; }}>${durationLabel(minutes)}</button>
          `)}
        </div>
        <label for="delay">Choose approximately</label>
        <input id="delay" type="range" min="0" max="100" step="1"
          .value=${String(minutesToSlider(this.selectedMinutes))}
          @input=${(inputEvent: Event) => { this.selectedMinutes = sliderToMinutes(Number((inputEvent.target as HTMLInputElement).value)); }}>
        <div class="readout"><strong>${durationLabel(this.selectedMinutes)}</strong><span>shutdown at ${endLabel(this.selectedMinutes)}</span></div>
        <div class="actions">
          <button class="dismiss" ?disabled=${this.busy !== undefined} @click=${() => { this.open = false; }}>Cancel</button>
          <button class="apply" aria-busy=${String(this.busy === "apply")} ?disabled=${this.busy !== undefined} @click=${this.applyDelay}>${this.busy === "apply" ? "Setting…" : "Start countdown"}</button>
        </div>
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      </section>
    `;
  }

  private togglePower = async (): Promise<void> => {
    if (!this.hass || !this.config || this.busy !== undefined) return;
    const { status } = pcPowerStatus(this.config, this.hass.states);
    if (status !== "on" && status !== "off") return;
    this.busy = "toggle";
    this.error = undefined;
    try {
      const [domain] = this.config.power_entity.split(".");
      await this.hass.callService(domain!, status === "off" ? "turn_on" : "turn_off", {
        entity_id: this.config.power_entity,
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : "The power switch did not respond";
    } finally {
      this.busy = undefined;
    }
  };

  private applyDelay = async (): Promise<void> => {
    if (!this.hass || !this.config?.timer_entity || this.busy !== undefined) return;
    this.busy = "apply";
    this.error = undefined;
    try {
      await this.hass.callService("timer", "start", {
        entity_id: this.config.timer_entity,
        duration: this.selectedMinutes * 60,
      });
      this.open = false;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "The countdown could not be started";
    } finally {
      this.busy = undefined;
    }
  };

  private cancelCountdown = async (): Promise<void> => {
    if (!this.hass || !this.config?.timer_entity || this.busy !== undefined) return;
    this.busy = "cancel";
    this.error = undefined;
    try {
      await this.hass.callService("timer", "cancel", { entity_id: this.config.timer_entity });
    } catch (error) {
      this.error = error instanceof Error ? error.message : "The countdown could not be cancelled";
    } finally {
      this.busy = undefined;
    }
  };

  getCardSize(): number { return 2; }

  static styles = css`
    :host { display:block; font-family:var(--ha-card-header-font-family,system-ui,sans-serif); color:var(--primary-text-color,#f5f5f5); }
    * { box-sizing:border-box; }
    ha-card { display:block; background:var(--card-background-color,#171717); }
    .summary { display:grid; grid-template-columns:42px minmax(0,1fr) auto auto; gap:11px; align-items:center; padding:13px; }
    .icon { display:grid; place-items:center; width:42px; height:42px; border-radius:13px; color:#161616; background:var(--primary-color,#ff9f32); font-size:24px; font-weight:800; }
    h2,h3,p { margin:0; }
    h2 { font-size:17px; }
    .copy span { display:block; margin-top:3px; color:var(--secondary-text-color,#aaa); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    button { min-height:40px; border:1px solid var(--divider-color,#444); border-radius:10px; padding:0 13px; color:inherit; background:transparent; font:inherit; font-weight:600; }
    .apply { color:#151515; border-color:var(--primary-color,#ff9f32); background:var(--primary-color,#ff9f32); }
    .danger,.cancel { color:var(--warning-color,#ffb74d); }
    .working { color:var(--secondary-text-color,#aaa); font-size:12px; font-weight:600; }
    .summary[data-mode="off"] .icon { color:var(--secondary-text-color,#aaa); background:var(--secondary-background-color,#454545); }
    .summary[data-mode="mismatch"] .icon { color:#fff; background:var(--error-color,#d93025); }
    .summary[data-mode="countdown"] .icon { color:#151515; background:var(--warning-color,#ffb74d); }
    .backdrop { position:fixed; z-index:999; inset:0; background:rgba(0,0,0,.56); }
    .sheet { position:fixed; z-index:1000; left:0; right:0; bottom:0; display:grid; gap:15px; max-width:520px; margin:auto; padding:8px 18px calc(18px + env(safe-area-inset-bottom)); border:1px solid var(--divider-color,#444); border-radius:22px 22px 0 0; color:var(--primary-text-color,#f5f5f5); background:var(--card-background-color,#1b1b1b); box-shadow:0 -12px 36px rgba(0,0,0,.35); }
    .grab { width:36px; height:4px; margin:0 auto; border-radius:3px; background:var(--divider-color,#555); }
    h3 { font-size:20px; text-align:center; }
    .presets { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .presets button[aria-pressed="true"] { border-color:var(--primary-color,#ff9f32); background:color-mix(in srgb,var(--primary-color,#ff9f32) 18%,transparent); }
    label { color:var(--secondary-text-color,#aaa); font-size:12px; }
    input { width:100%; accent-color:var(--primary-color,#ff9f32); }
    .readout { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
    .readout strong { font-size:30px; letter-spacing:-.04em; }
    .readout span { color:var(--secondary-text-color,#aaa); }
    .actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
    button:disabled { opacity:.55; }
    .error { padding:0 13px 12px; color:var(--error-color,#ff6659); font-size:12px; }
    .sheet .error { padding:0; text-align:center; }
    @media (max-width:420px) {
      .summary[data-mode="mismatch"] { grid-template-columns:42px minmax(0,1fr); align-items:start; }
      .summary[data-mode="mismatch"] .copy span { overflow:visible; white-space:normal; }
      .summary[data-mode="mismatch"] .cancel { grid-column:2; width:100%; }
    }
    @media (min-width:600px) { .sheet { bottom:24px; border-radius:22px; } }
  `;
}

registerCard(ELEMENT, "ALX PC Power", "Wake a PC with a magic packet and shut it down now or after a delay");
