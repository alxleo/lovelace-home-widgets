import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { live } from "lit/directives/live.js";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../shared/home-assistant";
import { available, capabilities, confirmed, finite, lightCommand, readbackFingerprint, whiteBounds, type LightChange } from "./model";
import { whiteKelvin, whitePosition } from "./white-scale";

/** A single white-tone control, composed into Bubble's documented module surface. */
@customElement("alx-white-tone-slider")
export class WhiteToneSlider extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() label = "White";
  @state() private draft?: number;
  @state() private error?: string;
  @state() private pending?: { id: number; expected: LightChange; baseline: string; timer: ReturnType<typeof setTimeout> };
  private requestId = 0;
  constructor() {
    super();
    // This element is the event owner. Native range defaults still run, while
    // Bubble's underlying brightness/tap handlers must not receive the gesture.
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mousemove", "mouseup", "click", "dblclick", "keydown", "keyup", "input", "change"]) {
      this.addEventListener(type, (gesture) => gesture.stopPropagation());
    }
  }
  private get current() { return this.hass?.states[this.entity]; }
  private get enabled() { return available(this.current) && this.current.state === "on" && capabilities(this.current).white && !!whiteBounds(this.current); }

  private clear(): void { if (this.pending) clearTimeout(this.pending.timer); this.pending = undefined; }
  disconnectedCallback(): void { this.requestId++; this.clear(); this.draft = undefined; super.disconnectedCallback(); }
  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("entity")) { this.requestId++; this.clear(); this.draft = undefined; this.error = undefined; }
    if (!this.enabled) { this.draft = undefined; this.error = undefined; }
    const request = this.pending;
    if (!request) return;
    if (!this.enabled) this.clear();
    else if (confirmed(request.expected, this.current) && readbackFingerprint(request.expected, this.current) !== request.baseline) this.clear();
  }

  private async commit(inputEvent: Event): Promise<void> {
    const bounds = whiteBounds(this.current);
    if (!this.enabled || !bounds || !this.current || !this.hass || this.pending) return;
    const requested = whiteKelvin(Number((inputEvent.target as HTMLInputElement).value), bounds);
    this.draft = undefined;
    this.error = undefined;
    if (this.current.attributes.color_mode === "color_temp" && this.current.attributes.color_temp_kelvin === requested) return;
    const command = lightCommand(this.current, "white", requested);
    if (!command) return;
    const id = ++this.requestId;
    this.pending = { id, expected: command.expected, baseline: readbackFingerprint(command.expected, this.current), timer: setTimeout(() => {
      if (this.pending?.id === id) { this.clear(); this.error = "Not confirmed"; }
    }, 10000) };
    try { await this.hass.callService("light", command.service, { entity_id: this.entity, ...command.data }); }
    catch { if (this.pending?.id === id) { this.clear(); this.error = "Couldn’t send"; } }
  }

  protected render() {
    const bounds = whiteBounds(this.current);
    const reported = this.current?.attributes.color_mode === "color_temp" ? finite(this.current.attributes.color_temp_kelvin) : undefined;
    const position = this.draft ?? (reported !== undefined && bounds ? whitePosition(reported, bounds) : 500);
    const label = !this.enabled ? `${this.label} · ${this.current?.state === "off" ? "Off" : "Unavailable"}`
      : this.error ? `${this.label} · ${reported === undefined ? "Not reported" : `${Math.round(reported)} K`} · ${this.error}` : (this.draft !== undefined && bounds ? `${this.label} · ${whiteKelvin(this.draft, bounds)} K · preview`
        : reported === undefined ? `${this.label} · Not reported` : `${this.label} · ${Math.round(reported)} K${this.pending ? " …" : ""}`);
    const warm = bounds ? whitePosition(Math.max(bounds[0], Math.min(bounds[1], 2700)), bounds) / 10 : 65;
    return html`<div class="surface" style=${`--warm-stop:${warm}%`}>
      <input type="range" min="0" max="1000" step="1" .value=${live(String(position))}
        aria-label=${`${this.label}, white temperature, cool to warm`} aria-valuetext=${reported === undefined ? label : `${this.draft !== undefined && bounds ? whiteKelvin(this.draft, bounds) : Math.round(reported)} kelvin`}
        ?disabled=${!this.enabled || !!this.pending}
        @input=${(inputEvent: Event) => { this.error = undefined; this.draft = Number((inputEvent.target as HTMLInputElement).value); }}
        @change=${this.commit}>
      <output aria-live="polite" role=${this.error ? "alert" : "status"}>${label}</output>
    </div>${bounds ? html`<span class="sr-only">Full range ${bounds[0]} to ${bounds[1]} kelvin. Commands are sent when adjustment finishes.</span>` : nothing}`;
  }

  static styles = css`
    :host{display:block;width:100%;height:100%;min-height:44px;min-width:0;font-family:inherit}
    .surface{position:relative;height:100%;min-height:44px;border-radius:24px;overflow:hidden;background:linear-gradient(90deg,#d2e7ff 0%,#fff4df 30%,#f5bd86 var(--warm-stop),#ffa25d 100%)}
    input{appearance:none;-webkit-appearance:none;background:transparent;margin:0;width:100%;height:100%;min-height:44px;cursor:ew-resize;touch-action:pan-y;position:relative;z-index:1}
    input::-webkit-slider-thumb{appearance:none;width:4px;height:32px;border-radius:2px;background:#292929;box-shadow:0 0 0 1px #fff}
    input::-moz-range-thumb{width:4px;height:32px;border:1px solid #fff;border-radius:2px;background:#292929}
    input:focus-visible{outline:3px solid var(--primary-color,#03a9f4);outline-offset:-3px;border-radius:24px}
    input:disabled{cursor:default;opacity:.4}.surface:has(input:disabled){filter:saturate(.4)}
    output{position:absolute;inset:0 12px;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#222;font-size:14px;font-weight:600;text-shadow:0 0 3px #fff;white-space:nowrap}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  `;
}

/**
 * Called by a Bubble JavaScript module/template with its documented card/hass/entity
 * variables. Only the named white slider element is replaced. Bubble retains
 * disclosure/close ownership; no service interception or private method patching.
 */
export function installWhiteTone(card: Element, hass: HomeAssistant, entity: string, name?: string): string {
  const styles = `.bubble-sub-slider-wrapper:has(> alx-white-tone-slider) { --bubble-sub-slider-height: 44px; height: 44px; }
    .bubble-sub-slider-wrapper.is-hidden > alx-white-tone-slider { visibility: hidden; }
    .bubble-sub-slider-wrapper:has(> alx-white-tone-slider) > .bubble-sub-slider-close { min-width: 44px; min-height: 44px; }`;
  const host = card.querySelector<HTMLElement>(".bubble-sub-button-slider.white-temperature");
  if (!host) return styles;
  let control: WhiteToneSlider;
  if (host instanceof WhiteToneSlider) control = host;
  else {
    control = document.createElement("alx-white-tone-slider") as WhiteToneSlider;
    control.className = host.className;
    host.replaceWith(control);
  }
  control.entity = entity;
  const nativeName = hass.states[entity]?.attributes.friendly_name;
  control.label = name || (typeof nativeName === "string" && nativeName ? nativeName : entity);
  control.hass = hass;
  return styles;
}

declare global { interface Window { ALXHomeWidgets: { installWhiteTone: typeof installWhiteTone } } }
window.ALXHomeWidgets = { installWhiteTone };
