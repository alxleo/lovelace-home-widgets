import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { live } from "lit/directives/live.js";
import { customElement, property, state } from "lit/decorators.js";
import { registerCard, type HomeAssistant, type LovelaceCardEditor } from "../../shared/home-assistant";
import { available, brightness, capabilities, confirmed, displayLightName, finite, hsColor, hueLabel, lightCommand, parseLightRowConfig, readbackFingerprint, whiteBounds, type LightChange, type LightRowConfig } from "./model";

const ELEMENT = "alx-light-row-card";
type RangeKind = "brightness" | "white" | "hue" | "saturation";
interface Pending { id: number; baseline?: string; expected?: LightChange; timer: ReturnType<typeof setTimeout>; label: string }

@customElement(ELEMENT)
export class LightRowCard extends LitElement {
  static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("alx-light-row-card-editor") as LovelaceCardEditor;
  }
  static getStubConfig(): Record<string, unknown> { return { type: "custom:alx-light-row-card", entity: "light.example_ceiling" }; }
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: LightRowConfig;
  @state() private open = false;
  @state() private mode: "white" | "color" = "white";
  @state() private draft?: { kind: RangeKind; value: number };
  @state() private pending?: Pending;
  @state() private error?: string;
  private nextRequestId = 0;
  @state() private membersOpen = false;
  @state() private childCards: Array<HTMLElement & { hass?: HomeAssistant }> = [];
  @state() private childrenLoading = false;
  @state() private childrenError = false;
  private childrenGeneration = 0;

  setConfig(value: unknown): void {
    const next = parseLightRowConfig(value);
    this.clearPending(); this.error = undefined; this.draft = undefined;
    if (this.config?.entity !== next.entity) { this.open = false; this.membersOpen = next.expanded === true; }
    this.disposeChildren();
    this.config = next;
    if (this.membersOpen && this.isConnected) void this.loadChildren();
  }
  connectedCallback(): void { super.connectedCallback(); if (this.membersOpen) void this.loadChildren(); }
  disconnectedCallback(): void { this.clearPending(); this.draft = undefined; this.disposeChildren(); super.disconnectedCallback(); }
  private disposeChildren(): void {
    this.childrenGeneration += 1; this.childrenLoading = false; this.childrenError = false;
    this.childCards.forEach((card) => card.remove()); this.childCards = [];
  }
  private get memberConfigs(): Record<string, unknown>[] { return this.config?.group && (this.config.cards?.length ?? 0) > 1 ? this.config!.cards! : []; }
  private async loadChildren(): Promise<void> {
    if (!this.isConnected || !this.memberConfigs.length || !this.membersOpen || this.childrenLoading || this.childCards.length) return;
    const generation = ++this.childrenGeneration;
    this.childrenLoading = true; this.childrenError = false;
    try {
      if (!window.loadCardHelpers) throw new Error("Home Assistant card helpers unavailable");
      const helpers = await window.loadCardHelpers();
      if (!this.isConnected || generation !== this.childrenGeneration || !this.membersOpen) return;
      const cards = this.memberConfigs.map((config) => helpers.createCardElement(config));
      cards.forEach((card) => { card.hass = this.hass; });
      this.childCards = cards;
    } catch { if (generation === this.childrenGeneration) this.childrenError = true; }
    finally { if (generation === this.childrenGeneration) this.childrenLoading = false; }
  }
  private toggleMembers(): void {
    this.membersOpen = !this.membersOpen;
    if (this.membersOpen) void this.loadChildren(); else this.disposeChildren();
  }
  protected updated(changed: PropertyValues): void {
    if (!changed.has("hass")) return;
    this.childCards.forEach((card) => { card.hass = this.hass; });
    if (!available(this.entityState)) this.draft = undefined;
    if (!this.pending?.expected) return;
    const request = this.pending;
    if (confirmed(request.expected!, this.entityState) && readbackFingerprint(request.expected!, this.entityState) !== request.baseline) this.finish(request.id);
    else if (!available(this.entityState)) this.finish(request.id, "Light unavailable. Showing its reported state.");
  }
  getCardSize(): number { return (this.open ? 3 : 1) + (this.membersOpen ? this.childCards.length : 0); }
  getGridOptions() { return { columns: "full", rows: "auto" }; }
  private get entityState() { return this.config && this.hass?.states[this.config.entity]; }
  private get name(): string { return this.config?.name ?? displayLightName(String(this.entityState?.attributes.friendly_name ?? this.config?.entity ?? "Light"), this.config?.name_prefix); }
  private get reportedStatus(): string {
    const current = this.entityState;
    if (!current) return "Not found";
    if (!available(current)) return current.state === "unknown" ? "Unknown" : "Unavailable";
    if (current.state === "off") return "Off";
    const percent = brightness(current);
    return percent === undefined ? "On" : `${Math.round(percent)}%`;
  }
  private clearPending(): void { if (this.pending) clearTimeout(this.pending.timer); this.pending = undefined; }
  private finish(id: number, error?: string): void {
    if (this.pending?.id !== id) return;
    this.clearPending(); this.error = error;
  }
  private begin(label: string, expected?: LightChange): number {
    const id = ++this.nextRequestId;
    this.error = undefined;
    this.pending = { id, expected, baseline: expected ? readbackFingerprint(expected, this.entityState) : undefined, label, timer: setTimeout(() => this.finish(id, "No confirmation from the light. Showing its reported state."), 10000) };
    return id;
  }
  private async apply(kind: "power" | RangeKind, value?: number): Promise<void> {
    this.draft = undefined;
    if (!this.config || !this.hass || this.pending || !available(this.entityState)) return;
    const command = lightCommand(this.entityState, kind, value);
    if (!command) return;
    const id = this.begin(kind === "power" ? "Switching…" : kind === "brightness" ? "Adjusting brightness…" : kind === "white" ? "Adjusting white tone…" : "Adjusting colour…", command.expected);
    try { await this.hass.callService("light", command.service, { entity_id: this.config.entity, ...command.data }); }
    catch { this.finish(id, "Couldn't send the change. Showing reported state."); }
  }
  private async chooseScene(inputEvent: Event): Promise<void> {
    const option = (inputEvent.target as HTMLSelectElement).value;
    const sceneState = this.config?.scene_entity && this.hass?.states[this.config.scene_entity];
    if (!this.config?.group || !this.config.scene_entity || !this.hass || this.pending || !sceneState || !Array.isArray(sceneState.attributes.options) || !sceneState.attributes.options.includes(option)) return;
    // The selector's reported active scene remains the authority. Some native
    // selectors intentionally report unknown after lights are changed by hand.
    const id = this.begin("Requesting scene…");
    try { await this.hass.callService("select", "select_option", { entity_id: this.config.scene_entity, option }); this.finish(id); }
    catch { this.finish(id, "Couldn't request that room scene. Try again."); }
  }
  private toggleAdjust(): void {
    if (!this.open) this.mode = this.entityState?.attributes.color_mode === "color_temp" || !capabilities(this.entityState).color ? "white" : "color";
    this.open = !this.open;
  }
  private details(): void {
    if (this.config) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this.config.entity }, bubbles: true, composed: true }));
  }
  private onInput(kind: RangeKind, inputEvent: Event): void { this.draft = { kind, value: Number((inputEvent.target as HTMLInputElement).value) }; }
  private rangeValue(kind: RangeKind, reported?: number): number | undefined { return this.draft?.kind === kind ? this.draft.value : reported; }
  protected render() {
    if (!this.config) return nothing;
    const current = this.entityState;
    const caps = capabilities(current);
    const online = available(current);
    const enabled = online && !this.pending;
    const percentage = brightness(current);
    const displayPercentage = this.rangeValue("brightness", percentage);
    const icon = this.config.icon ?? this.hass?.entities?.[this.config.entity]?.icon ?? current?.attributes.icon ?? caps.icon;
    const sceneState = this.config.scene_entity && this.hass?.states[this.config.scene_entity];
    const options = sceneState && Array.isArray(sceneState.attributes.options) ? sceneState.attributes.options.filter((option): option is string => typeof option === "string") : [];
    const reportedScene = sceneState && options.includes(sceneState.state) ? sceneState.state : "";
    const canAdjust = online && (caps.color || caps.white);
    return html`<ha-card>
      <div class="line" data-state=${current?.state ?? "missing"}>
        <button class="power" ?disabled=${!enabled} aria-label=${`${current?.state === "on" ? "Turn off" : "Turn on"} ${this.name}`} title=${`${this.name}: ${this.reportedStatus}`} @contextmenu=${(inputEvent: Event) => { inputEvent.preventDefault(); inputEvent.stopPropagation(); this.details(); }} @click=${() => this.apply("power")}><ha-icon class="power-symbol" .icon=${"mdi:power"}></ha-icon><ha-icon class="capability-icon" .icon=${icon}></ha-icon></button>
        <div class="brightness-bar ${caps.brightness && online ? "dimmable" : ""}" style=${`--level:${Math.max(0, Math.min(100, displayPercentage ?? 0))}%;--fraction:${Math.max(0, Math.min(1, (displayPercentage ?? 0) / 100))}`}>
          <div class="fill" aria-hidden="true"></div>${caps.brightness && online ? html`<span class="visual-handle" aria-hidden="true"></span>` : nothing}<span class="identity" title=${`${this.name} · ${this.reportedStatus}`}><span class="entity-name">${this.name}</span><span class="reported"> · ${this.draft?.kind === "brightness" ? `${Math.round(this.draft.value)}% preview` : this.reportedStatus}${this.pending ? " …" : ""}</span></span>
          ${caps.brightness && online ? html`<input class="brightness" type="range" min="0" max="100" step="1" .value=${live(String(displayPercentage ?? 0))} ?disabled=${!enabled} aria-label=${`${this.name} brightness`} aria-valuetext=${this.draft?.kind === "brightness" ? `${Math.round(this.draft.value)}% preview` : this.reportedStatus} @input=${(inputEvent: Event) => this.onInput("brightness", inputEvent)} @change=${(inputEvent: Event) => this.apply("brightness", Number((inputEvent.target as HTMLInputElement).value))} @pointercancel=${() => { this.draft = undefined; }}>` : nothing}
        </div>
        ${options.length ? html`<select class="scene" aria-label=${`${this.name} room scene`} title=${reportedScene ? `Reported scene: ${reportedScene}` : "Choose a scene for this room"} .value=${live(reportedScene)} ?disabled=${!enabled} @change=${this.chooseScene}><option value="">Scene</option>${options.map((option) => html`<option value=${option}>${option}</option>`)}</select>` : nothing}
        ${canAdjust ? html`<button class="adjust" aria-label=${`Adjust ${this.name}`} aria-expanded=${String(this.open)} aria-controls="adjust-controls" @click=${this.toggleAdjust}>Adjust<ha-icon .icon=${this.open ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon></button>` : nothing}
        ${this.memberConfigs.length ? html`<button class="members-toggle" aria-label=${`${this.membersOpen ? "Hide" : "Show"} ${this.name} lights`} aria-expanded=${String(this.membersOpen)} aria-controls="member-controls" @click=${this.toggleMembers}><span aria-hidden="true">${this.memberConfigs.length}</span><ha-icon .icon=${this.membersOpen ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon></button>` : nothing}
      </div>
      ${this.open && online ? this.renderAdjust() : nothing}
      <span class="sr-only" role="status">${this.pending ? `${this.pending.label} Showing reported values.` : this.draft ? `${Math.round(this.draft.value)} preview` : ""}</span>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${this.membersOpen && this.memberConfigs.length ? html`<section id="member-controls" class="members" aria-label=${`${this.name} lights`}>${this.childrenLoading ? html`<p class="member-status" role="status">Loading lights…</p>` : nothing}${this.childrenError ? html`<p class="member-status" role="alert">Room controls couldn't load. <button @click=${() => this.loadChildren()}>Retry</button></p>` : nothing}${this.childCards}</section>` : nothing}
    </ha-card>`;
  }
  private renderAdjust() {
    const current = this.entityState;
    const caps = capabilities(current);
    const bounds = whiteBounds(current);
    const hs = hsColor(current);
    const white = finite(current?.attributes.color_temp_kelvin);
    const hue = this.rangeValue("hue", hs?.[0]);
    const saturation = this.rangeValue("saturation", hs?.[1]);
    return html`<section id="adjust-controls" class="adjust-controls" aria-label=${`${this.name} adjustments`}>
      ${caps.white && caps.color ? html`<div class="modes" aria-label="Light adjustment mode"><button aria-pressed=${String(this.mode === "white")} @click=${() => { this.mode = "white"; }}>White</button><button aria-pressed=${String(this.mode === "color")} @click=${() => { this.mode = "color"; }}>Colour</button></div>` : nothing}
      ${(this.mode === "white" || !caps.color) && caps.white ? bounds ? this.renderRange("white", "White tone", white, bounds[0], bounds[1], 50, (value) => `${Math.round(value)} K`) : html`<p class="unreported">White-temperature limits are not reported.</p>` : nothing}
      ${(this.mode === "color" || !caps.white) && caps.color ? html`${this.renderRange("hue", "Colour", hs?.[0], 0, 359, 1, hueLabel)}${this.renderRange("saturation", "Colour strength", hs?.[1], 0, 100, 1, (value) => `${Math.round(value)}%`, !hs, `--selected-hue:${hue ?? 0};--selected-strength:${saturation ?? 100}%`)}` : nothing}
    </section>`;
  }
  private renderRange(kind: RangeKind, label: string, reported: number | undefined, minimum: number, maximum: number, step: number, format: (value: number) => string, disabled = false, style = "") {
    const value = this.rangeValue(kind, reported);
    const text = value === undefined ? "Not reported" : `${format(value)}${this.draft?.kind === kind ? " · preview" : ""}`;
    return html`<label class="control" style=${style}><span class="control-label">${label}<output>${text}</output></span><input class=${`${kind} ${value === undefined ? "no-reading" : ""}`} type="range" min=${minimum} max=${maximum} step=${step} .value=${live(String(value ?? minimum))} ?disabled=${!!this.pending || disabled} aria-label=${`${this.name} ${label.toLowerCase()}`} aria-valuetext=${text} @input=${(inputEvent: Event) => this.onInput(kind, inputEvent)} @change=${(inputEvent: Event) => this.apply(kind, Number((inputEvent.target as HTMLInputElement).value))} @pointercancel=${() => { this.draft = undefined; }}></label>`;
  }
  static styles = css`
    :host{display:block;font-family:var(--ha-card-header-font-family,system-ui,sans-serif);color:var(--primary-text-color,#263430);--line-color:var(--divider-color,#e1e4e0);--muted:var(--secondary-text-color,#68716b);--warm:color-mix(in srgb,var(--primary-color,#ff9f32) 46%,var(--card-background-color,#fff));--surface:color-mix(in srgb,var(--primary-text-color,#263430) 10%,var(--card-background-color,#fff))}
    *{box-sizing:border-box}ha-card{display:block;border:0;box-shadow:none;background:transparent;border-radius:0;padding:0;position:relative}button,select{font:inherit;color:inherit;border:0;background:transparent;border-radius:10px;min-height:44px;cursor:pointer;touch-action:manipulation}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--primary-color,#438067);outline-offset:2px}button:disabled,select:disabled{cursor:default;opacity:.5}.line{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto auto;align-items:center;gap:6px;min-height:52px}.power{height:44px;width:44px;padding:9px;position:relative;background:var(--surface);display:grid;place-items:center}.power .power-symbol{--mdc-icon-size:23px}.power .capability-icon{--mdc-icon-size:11px;position:absolute;right:2px;bottom:2px}.line[data-state=on] .power{background:var(--warm)}.brightness-bar{height:44px;border-radius:20px;position:relative;min-width:0;overflow:hidden;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-color)}.fill{position:absolute;inset:0 auto 0 0;width:var(--level);background:var(--warm);border-radius:inherit;pointer-events:none}.identity{position:absolute;inset:0;display:flex;align-items:center;padding:0 11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:600;z-index:2;pointer-events:none}.entity-name{min-width:0;overflow:hidden;text-overflow:ellipsis}.reported{font-weight:500;flex-shrink:0}.visual-handle{position:absolute;top:50%;left:calc(10px + (100% - 20px)*var(--fraction));transform:translate(-50%,-50%);width:19px;height:19px;border-radius:50%;background:var(--card-background-color,#fff);border:1px solid color-mix(in srgb,var(--primary-text-color,#263430) 55%,var(--card-background-color,#fff));box-shadow:0 1px 3px #0003;pointer-events:none;z-index:0}.line[data-state=unavailable] .identity,.line[data-state=unknown] .identity{color:var(--muted)}.scene{width:64px;font-size:12px;background:var(--surface);padding:0 5px}.adjust{font-size:11px;display:flex;align-items:center;gap:1px;padding:0 2px;min-width:52px}.adjust ha-icon{--mdc-icon-size:17px}.adjust[aria-expanded=true]{font-weight:650;color:var(--primary-color,#438067)}
    input[type=range]{appearance:none;-webkit-appearance:none;width:100%;margin:0;display:block;height:44px;background-size:100% 8px;background-repeat:no-repeat;background-position:center;border:0;border-radius:10px;cursor:ew-resize;touch-action:pan-y}input::-webkit-slider-runnable-track{height:8px;background:transparent;border:0}input::-moz-range-track{height:8px;background:transparent;border:0}input::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;height:22px;width:22px;border-radius:50%;background:#fff;border:1px solid #9a9f99;box-shadow:0 1px 3px #0003;margin-top:-7px}input::-moz-range-thumb{height:22px;width:22px;border-radius:50%;background:#fff;border:1px solid #9a9f99;box-shadow:0 1px 3px #0003}input.brightness{position:absolute;inset:0;z-index:1;background:transparent;border-radius:20px}input.brightness::-webkit-slider-thumb{opacity:0}input.brightness::-moz-range-thumb{opacity:0}.brightness::-webkit-slider-thumb{width:20px;height:20px;border-radius:50%;margin-top:-6px}.brightness::-moz-range-thumb{width:20px;height:20px;border-radius:50%}.no-reading::-webkit-slider-thumb{visibility:hidden}.no-reading::-moz-range-thumb{visibility:hidden}input:disabled{cursor:default;opacity:.5}.adjust-controls{padding:7px 6px 9px 46px}.modes{display:inline-flex;background:var(--surface);border-radius:12px;padding:3px;margin:0 0 6px}.modes button{min-height:40px;min-width:65px;font-size:12px;padding:0 14px}.modes button[aria-pressed=true]{background:var(--ha-card-background,var(--card-background-color,#fff));font-weight:650;box-shadow:0 1px 3px #0001}.control{display:block}.control-label{font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}.control output{font-size:11px;color:var(--muted);text-align:right}.white{background-image:linear-gradient(to right,#ffbc6c,#fff0db,#c1dcff)}.hue{background-image:linear-gradient(to right,#f33,#ff0,#0e5,#0cf,#44f,#f0c,#f33)}.saturation{background-image:linear-gradient(to right,#d9dbd8,hsl(var(--selected-hue,0) 100% 50%))}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.members-toggle{width:44px;min-width:44px;padding:5px;display:flex;align-items:center;justify-content:center;gap:1px;font-size:11px}.members-toggle ha-icon{--mdc-icon-size:21px}.members{margin:3px 0 5px 12px;padding-left:8px;border-left:1px solid var(--line-color)}.member-status{font-size:12px;color:var(--muted);margin:4px 0}.member-status button{font-size:12px}.error,.unreported{font-size:12px;color:var(--error-color,#b34032);margin:3px 0 6px;padding-left:46px}.unreported{padding-left:0;color:var(--muted)}
  `;
}
registerCard(ELEMENT, "Light row", "Compact light control with labelled inline white and colour adjustments; optional room scenes.");
