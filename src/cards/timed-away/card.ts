import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { registerCard, splitAction, type HomeAssistant, type LovelaceCardEditor } from "../../shared/home-assistant";
import {
  authoritativeMode,
  durationLabel,
  endLabel,
  minutesToSlider,
  parseTimedAwayConfig,
  sliderToMinutes,
  type TimedAwayMode,
  type TimedAwayCardConfig,
} from "./model";

const ELEMENT = "alx-timed-away-card";
const PRESETS = [60, 240, 510] as const;

@customElement(ELEMENT)
export class TimedAwayCard extends LitElement {
  static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("alx-timed-away-card-editor") as LovelaceCardEditor;
  }

  static getStubConfig(): Record<string, unknown> {
    return {
      type: "custom:alx-timed-away-card",
      title: "Away",
      start_action: "script.example_apply_timed_away",
      cancel_action: "script.example_cancel_timed_away",
      mode_entity: "sensor.example_away_control",
      mode_attribute: "mode",
      ends_at_entity: "timer.example_timed_away",
      ends_at_attribute: "finishes_at",
    };
  }

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: TimedAwayCardConfig;
  @state() private open = false;
  @state() private selectedMinutes = 510;
  @state() private busy?: "apply" | "cancel";
  @state() private error?: string;

  setConfig(input: unknown): void { this.config = parseTimedAwayConfig(input); }

  protected render() {
    if (!this.config) return nothing;
    const mode = this.hass ? authoritativeMode(this.config, this.hass.states) : "mismatch";
    const endState = this.config.ends_at_entity ? this.hass?.states[this.config.ends_at_entity] : undefined;
    const endsAt = this.config.ends_at_attribute
      ? endState?.attributes[this.config.ends_at_attribute]
      : endState?.state;
    return html`
      <ha-card>
        <div class="summary" data-mode=${mode}>
          <div class="icon" aria-hidden="true">⌂</div>
          <div class="copy">
            <h2>${this.config.title}</h2>
            <span role=${mode === "fault" || mode === "mismatch" ? "alert" : nothing}>${this.statusText(mode, endsAt)}</span>
          </div>
          ${this.renderSummaryAction(mode)}
        </div>
        ${this.error && !this.open ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      </ha-card>
      ${this.open ? this.renderSheet() : nothing}
    `;
  }

  private renderSheet() {
    return html`
      <div class="backdrop" @click=${() => { if (this.busy === undefined) this.open = false; }}></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="away-title">
        <div class="grab"></div>
        <h3 id="away-title">How long are you away?</h3>
        <div class="presets" role="group" aria-label="Away duration presets">
          ${PRESETS.map((minutes) => html`
            <button aria-pressed=${String(this.selectedMinutes === minutes)} @click=${() => this.choose(minutes)}>${durationLabel(minutes)}</button>
          `)}
        </div>
        <label for="duration">Choose approximately</label>
        <input id="duration" type="range" min="0" max="100" step="1"
          .value=${String(minutesToSlider(this.selectedMinutes))}
          @input=${(inputEvent: Event) => { this.selectedMinutes = sliderToMinutes(Number((inputEvent.target as HTMLInputElement).value)); }}>
        <div class="readout"><strong>${durationLabel(this.selectedMinutes)}</strong><span>until ${endLabel(this.selectedMinutes)}</span></div>
        <div class="actions">
          <button class="dismiss" ?disabled=${this.busy !== undefined} @click=${() => { this.open = false; }}>Cancel</button>
          <button class="apply" ?disabled=${this.busy !== undefined} @click=${this.apply}>${this.busy === "apply" ? "Applying…" : "Apply away"}</button>
        </div>
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      </section>
    `;
  }

  private choose(minutes: number): void { this.selectedMinutes = minutes; }

  private statusText(mode: TimedAwayMode, endsAt: unknown): string {
    if (mode === "schedule") return "Heating follows its schedule";
    if (mode === "applying-away") return "Applying away and confirming heating";
    if (mode === "away") return `Away until ${this.formatEndsAt(endsAt)}`;
    if (mode === "restoring") return "Restoring heating schedule";
    if (mode === "fault") return "Away control fault · resume schedule";
    return "Heating state mismatch · resume schedule";
  }

  private renderSummaryAction(mode: TimedAwayMode) {
    if (mode === "schedule") {
      return html`<button class="open" @click=${() => { this.error = undefined; this.open = true; }}>Set away</button>`;
    }
    if (mode === "restoring") return html`<span class="working" aria-live="polite">Restoring…</span>`;
    const label = this.busy === "cancel"
      ? mode === "away" ? "Cancelling…" : "Resuming…"
      : mode === "away" ? "Cancel" : "Resume schedule";
    return html`<button class="cancel" aria-busy=${String(this.busy === "cancel")} ?disabled=${this.busy !== undefined} @click=${this.cancel}>${label}</button>`;
  }

  private apply = async (): Promise<void> => {
    if (!this.hass || !this.config || this.busy !== undefined) return;
    this.busy = "apply";
    this.error = undefined;
    try {
      const [domain, service] = splitAction(this.config.start_action);
      await this.hass.callService(domain, service, {
        ...this.config.start_data,
        [this.config.duration_field]: this.selectedMinutes,
      });
      this.open = false;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Away mode could not be applied";
    } finally {
      this.busy = undefined;
    }
  };

  private cancel = async (): Promise<void> => {
    if (!this.hass || !this.config || this.busy !== undefined) return;
    this.busy = "cancel";
    this.error = undefined;
    try {
      const [domain, service] = splitAction(this.config.cancel_action);
      await this.hass.callService(domain, service, this.config.cancel_data);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Away mode could not be cancelled";
    } finally {
      this.busy = undefined;
    }
  };

  private formatEndsAt(value: unknown): string {
    if (typeof value !== "string") return "the saved end time";
    if (!value || ["unknown", "unavailable"].includes(value)) return "the saved end time";
    const date = new Date(value);
    return Number.isFinite(date.valueOf())
      ? date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
      : value;
  }

  getCardSize(): number { return 2; }

  static styles = css`
    :host { display:block; font-family:var(--ha-card-header-font-family,system-ui,sans-serif); color:var(--primary-text-color,#f5f5f5); }
    * { box-sizing:border-box; }
    ha-card { display:block; background:var(--card-background-color,#171717); }
    .summary { display:grid; grid-template-columns:42px minmax(0,1fr) auto; gap:11px; align-items:center; padding:13px; }
    .icon { display:grid; place-items:center; width:42px; height:42px; border-radius:13px; color:#161616; background:var(--primary-color,#ff9f32); font-size:24px; font-weight:800; }
    h2,h3,p { margin:0; }
    h2 { font-size:17px; }
    .copy span { display:block; margin-top:3px; color:var(--secondary-text-color,#aaa); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    button { min-height:40px; border:1px solid var(--divider-color,#444); border-radius:10px; padding:0 13px; color:inherit; background:transparent; font:inherit; font-weight:600; }
    .open,.apply { color:#151515; border-color:var(--primary-color,#ff9f32); background:var(--primary-color,#ff9f32); }
    .cancel { color:var(--warning-color,#ffb74d); }
    .working { color:var(--secondary-text-color,#aaa); font-size:12px; font-weight:600; }
    .summary[data-mode="fault"] .icon,.summary[data-mode="mismatch"] .icon { color:#fff; background:var(--error-color,#d93025); }
    .summary[data-mode="applying-away"] .icon,.summary[data-mode="restoring"] .icon { color:var(--primary-text-color,#fff); background:var(--secondary-background-color,#454545); }
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
      .summary[data-mode="fault"],.summary[data-mode="mismatch"] { grid-template-columns:42px minmax(0,1fr); align-items:start; }
      .summary[data-mode="fault"] .copy span,.summary[data-mode="mismatch"] .copy span { overflow:visible; white-space:normal; }
      .summary[data-mode="fault"] .cancel,.summary[data-mode="mismatch"] .cancel { grid-column:2; width:100%; }
    }
    @media (min-width:600px) { .sheet { bottom:24px; border-radius:22px; } }
  `;
}

registerCard(ELEMENT, "ALX Timed Away", "Temporarily pause heating with quick, approximate duration selection");
