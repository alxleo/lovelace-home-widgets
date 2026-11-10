import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { live } from "lit/directives/live.js";
import { customElement, property, state } from "lit/decorators.js";
import { registerCard, splitAction, type HomeAssistant, type LovelaceCardEditor } from "../../shared/home-assistant";
import {
  authoritativeMode, durationLabel, endLabel, formatEndTime, minutesToSlider,
  parseTimedAwayConfig, sliderToMinutes, type TimedAwayMode, type TimedAwayCardConfig,
} from "./model";

const ELEMENT = "alx-timed-away-card";
interface Pending { id: number; kind: "apply" | "cancel"; baseline: TimedAwayMode; timer: ReturnType<typeof setTimeout> }

@customElement(ELEMENT)
export class TimedAwayCard extends LitElement {
  static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("alx-timed-away-card-editor") as LovelaceCardEditor;
  }
  static getStubConfig(): Record<string, unknown> {
    return {
      type: "custom:alx-timed-away-card", title: "Away",
      start_action: "script.example_apply_timed_away", cancel_action: "script.example_cancel_timed_away",
      mode_entity: "sensor.example_away_control", mode_attribute: "mode",
      ends_at_entity: "timer.example_timed_away", ends_at_attribute: "finishes_at",
    };
  }

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: TimedAwayCardConfig;
  @state() private open = false;
  @state() private selectedMinutes = 510;
  @state() private exactMinutes = "510";
  @state() private pending?: Pending;
  @state() private error?: string;
  private requestId = 0;
  private clock?: ReturnType<typeof setInterval>;

  setConfig(input: unknown): void {
    const config = parseTimedAwayConfig(input);
    this.clearPending();
    this.config = config;
    this.choose(config.duration.default_minutes);
    this.open = false;
    this.error = undefined;
  }
  connectedCallback(): void {
    super.connectedCallback();
    this.clock = setInterval(() => { if (this.open) this.requestUpdate(); }, 30000);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.clock);
    this.clock = undefined;
    this.clearPending();
  }
  protected updated(changed: PropertyValues): void {
    if (!changed.has("hass") || !this.pending) return;
    const mode = this.mode;
    const request = this.pending;
    const applying = this.config?.intent === "pause" ? "applying-pause" : "applying-away";
    const active = this.config?.intent === "pause" ? "paused" : "away";
    if (request.kind === "apply" && (mode === applying || mode === active)) {
      this.finish(request.id); this.open = false;
    } else if (request.kind === "cancel" && (mode === "schedule" || mode === "restoring")) {
      this.finish(request.id);
    } else if ((mode === "fault" || mode === "mismatch") && mode !== request.baseline) {
      this.finish(request.id, "Heating has not confirmed the change. Check its reported state.");
    }
    if (mode !== "schedule" && !this.pending) this.open = false;
  }
  private get mode(): TimedAwayMode { return this.config && this.hass ? authoritativeMode(this.config, this.hass.states) : "mismatch"; }
  private get pause(): boolean { return this.config?.intent === "pause"; }
  private get validDuration(): boolean {
    const minutes = Number(this.exactMinutes);
    const bounds = this.config?.duration;
    return !!bounds && this.exactMinutes.trim() !== "" && Number.isInteger(minutes) && minutes >= bounds.min_minutes && minutes <= bounds.max_minutes;
  }
  private choose(minutes: number): void { this.selectedMinutes = minutes; this.exactMinutes = String(minutes); }
  private clearPending(): void { if (this.pending) clearTimeout(this.pending.timer); this.pending = undefined; }
  private finish(id: number, error?: string): void {
    if (this.pending?.id !== id) return;
    this.clearPending(); this.error = error;
  }
  private begin(kind: Pending["kind"]): number {
    const id = ++this.requestId;
    this.error = undefined;
    this.pending = { id, kind, baseline: this.mode, timer: setTimeout(() => this.finish(id, "No confirmation from heating. Check its reported state before trying again."), 10000) };
    return id;
  }

  protected render() {
    if (!this.config) return nothing;
    const mode = this.mode;
    const endState = this.config.ends_at_entity ? this.hass?.states[this.config.ends_at_entity] : undefined;
    const endsAt = this.config.ends_at_attribute ? endState?.attributes[this.config.ends_at_attribute] : endState?.state;
    const standardTitle = this.config.title === (this.pause ? "Heating" : "Away");
    const title = mode === "schedule" ? "On schedule" : mode === "away" ? "Away" : mode === "paused" ? "Heating paused"
      : mode === "applying-away" ? "Applying away" : mode === "applying-pause" ? "Applying pause" : mode === "restoring" ? "Restoring schedule" : this.config.title;
    return html`
      <ha-card>
        <div class="summary" data-mode=${mode}>
          <div class="copy">
            <h2>${standardTitle ? title : this.config.title}</h2>
            ${standardTitle && mode === "schedule" ? nothing : html`<span role=${mode === "fault" || mode === "mismatch" ? "alert" : nothing}>${this.statusText(mode, endsAt)}</span>`}
          </div>
          ${this.renderSummaryAction(mode)}
        </div>
        ${this.open && mode === "schedule" ? this.renderPicker() : nothing}
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      </ha-card>
    `;
  }

  private renderPicker() {
    const duration = this.config!.duration;
    return html`
      <section class="picker" id="duration-picker" aria-label=${this.pause ? "Pause duration" : "Away duration"} @keydown=${(keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape" && !this.pending) { this.open = false; this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(".open")?.focus()); }
      }}>
        <div class="presets" role="group" aria-label=${this.pause ? "Pause duration presets" : "Away duration presets"}>
          ${duration.presets.map((minutes) => html`<button ?disabled=${!!this.pending} aria-pressed=${String(this.validDuration && this.selectedMinutes === minutes)} @click=${() => this.choose(minutes)}>${durationLabel(minutes)}</button>`)}
        </div>
        ${this.pause ? nothing : html`<label for="duration">Choose approximately</label>
          <input id="duration" type="range" min="0" max="100" step="0.1" ?disabled=${!!this.pending}
            aria-valuetext=${durationLabel(this.selectedMinutes)}
            .value=${live(String(minutesToSlider(this.selectedMinutes, duration)))}
            @input=${(inputEvent: Event) => this.choose(sliderToMinutes(Number((inputEvent.target as HTMLInputElement).value), duration))}>`}
        <div class="duration-entry">
          <label class="exact"><input id="exact-duration" type="number" aria-label="Exact minutes" inputmode="numeric" step="1" min=${duration.min_minutes} max=${duration.max_minutes}
            ?disabled=${!!this.pending} aria-invalid=${String(!this.validDuration)} aria-describedby=${this.validDuration ? nothing : "duration-limit"}
            .value=${live(this.exactMinutes)} @input=${(inputEvent: Event) => {
              this.exactMinutes = (inputEvent.target as HTMLInputElement).value;
              if (this.validDuration) this.selectedMinutes = Number(this.exactMinutes);
            }}><span aria-hidden="true">min</span></label>
          <span class="ends-at" aria-live="polite">${this.validDuration ? html`until<br><time>${endLabel(this.selectedMinutes, Date.now(), this.hass)}</time>` : nothing}</span>
          <button class="apply" ?disabled=${!!this.pending || !this.validDuration} @click=${this.apply}>${this.pending?.kind === "apply" ? "Confirming…" : this.pause ? "Pause heating" : "Apply away"}</button>
        </div>
        ${this.validDuration ? nothing : html`<p id="duration-limit" class="limit" role="alert">Enter whole minutes from ${duration.min_minutes} to ${duration.max_minutes}.</p>`}
      </section>
    `;
  }

  private statusText(mode: TimedAwayMode, endsAt: unknown): string {
    if (mode === "schedule") return "Heating follows its schedule";
    if (mode === "applying-away") return "Applying away and confirming heating";
    if (mode === "applying-pause") return "Applying pause and confirming heating";
    if (mode === "away" || mode === "paused") return `${mode === "away" ? "Away" : "Paused"} until ${this.formatEndsAt(endsAt)}`;
    if (mode === "restoring") return "Restoring heating schedule";
    if (mode === "fault") return `${this.pause ? "Heating" : "Away"} control fault · resume schedule`;
    return "Heating state mismatch · resume schedule";
  }
  private renderSummaryAction(mode: TimedAwayMode) {
    if (mode === "schedule") {
      return html`<button class="open" aria-expanded=${String(this.open)} aria-controls="duration-picker" ?disabled=${!!this.pending}
        @click=${() => { this.error = undefined; this.open = !this.open; }}>${this.open ? "Close" : this.pause ? "Pause heating" : "Set away"}</button>`;
    }
    if (mode === "restoring") return html`<span class="working" aria-live="polite">Restoring…</span>`;
    const active = mode === "away" || mode === "paused";
    const label = this.pending?.kind === "cancel" ? active && !this.pause ? "Cancelling…" : "Resuming…"
      : active && !this.pause ? "Cancel" : "Resume schedule";
    return html`<button class="cancel" aria-busy=${String(this.pending?.kind === "cancel")} ?disabled=${!!this.pending} @click=${this.cancel}>${label}</button>`;
  }
  private apply = async (): Promise<void> => {
    if (!this.hass || !this.config || this.pending || !this.validDuration || this.mode !== "schedule") return;
    const config = this.config;
    const id = this.begin("apply");
    try {
      const [domain, service] = splitAction(config.start_action);
      await this.hass.callService(domain, service, { ...config.start_data, [config.duration_field]: this.selectedMinutes });
    } catch (error) {
      this.finish(id, error instanceof Error ? error.message : "Heating action could not be sent");
    }
  };
  private cancel = async (): Promise<void> => {
    if (!this.hass || !this.config || this.pending) return;
    const config = this.config;
    const id = this.begin("cancel");
    try {
      const [domain, service] = splitAction(config.cancel_action);
      await this.hass.callService(domain, service, config.cancel_data);
    } catch (error) {
      this.finish(id, error instanceof Error ? error.message : "Schedule could not be resumed");
    }
  };
  private formatEndsAt(value: unknown): string {
    return typeof value === "string" && Number.isFinite(Date.parse(value)) ? formatEndTime(new Date(value), this.hass) : "the saved end time";
  }
  getCardSize(): number { return this.open ? 6 : 2; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }

  static styles = css`
    :host { display:block; font-family:var(--ha-card-header-font-family,system-ui,sans-serif); color:var(--primary-text-color,#f5f5f5); }
    * { box-sizing:border-box; }
    ha-card { display:block; background:var(--card-background-color,#171717); }
    .summary { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; padding:8px 12px; }
    h2,h3,p { margin:0; }
    h2 { font-size:16px; }
    .copy span { display:block; margin-top:3px; color:var(--secondary-text-color,#aaa); font-size:12px; }
    button { min-height:44px; border:1px solid var(--divider-color,#444); border-radius:10px; padding:0 12px; color:inherit; background:transparent; font:inherit; font-size:14px; font-weight:600; cursor:pointer; }
    .open,.apply { color:#151515; border-color:var(--primary-color,#ff9f32); background:var(--primary-color,#ff9f32); }
    .open[aria-expanded="true"] { color:inherit; border-color:var(--divider-color,#444); background:transparent; }
    .cancel { color:var(--warning-color,#ffb74d); }
    .working { color:var(--secondary-text-color,#aaa); font-size:12px; font-weight:600; }
    .summary[data-mode="fault"] h2,.summary[data-mode="mismatch"] h2 { color:var(--error-color,#ff6659); }
    .picker { display:grid; gap:8px; padding:8px 12px 12px; border-top:1px solid var(--divider-color,#444); }
    h3 { font-size:15px; margin-top:12px; }
    .presets { display:flex; flex-wrap:wrap; gap:6px; }
    .presets button { flex:1; }
    .presets button[aria-pressed="true"] { border-color:var(--primary-color,#ff9f32); background:color-mix(in srgb,var(--primary-color,#ff9f32) 18%,transparent); }
    label,.limit { color:var(--secondary-text-color,#aaa); font-size:13px; }
    input { accent-color:var(--primary-color,#ff9f32); font:inherit; }
    input[type="range"] { width:100%; min-height:44px; margin:0; }
    .duration-entry { display:grid; grid-template-columns:95px minmax(0,1fr) auto; align-items:center; gap:8px; }
    .exact { display:flex; align-items:center; border:1px solid var(--divider-color,#444); border-radius:8px; background:var(--secondary-background-color,#303030); padding-right:7px; }
    .exact span { font-size:12px; }
    input[type="number"] { min-width:0; width:100%; min-height:44px; border:0; border-radius:8px; padding:0 0 0 8px; font-size:16px; color:inherit; background:transparent; }
    .exact:has(input[aria-invalid="true"]) { border-color:var(--error-color,#ff6659); }
    .limit { font-size:12px; color:var(--error-color,#ff6659); }
    .ends-at { color:var(--secondary-text-color,#aaa); font-size:12px; line-height:1.3; }
    .ends-at time { white-space:nowrap; }
    button:disabled { opacity:.55; cursor:default; }
    button:focus-visible,input:focus-visible { outline:2px solid var(--primary-color,#ff9f32); outline-offset:2px; }
    .error { padding:0 12px 12px; color:var(--error-color,#ff6659); font-size:13px; }
    @media (max-width:420px) {
      .summary[data-mode="fault"],.summary[data-mode="mismatch"] { grid-template-columns:minmax(0,1fr); }
      .summary[data-mode="fault"] .cancel,.summary[data-mode="mismatch"] .cancel { width:100%; }
    }
  `;
}
registerCard(ELEMENT, "ALX Timed Away", "Temporary heating away or pause with inline duration selection");
