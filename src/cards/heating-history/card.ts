import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ScrollHistoryController, SCALE_SPANS, type HistoryPoint, type Scale, type TimeRange } from "../../shared/history-model";
import { registerCard, type HomeAssistant, type LovelaceCardEditor } from "../../shared/home-assistant";
import { localTimelineMarks } from "../../shared/timeline-layout";
import { parseHistoryConfig, seriesId, type HeatingHistoryCardConfig, type HistorySeriesConfig } from "./config";
import { fetchHistory, valueFor } from "./ha-history";
import { heldPointAt, heldStepPaths, heldTrueIntervals } from "./geometry";
import { historyRooms, linearPaths, nextTemperature, temperatureControl, temperatureExtent, type HistoryRoom } from "./rooms";

const ELEMENT = "alx-heating-history-card";
const WIDTH = 420;
const LEFT = 38;
const RIGHT = 408;
const TOP = 12;
const BOTTOM = 151;
const HEIGHT = 178;
const formatNumber = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
interface PendingTarget { id: number; target: number; timer: ReturnType<typeof setTimeout> }

@customElement(ELEMENT)
export class HeatingHistoryCard extends LitElement {
  static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("alx-heating-history-card-editor") as LovelaceCardEditor;
  }
  static getStubConfig(): HeatingHistoryCardConfig {
    return { type: "custom:alx-heating-history-card", title: "Heating", default_scale: "day", series: [], temperature_controls: false };
  }
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: HeatingHistoryCardConfig;
  @state() private controller?: ScrollHistoryController;
  @state() private revision = 0;
  @state() private window?: TimeRange;
  @state() private inspectingAt?: number;
  @state() private paging = false;
  @state() private pending: Record<string, PendingTarget> = {};
  @state() private controlErrors: Record<string, string> = {};
  private unsubscribe?: () => void;
  private nextRequestId = 0;
  private failedPage?: TimeRange;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private sourceSignature?: string;
  private readonly onVisibility = () => { if (document.visibilityState === "visible") void this.refreshLatest(); };

  setConfig(value: unknown): void {
    this.teardown();
    this.config = parseHistoryConfig(value);
  }
  connectedCallback(): void {
    super.connectedCallback();
    if (this.config && this.hass && !this.controller) this.createController();
  }
  disconnectedCallback(): void { this.teardown(); super.disconnectedCallback(); }
  protected updated(changed: PropertyValues): void {
    if ((changed.has("hass") || changed.has("config")) && this.isConnected && this.hass && this.config && !this.controller) this.createController();
    if (changed.has("hass")) {
      const signature = JSON.stringify(this.config?.series.map((item) => [this.hass?.states[item.entity]?.state, this.live(item)]));
      if (this.sourceSignature !== undefined && signature !== this.sourceSignature && this.controller) {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => { this.refreshTimer = undefined; void this.refreshLatest(); }, 5000);
      }
      this.sourceSignature = signature;
      for (const [entity, request] of Object.entries(this.pending)) {
        const control = temperatureControl(this.hass?.states[entity]);
        if (control && Math.abs(control.target - request.target) < 0.00001) this.finishPending(entity, undefined, request.id);
        else if (["unknown", "unavailable"].includes(this.hass?.states[entity]?.state ?? "unavailable")) this.finishPending(entity, "Device unavailable. Showing its reported target.", request.id);
      }
    }
  }
  private teardown(): void {
    this.unsubscribe?.(); this.unsubscribe = undefined; this.controller?.dispose(); this.controller = undefined; this.window = undefined; this.failedPage = undefined; this.paging = false; this.inspectingAt = undefined;
    clearInterval(this.refreshInterval); clearTimeout(this.refreshTimer);
    this.refreshInterval = undefined; this.refreshTimer = undefined; this.sourceSignature = undefined;
    document.removeEventListener("visibilitychange", this.onVisibility);
    Object.values(this.pending).forEach((request) => clearTimeout(request.timer));
    this.pending = {}; this.controlErrors = {};
  }
  private createController(): void {
    const controller = new ScrollHistoryController(this.config!.default_scale, (range, signal) => fetchHistory(this.hass!, this.config!, range, signal));
    this.controller = controller;
    this.window = { ...controller.loadedRange };
    this.unsubscribe = controller.subscribe(() => { this.revision += 1; });
    void controller.loadInitial();
    this.refreshInterval = setInterval(() => { void this.refreshLatest(); }, 30000);
    document.addEventListener("visibilitychange", this.onVisibility);
  }
  private async refreshLatest(): Promise<void> {
    const controller = this.controller;
    if (!controller || this.paging || document.visibilityState === "hidden") return;
    const previousEnd = controller.loadedRange.end;
    const wasLatest = this.window?.end === previousEnd;
    if (await controller.refreshLatest() && this.controller === controller && wasLatest && this.window?.end === previousEnd) {
      this.window = { start: controller.loadedRange.end - SCALE_SPANS[controller.scale], end: controller.loadedRange.end };
    }
  }
  getCardSize(): number { return 3 + historyRooms(this.config?.series ?? []).length * 4; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }
  private get unit(): string { return this.hass?.config?.unit_system?.temperature ?? "°C"; }
  private get timeZone(): string | undefined { return this.hass?.locale?.time_zone === "server" ? this.hass.config?.time_zone : undefined; }
  private formatDate(time: number, options: Intl.DateTimeFormatOptions): string {
    const locale = this.hass?.locale;
    const clock = locale?.time_format;
    const language = clock === "system" ? undefined : locale?.language;
    return new Intl.DateTimeFormat(language, {
      ...options,
      ...(options.hour ? { hourCycle: clock === "24" ? "h23" : clock === "12" ? "h12" : undefined } : {}),
      timeZone: this.timeZone,
    }).format(time);
  }
  private live(series?: HistorySeriesConfig): number | boolean | null | undefined {
    const state = series && this.hass?.states[series.entity];
    return state && series ? valueFor(series, state.state, state.attributes) : null;
  }
  private points(series: HistorySeriesConfig): HistoryPoint[] {
    return this.controller && this.window ? this.controller.data.points(seriesId(series), this.window, true) : [];
  }
  private get latest(): boolean { return !!this.window && !!this.controller && this.window.end >= this.controller.loadedRange.end; }
  private rangeLabel(): string {
    if (!this.window || !this.controller) return "Loading history…";
    if (this.latest) {
      const dates = `${this.formatDate(this.window.start, { day: "numeric", month: "short" })}–${this.formatDate(this.window.end, { day: "numeric", month: "short" })}`;
      return `${this.controller.scale === "day" ? "Last 24 hours" : "Last 7 days"} · ${dates}`;
    }
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", ...(this.controller.scale === "day" ? { hour: "2-digit", minute: "2-digit" } : {}) };
    return `${this.formatDate(this.window.start, options)} – ${this.formatDate(this.window.end, options)}`;
  }
  private async retryHistory(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    const previousEnd = controller.loadedRange.end;
    const wasLatest = this.window?.end === previousEnd;
    await controller.retry();
    if (this.controller !== controller || controller.status !== "ready") return;
    if (this.failedPage) { this.window = this.failedPage; this.failedPage = undefined; }
    else if (wasLatest && this.window?.end === previousEnd) this.window = { start: controller.loadedRange.end - SCALE_SPANS[controller.scale], end: controller.loadedRange.end };
  }
  private async changeScale(scale: Scale): Promise<void> {
    const controller = this.controller;
    if (!controller || controller.scale === scale || this.paging) return;
    this.paging = true; this.inspectingAt = undefined; this.failedPage = undefined;
    try { await controller.setScale(scale); if (this.controller === controller) this.window = { ...controller.loadedRange }; }
    finally { if (this.controller === controller) this.paging = false; }
  }
  private async page(direction: -1 | 1): Promise<void> {
    const controller = this.controller;
    if (!controller || !this.window || this.paging || (direction === 1 && this.latest)) return;
    const span = SCALE_SPANS[controller.scale];
    const next = { start: this.window.start + direction * span, end: this.window.end + direction * span };
    if (direction === 1) {
      next.end = Math.min(next.end, controller.loadedRange.end);
      if (controller.loadedRange.end - next.end < span) next.end = controller.loadedRange.end;
      next.start = next.end - span;
    }
    this.paging = true; this.inspectingAt = undefined;
    try {
      if (next.start < controller.loadedRange.start && !await controller.loadEarlier()) {
        if (this.controller === controller && controller.status === "error") this.failedPage = next;
        return;
      }
      if (this.controller !== controller) return;
      this.failedPage = undefined;
      this.window = next;
    } finally { if (this.controller === controller) this.paging = false; }
  }
  private details(entity?: string): void {
    if (entity) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: entity }, bubbles: true, composed: true }));
  }
  private finishPending(entity: string, error?: string, expectedId?: number): void {
    if (!this.pending[entity] || (expectedId !== undefined && this.pending[entity]!.id !== expectedId)) return;
    if (this.pending[entity]) clearTimeout(this.pending[entity]!.timer);
    const pending = { ...this.pending }; delete pending[entity]; this.pending = pending;
    const errors = { ...this.controlErrors }; if (error) errors[entity] = error; else delete errors[entity]; this.controlErrors = errors;
  }
  private async adjust(entity: string, direction: -1 | 1): Promise<void> {
    if (!this.config?.temperature_controls || !this.hass || this.pending[entity]) return;
    const control = temperatureControl(this.hass.states[entity]);
    if (!control) return;
    const target = nextTemperature(control, direction);
    if (target === control.target) return;
    const errors = { ...this.controlErrors }; delete errors[entity]; this.controlErrors = errors;
    const id = ++this.nextRequestId;
    this.pending = { ...this.pending, [entity]: { id, target, timer: setTimeout(() => this.finishPending(entity, "No device confirmation. Showing its reported target.", id), 10000) } };
    try { await this.hass.callService("climate", "set_temperature", { entity_id: entity, temperature: target }); }
    catch { this.finishPending(entity, "Couldn't change the target. Try again.", id); }
  }
  protected render() {
    void this.revision;
    if (!this.config) return nothing;
    if (!this.hass) return html`<ha-card><p class="message">Connecting to Home Assistant…</p></ha-card>`;
    const rooms = historyRooms(this.config.series);
    const allIndoor = rooms.flatMap((room) => room.series.filter((item) => item.kind !== "heating_request").flatMap((item) => this.points(item)));
    const extent = temperatureExtent(allIndoor, this.unit.includes("F"));
    const weatherSeries = this.config.series.filter((item) => ["outdoor_temperature", "precipitation_estimate"].includes(item.kind));
    return html`<ha-card>
      <header class="card-header"><h2>${this.config.title}</h2><div class="scale" aria-label="History period">${(["day", "week"] as const).map((scale) => html`<button ?disabled=${this.paging} aria-pressed=${String(this.controller?.scale === scale)} @click=${() => this.changeScale(scale)}>${scale === "day" ? "Day" : "Week"}</button>`)}</div></header>
      <nav class="window" aria-label="History window"><button aria-label="Earlier history" ?disabled=${this.paging || !this.controller} @click=${() => this.page(-1)}>←</button><span>${this.rangeLabel()}</span><button aria-label="Later history" ?disabled=${this.paging || this.latest} @click=${() => this.page(1)}>→</button></nav>
      <div class="key" aria-label="Chart key"><span><i class="actual-key"></i>Actual</span><span><i class="target-key"></i>Target</span><span><i class="heat-key"></i>Heat requested</span></div>
      ${this.controller?.status === "error" ? html`<div class="error" role="alert">${this.controller.error}<button @click=${() => this.retryHistory()}>Retry</button></div>` : nothing}
      <div class="rooms">${rooms.map((room) => this.renderRoom(room, extent))}</div>
      ${!rooms.length ? html`<p class="message">Add room temperature series in the visual editor.</p>` : nothing}
      ${weatherSeries.length ? html`<details class="weather"><summary><span>Outside</span><span class="weather-now">${weatherSeries.map((item) => html`<span>${item.kind === "outdoor_temperature" ? `${formatNumber(this.live(item))}${this.unit} now` : `${formatNumber(this.live(item))} mm · latest estimate`}</span>`)}</span></summary><div class="weather-charts">${weatherSeries.map((item) => html`<section><h3>${item.label}${item.kind === "precipitation_estimate" ? " · mm" : nothing}</h3>${this.renderChart([item], temperatureExtent(this.points(item)), item.kind === "precipitation_estimate" ? "mm" : this.unit, item.kind === "precipitation_estimate")}</section>`)}</div></details>` : nothing}
      ${this.controller?.status === "loading" ? html`<div class="loading" role="status">Loading history…</div>` : nothing}
    </ha-card>`;
  }
  private renderRoom(room: HistoryRoom, extent: [number, number]) {
    const actual = room.series.find((item) => item.kind === "actual_temperature");
    const target = room.target;
    const state = room.climate ? this.hass?.states[room.climate] : undefined;
    const control = temperatureControl(state);
    const pending = room.climate && this.pending[room.climate];
    const error = room.climate && this.controlErrors[room.climate];
    const status = !state && room.climate || state?.state === "unavailable" || state?.state === "unknown" ? "Unavailable" : state?.state === "off" ? "Heating off" : "";
    return html`<section class="room" data-room=${room.id}>
      <div class="room-header"><div class="room-current"><button class="room-name" @click=${() => this.details(room.climate ?? actual?.entity)} aria-label=${`${room.label} details`}>${room.label}<span aria-hidden="true"> ›</span></button><div class="now"><span>Now</span> <strong>${formatNumber(this.live(actual))}<small>${this.unit}</small></strong>${status ? html`<span class="state">${status}</span>` : nothing}</div></div>
      ${target ? html`<div class="set"><span>${pending ? "Confirming…" : "Set"}</span><div class="set-value">${this.config?.temperature_controls ? html`<button class="temperature-minus" aria-label=${`Lower ${room.label} target`} ?disabled=${!control || !!pending || control.target <= control.minimum} @click=${() => this.adjust(room.climate!, -1)}>−</button>` : nothing}<strong>${formatNumber(this.live(target))}<small>${this.unit}</small></strong>${this.config?.temperature_controls ? html`<button class="temperature-plus" aria-label=${`Raise ${room.label} target`} ?disabled=${!control || !!pending || control.target >= control.maximum} @click=${() => this.adjust(room.climate!, 1)}>+</button>` : nothing}</div></div>` : nothing}</div>
      ${error ? html`<p class="control-error" role="alert">${error}</p>` : nothing}
      ${this.renderChart(room.series, extent, this.unit)}
      <div class="inspection" aria-live="off">${this.inspectingAt === undefined ? nothing : html`<time>${this.formatDate(this.inspectingAt, { hour: "2-digit", minute: "2-digit" })}</time>${room.series.map((item) => { const value = heldPointAt(this.points(item), this.inspectingAt!)?.value; return html`<span>${item.kind === "heating_request" ? `Request: ${value === true ? "on" : value === false ? "off" : "unknown"}` : `${formatNumber(value)}° ${item.kind === "actual_temperature" ? "actual" : "set"}`}</span>`; })}`}</div>
    </section>`;
  }
  private renderChart(series: HistorySeriesConfig[], extent: [number, number], unit: string, rain = false) {
    if (!this.window) return html`<div class="chart-placeholder"></div>`;
    const range = this.window;
    if (rain) extent = [0, Math.max(1, ...series.flatMap((item) => this.points(item).flatMap((point) => typeof point.value === "number" ? [point.value] : []))) * 1.2];
    const x = (time: number) => LEFT + (time - range.start) / (range.end - range.start) * (RIGHT - LEFT);
    const y = (value: number) => BOTTOM - (value - extent[0]) / (extent[1] - extent[0]) * (BOTTOM - TOP);
    const ticks = [extent[0], (extent[0] + extent[1]) / 2, extent[1]];
    const isWeek = this.controller?.scale === "week";
    const marks = localTimelineMarks(range, isWeek ? "week" : "day", this.timeZone);
    const markStride = Math.max(1, Math.ceil(marks.length / 4));
    const visibleMarks = marks.filter((_, index) => index % markStride === 0);
    const timeLabel = (time: number) => this.formatDate(time, isWeek ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" });
    return html`<svg class="chart" viewBox=${`0 0 ${WIDTH} ${HEIGHT}`} role="img" tabindex="0" aria-label=${`${series.map((item) => item.label).join(", ")} history. Use arrow keys to inspect.`} @pointermove=${(inputEvent: PointerEvent) => { const box = (inputEvent.currentTarget as SVGElement).getBoundingClientRect(); const fraction = Math.max(0, Math.min(1, ((inputEvent.clientX - box.left) / box.width * WIDTH - LEFT) / (RIGHT - LEFT))); this.inspectingAt = range.start + fraction * (range.end - range.start); }} @pointerleave=${() => { this.inspectingAt = undefined; }} @keydown=${(inputEvent: KeyboardEvent) => { if (!["ArrowLeft", "ArrowRight", "Escape"].includes(inputEvent.key)) return; inputEvent.preventDefault(); this.inspectingAt = inputEvent.key === "Escape" ? undefined : Math.min(range.end, Math.max(range.start, (this.inspectingAt ?? range.end) + (inputEvent.key === "ArrowLeft" ? -1 : 1) * (range.end - range.start) / 48)); }}>
      ${series.filter((item) => item.kind === "heating_request").flatMap((item) => heldTrueIntervals(this.points(item), range.start, range.end).map((interval) => svg`<rect class="heat-band" x=${x(Math.max(range.start, interval.start))} y=${TOP} width=${Math.max(0, x(Math.min(range.end, interval.end)) - x(Math.max(range.start, interval.start)))} height=${BOTTOM - TOP}/>`))}
      ${ticks.map((value) => svg`<line class="grid" x1=${LEFT} x2=${RIGHT} y1=${y(value)} y2=${y(value)}/><text class="axis-text" x=${LEFT - 7} y=${y(value) + 3} text-anchor="end">${Number(value.toFixed(1))}${unit === "mm" ? "" : "°"}</text>`)}
      ${visibleMarks.map((time) => svg`<text class="axis-text" x=${x(time)} y="171" text-anchor=${x(time) < LEFT + 25 ? "start" : x(time) > RIGHT - 25 ? "end" : "middle"}>${timeLabel(time)}</text>`)}
      ${series.filter((item) => item.kind !== "heating_request").flatMap((item) => {
        const target = item.kind === "target_temperature";
        const paths = target ? heldStepPaths(this.points(item), x, y, range.end) : linearPaths(this.points(item), x, y, range.end);
        return paths.map((path) => svg`<path class=${target ? "target-line" : item.kind === "actual_temperature" ? "actual-line" : "weather-line"} stroke=${item.color ?? (target ? "#858d88" : item.kind === "actual_temperature" ? "#d46f32" : "#5489a5")} d=${path}/>`);
      })}
      ${!series.some((item) => item.kind !== "heating_request" && this.points(item).some((point) => typeof point.value === "number")) ? svg`<text class="empty-chart" x=${(LEFT + RIGHT) / 2} y="84" text-anchor="middle">No recorded readings</text>` : nothing}
      ${this.inspectingAt !== undefined ? svg`<line class="crosshair" x1=${x(this.inspectingAt)} x2=${x(this.inspectingAt)} y1=${TOP} y2=${BOTTOM}/>` : nothing}
    </svg>`;
  }
  static styles = css`
    :host{display:block;--ink:var(--primary-text-color,#263430);--muted:var(--secondary-text-color,#69746e);--line:var(--divider-color,#e3e7e2);--accent:var(--primary-color,#427b60)}
    ha-card{display:block;color:var(--ink);background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:var(--ha-card-border-radius,18px);overflow:hidden;padding:20px 20px 0;box-sizing:border-box;border:1px solid var(--line)}
    button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;min-height:40px;min-width:40px;border-radius:10px;touch-action:manipulation}button:focus-visible,summary:focus-visible,svg:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button:disabled{opacity:.35;cursor:default}
    .card-header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:21px;margin:0;font-weight:650;letter-spacing:-.5px}.scale{display:flex;background:var(--secondary-background-color,#f0f3ef);border-radius:12px;padding:3px}.scale button{font-size:12px;min-height:30px;padding:0 12px}.scale button[aria-pressed=true]{background:var(--ha-card-background,var(--card-background-color,#fff));box-shadow:0 1px 4px #0001;font-weight:650}
    .window{display:flex;align-items:center;justify-content:space-between;margin:6px -8px 0;gap:4px}.window span{font-size:12px;color:var(--muted);text-align:center}.window button{font-size:20px}.key{display:flex;flex-wrap:wrap;gap:15px;font-size:11px;color:var(--muted);padding:2px 0 18px}.key span{display:flex;align-items:center;gap:5px}.key i{display:block;width:16px}.actual-key{border-top:2px solid #d46f32}.target-key{border-top:2px dashed #858d88}.key .heat-key{height:9px;width:12px;background:#e8b46144;border-radius:2px}
    .rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:22px}.room{min-width:0;border-top:1px solid var(--line);padding-top:18px}.room-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px}.room-name{font-size:17px;font-weight:650;padding:0;min-height:25px;min-width:0;text-align:left}.room-name span{font-size:15px;color:var(--muted);font-weight:400}.now{display:flex;align-items:baseline;gap:7px;margin-top:6px}.now>span:first-child,.set>span{font-size:11px;color:var(--muted)}.now strong{font-size:26px;font-weight:550;letter-spacing:-1px}small{font-size:11px;margin-left:2px;letter-spacing:0;font-weight:400;color:var(--muted)}.state{font-size:10px;color:var(--muted);max-width:70px}.set{text-align:center;min-width:131px}.set>span{display:block;height:17px}.set-value{display:flex;align-items:center;justify-content:center;gap:1px;border:1px solid var(--line);border-radius:13px;background:var(--secondary-background-color,#f5f6f2)}.set-value button{min-width:40px;font-size:20px}.set-value strong{font-size:17px;font-weight:550;white-space:nowrap}.set-value small{font-size:9px}.set-value:not(:has(button)){padding:10px}
    .chart{display:block;width:100%;height:auto;overflow:visible;touch-action:pan-y}.grid{stroke:var(--line);stroke-width:.7}.empty-chart{fill:var(--muted);font:14px system-ui,sans-serif}.axis-text{fill:var(--muted);font:14px system-ui,sans-serif}.heat-band{fill:#e8b46130}.actual-line,.target-line,.weather-line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.target-line{stroke-dasharray:4 4;stroke-width:1.5}.crosshair{stroke:var(--muted);stroke-width:1;stroke-dasharray:2 3}.inspection{min-height:28px;font-size:11px;display:flex;align-items:center;gap:9px;color:var(--muted)}.chart-placeholder{height:145px}
    .weather{border-top:1px solid var(--line);margin-top:5px}.weather summary{display:flex;align-items:center;gap:10px;justify-content:space-between;cursor:pointer;min-height:64px;font-size:13px;font-weight:600;list-style:none}.weather summary:after{content:'⌄';font-size:17px;color:var(--muted)}.weather[open] summary:after{content:'⌃'}.weather-now{display:flex;flex-wrap:wrap;gap:4px 12px;flex:1;justify-content:flex-end;font-size:11px;color:var(--muted);font-weight:400}.weather-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:15px;padding-bottom:15px}.weather h3{font-size:11px;color:var(--muted);font-weight:500;margin:0 0 8px}.weather svg{margin-bottom:8px}
    .error,.control-error{font-size:12px;color:var(--error-color,#b44636);margin:0 0 10px}.error{display:flex;align-items:center;justify-content:space-between}.loading,.message{font-size:12px;color:var(--muted);padding:12px 0}.loading{position:absolute;bottom:0;right:20px;padding:0;font-size:10px}
    @media(max-width:400px){ha-card{padding:16px 15px 0}.key{gap:12px}.rooms{gap:12px}.room{padding-top:15px}.weather summary{min-height:58px}.weather-now{max-width:225px}.now strong{font-size:25px}}
  `;
}
registerCard(ELEMENT, "Heating history", "Room temperatures, targets and heating activity with bounded native history.");
