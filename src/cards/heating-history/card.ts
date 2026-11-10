import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ScrollHistoryController, DAY_MS, type HistoryPoint, type Scale } from "../../shared/history-model";
import { placeDirectLabel } from "../../shared/label-layout";
import { registerCard, type HomeAssistant, type LovelaceCardEditor } from "../../shared/home-assistant";
import { localTimelineMarks } from "../../shared/timeline-layout";
import { parseHistoryConfig, seriesId, type HeatingHistoryCardConfig, type HistorySeriesConfig } from "./config";
import { fetchHistory } from "./ha-history";
import { heldPointAt, heldStepPaths, heldTrueIntervals } from "./geometry";

const ELEMENT = "alx-heating-history-card";
const WIDTH = 360;
const MAIN_LEFT = 52;

const colorFor = (series: HistorySeriesConfig, index: number): string => {
  if (series.color) return series.color;
  if (series.kind === "outdoor_temperature") return "#58a6ff";
  if (series.kind === "precipitation_estimate") return "#77bdfb";
  return ["#db8a20", "#9466c7", "#d65b7a"][index % 3]!;
};

const numberPoints = (points: HistoryPoint[]): Array<HistoryPoint & { value: number }> =>
  points.filter((point): point is HistoryPoint & { value: number } => typeof point.value === "number");

interface SeriesGeometry {
  series: HistorySeriesConfig;
  color: string;
  points: HistoryPoint[];
  numeric: Array<HistoryPoint & { value: number }>;
  path: string;
  paths: string[];
}

interface TimelineGeometry {
  span: number;
  height: number;
  minimum: number;
  maximum: number;
  marks: number[];
  y: (time: number) => number;
  xTemp: (value: number) => number;
  series: SeriesGeometry[];
}

const closestPoint = (points: HistoryPoint[], target: number): HistoryPoint | undefined => {
  if (points.length === 0) return undefined;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.time < target) low = middle + 1;
    else high = middle;
  }
  const after = points[low]!;
  const before = low > 0 ? points[low - 1]! : undefined;
  return before && target - before.time <= after.time - target ? before : after;
};

@customElement(ELEMENT)
export class HeatingHistoryCard extends LitElement {
  static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("alx-heating-history-card-editor") as LovelaceCardEditor;
  }

  static getStubConfig(): HeatingHistoryCardConfig {
    return { type: "custom:alx-heating-history-card", title: "Heating history", default_scale: "day", series: [] };
  }

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: HeatingHistoryCardConfig;
  @state() private controller?: ScrollHistoryController;
  @state() private revision = 0;
  @state() private inspectingAt?: number;
  @state() private viewportScrollTop = 0;
  @state() private viewportHeight = 590;
  @state() private plotWidth = WIDTH;
  private resizeObserver?: ResizeObserver;
  private get mainRight(): number { return this.plotWidth - 38; }
  private get weatherLeft(): number { return this.plotWidth - 22; }
  private get weatherRight(): number { return this.plotWidth - 10; }
  private unsubscribe?: () => void;
  private loadingEarlier = false;
  private lastScrollTop = 0;
  private layoutHeight = 0;
  private layoutEpoch = 0;
  private positioningTimeline = false;
  private inspectFrame?: number;
  private pendingInspection?: number;
  private viewportFrame?: number;
  private pendingViewport?: { scrollTop: number; height: number };
  private geometryCache?: {
    revision: number;
    scale: Scale;
    start: number;
    end: number;
    geometry: TimelineGeometry;
  };

  setConfig(value: unknown): void {
    this.config = parseHistoryConfig(value);
    this.teardownController();
  }

  disconnectedCallback(): void {
    this.teardownController();
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues): void {
    if ((changed.has("hass") || changed.has("config")) && this.hass && this.config && !this.controller) {
      this.createController();
    }
  }

  protected render() {
    void this.revision;
    if (!this.config) return nothing;
    if (!this.hass) return html`<ha-card><div class="message">Connecting to Home Assistant…</div></ha-card>`;
    if (this.config.series.length === 0) {
      return html`<ha-card><div class="message">Add temperature series in the visual editor.</div></ha-card>`;
    }
    const controller = this.controller;
    return html`
      <ha-card>
        <header>
          <div><h2>${this.config.title}</h2><span>${this.rangeSummary(controller)}</span></div>
          <div class="scale" aria-label="Timeline scale">
            ${(["day", "week"] as const).map((scale) => html`
              <button aria-pressed=${String(controller?.scale === scale)} @click=${() => this.changeScale(scale)}>
                ${scale === "day" ? "Day" : "Week"}
              </button>`)}
          </div>
        </header>
        <div class="axis"><span>cooler</span><strong>temperature ${this.hass.config?.unit_system?.temperature ?? "°"} →</strong><span>warmer</span><span class="weather-title">rain</span></div>
        ${controller?.status === "error" ? html`
          <div class="error" role="alert"><span>${controller.error}</span><button @click=${() => controller.retry()}>Retry</button></div>
        ` : nothing}
        <div class="plot">
        <div class="timeline" @scroll=${this.onScroll} aria-label="Scrollable heating history">
          ${controller ? this.renderTimeline(controller) : html`<div class="message">Loading history…</div>`}
        </div>
        ${this.renderInspector(controller)}
        </div>
        <footer><span>${controller?.status === "loading" ? "Loading history…" : "Scroll up for earlier history"}</span><span>Rain is estimated</span></footer>
      </ha-card>
    `;
  }

  private createController(): void {
    const config = this.config!;
    const controller = new ScrollHistoryController(
      config.default_scale,
      (range, signal) => fetchHistory(this.hass!, config, range, signal),
    );
    this.unsubscribe = controller.subscribe(() => {
      this.revision += 1;
      this.requestUpdate();
    });
    this.controller = controller;
    const epoch = ++this.layoutEpoch;
    this.positioningTimeline = true;
    void controller.loadInitial().then(() => this.positionTimeline(controller, epoch)).finally(() => {
      if (epoch === this.layoutEpoch) this.positioningTimeline = false;
    });
  }

  private async positionTimeline(controller: ScrollHistoryController, epoch: number): Promise<void> {
    await this.updateComplete;
    if (!this.isConnected || this.controller !== controller || epoch !== this.layoutEpoch) return;
    const timeline = this.renderRoot.querySelector<HTMLElement>(".timeline");
    if (!timeline) return;
    timeline.scrollTop = timeline.scrollHeight;
    this.lastScrollTop = timeline.scrollTop;
    this.layoutHeight = timeline.clientHeight;
    this.captureViewport(timeline);
    if (this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !this.isConnected || this.controller !== controller) return;
      const width = Math.max(330, Math.round(entry.contentRect.width));
      if (width !== this.plotWidth) {
        this.geometryCache = undefined;
        this.plotWidth = width;
      }
      this.layoutHeight = timeline.clientHeight;
      this.lastScrollTop = timeline.scrollTop;
      this.captureViewport(timeline);
    });
    this.resizeObserver.observe(timeline);
  }

  private teardownController(): void {
    this.layoutEpoch += 1;
    this.positioningTimeline = false;
    this.lastScrollTop = 0;
    this.layoutHeight = 0;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.controller = undefined;
    this.geometryCache = undefined;
    if (this.inspectFrame !== undefined) cancelAnimationFrame(this.inspectFrame);
    if (this.viewportFrame !== undefined) cancelAnimationFrame(this.viewportFrame);
    this.inspectFrame = undefined;
    this.viewportFrame = undefined;
    this.pendingInspection = undefined;
    this.pendingViewport = undefined;
  }

  private async changeScale(scale: Scale): Promise<void> {
    if (!this.controller || this.controller.scale === scale) return;
    const controller = this.controller;
    const epoch = ++this.layoutEpoch;
    this.positioningTimeline = true;
    try {
      await controller.setScale(scale);
      await this.positionTimeline(controller, epoch);
    } finally {
      if (epoch === this.layoutEpoch) this.positioningTimeline = false;
    }
  }

  private async onScroll(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLElement;
    const resized = target.clientHeight !== this.layoutHeight;
    this.layoutHeight = target.clientHeight;
    const previousTop = this.lastScrollTop;
    this.lastScrollTop = target.scrollTop;
    this.captureViewport(target);
    if (resized || this.positioningTimeline || !this.controller || this.controller.status !== "ready" || target.scrollTop >= previousTop || target.scrollTop > 72 || this.loadingEarlier) return;
    this.loadingEarlier = true;
    const before = target.scrollHeight;
    try {
      const added = await this.controller.loadEarlier();
      await this.updateComplete;
      if (added > 0) target.scrollTop += target.scrollHeight - before;
      this.captureViewport(target);
    } finally {
      this.loadingEarlier = false;
    }
  }

  private captureViewport(target: HTMLElement): void {
    this.pendingViewport = { scrollTop: target.scrollTop, height: target.clientHeight };
    if (this.viewportFrame !== undefined) return;
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = undefined;
      const pending = this.pendingViewport;
      this.pendingViewport = undefined;
      if (!pending) return;
      if (this.viewportScrollTop !== pending.scrollTop) this.viewportScrollTop = pending.scrollTop;
      if (this.viewportHeight !== pending.height) this.viewportHeight = pending.height;
    });
  }

  private timelineGeometry(controller: ScrollHistoryController): TimelineGeometry {
    const range = controller.loadedRange;
    const cached = this.geometryCache;
    if (cached
      && cached.revision === this.revision
      && cached.scale === controller.scale
      && cached.start === range.start
      && cached.end === range.end) return cached.geometry;

    const span = range.end - range.start;
    const height = Math.max(590, Math.round((span / (controller.scale === "day" ? DAY_MS : 7 * DAY_MS)) * 590));
    const y = (time: number): number => ((time - range.start) / span) * height;
    const rooms = [...new Set(this.config!.series.filter((series) => series.kind === "actual_temperature").map((series) => series.entity))];
    const pointSets = this.config!.series.map((series, index) => {
      const points = controller.data.points(seriesId(series), range, ["target_temperature", "heating_request"].includes(series.kind));
      const room = rooms.indexOf(series.entity);
      return { series, color: colorFor(series, room < 0 ? index : room), points, numeric: numberPoints(points) };
    });
    const mainValues = pointSets
      .filter(({ series }) => ["actual_temperature", "target_temperature", "outdoor_temperature"].includes(series.kind))
      .flatMap(({ numeric }) => numeric.map((point) => point.value));
    const minimum = mainValues.length ? Math.floor(Math.min(...mainValues) * 2) / 2 - 0.5 : 15;
    const maximum = mainValues.length ? Math.ceil(Math.max(...mainValues) * 2) / 2 + 0.5 : 25;
    const xTemp = (value: number): number => MAIN_LEFT + ((value - minimum) / Math.max(1, maximum - minimum)) * (this.mainRight - MAIN_LEFT);
    const series = pointSets.map((entry): SeriesGeometry => {
      const mapX = xTemp;
      const paths = entry.series.kind === "target_temperature"
        ? heldStepPaths(entry.points, mapX, y, range.end)
        : [];
      const path = entry.numeric.map((point) => `${mapX(point.value)},${y(point.time)}`).join(" ");
      return { ...entry, path, paths };
    });
    const geometry = { span, height, minimum, maximum, marks: localTimelineMarks(range, controller.scale), y, xTemp, series };
    this.geometryCache = { revision: this.revision, scale: controller.scale, start: range.start, end: range.end, geometry };
    return geometry;
  }

  private renderTimeline(controller: ScrollHistoryController) {
    const range = controller.loadedRange;
    const geometry = this.timelineGeometry(controller);
    const { span, height, minimum, maximum, marks, y, xTemp } = geometry;
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    const visibleTop = range.start + (this.viewportScrollTop / height) * span;
    const visibleBottom = range.start + ((this.viewportScrollTop + this.viewportHeight) / height) * span;
    const labelTop = Math.max(18, this.viewportScrollTop + 18);
    const labelBottom = Math.min(height - 24, this.viewportScrollTop + this.viewportHeight - 24);

    return html`
      <svg viewBox="0 0 ${this.plotWidth} ${height}" style="height:${height}px" role="img"
        aria-label="Heating history; time runs from top to bottom"
        @pointermove=${(event: PointerEvent) => this.inspect(event, range.start, span, height)}
        @pointerleave=${() => this.clearInspection()}>
        ${geometry.series.filter(({ series }) => series.kind === "heating_request").map(({ series, color, points }) => svg`
          <g data-kind="heating-request" aria-label="${series.label}: heating requested" fill="${color}">
            ${heldTrueIntervals(points, visibleTop, visibleBottom).map((interval) => svg`
              <rect class="request" x="${MAIN_LEFT}" width="${this.mainRight - MAIN_LEFT}" y="${y(interval.start)}" height="${y(interval.end) - y(interval.start)}"></rect>
            `)}
          </g>
        `)}
        ${marks.map((time) => svg`
          <line class="time-grid" x1="${MAIN_LEFT}" x2="${this.weatherRight}" y1="${y(time)}" y2="${y(time)}"></line>
          <text class="time-label" x="2" y="${Math.max(12, Math.min(height - 6, y(time) + 4))}">${this.timeLabel(time, controller.scale)}</text>
        `)}
        ${[minimum, (minimum + maximum) / 2, maximum].map((value) => svg`
          <line class="temp-grid" x1="${xTemp(value)}" x2="${xTemp(value)}" y1="0" y2="${height}"></line>
          <text class="temp-label" x="${xTemp(value)}" y="${this.viewportScrollTop + 14}">${value.toFixed(1)}°</text>
        `)}
        <line class="lane" x1="${this.weatherLeft - 9}" x2="${this.weatherLeft - 9}" y1="0" y2="${height}"></line>
        ${geometry.series.map(({ series, color, points, numeric, path, paths }) => {
          if (series.kind === "precipitation_estimate") {
            return points.filter((point) => typeof point.value === "number" && point.value > 0).map((point) => svg`
              <line data-kind="precipitation" x1="${this.weatherLeft}" x2="${this.weatherLeft + Math.min(12, Number(point.value) * 8)}"
                y1="${y(point.time)}" y2="${y(point.time)}" stroke="${color}" stroke-width="3"></line>
            `);
          }
          if (series.kind === "heating_request") return nothing;
          if (series.kind === "target_temperature") {
            const latest = heldPointAt(points, visibleBottom);
            if (!latest) return nothing;
            const available = typeof latest.value === "number";
            const label = available ? series.label : `${series.label} unavailable`;
            const placement = placeDirectLabel(
              available ? xTemp(latest.value as number) + 4 : MAIN_LEFT + 4,
              y(visibleBottom),
              Math.min(104, label.length * 6),
              12,
              { left: MAIN_LEFT, right: this.mainRight, top: labelTop, bottom: labelBottom },
              occupied,
            );
            return svg`
              <g data-kind="target_temperature">
                ${paths.map((heldPath) => svg`<path class="series target" stroke="${color}" d="${heldPath}"></path>`)}
              </g>
              <text data-label="target_temperature" class="direct-label" fill="${color}" x="${placement.x}" y="${placement.baseline}">${label}</text>
            `;
          }
          const visible = numeric.filter((point) => point.time >= visibleTop && point.time <= visibleBottom);
          const mapX = xTemp;
          const last = visible.at(-1);
          if (!last) return nothing;
          const laneBounds = { left: MAIN_LEFT, right: this.mainRight, top: labelTop, bottom: labelBottom };
          const placement = placeDirectLabel(mapX(last.value) + 4, y(last.time), Math.min(66, series.label.length * 7), 12, laneBounds, occupied);
          return svg`
            <polyline data-kind="${series.kind}" class="series" stroke="${color}" points="${path}"></polyline>
            <text data-label="${series.kind}" class="direct-label" fill="${color}" x="${placement.x}" y="${placement.baseline}">${series.label}</text>
          `;
        })}
        ${this.inspectingAt === undefined ? nothing : svg`
          <line class="crosshair" x1="${MAIN_LEFT}" x2="${this.weatherRight}" y1="${y(this.inspectingAt)}" y2="${y(this.inspectingAt)}"></line>
        `}
      </svg>
    `;
  }

  private inspect(event: PointerEvent, start: number, span: number, height: number): void {
    const svgElement = event.currentTarget as SVGElement;
    const rect = svgElement.getBoundingClientRect();
    const relative = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    this.pendingInspection = start + relative * span * (rect.height / height);
    if (this.inspectFrame !== undefined) return;
    this.inspectFrame = requestAnimationFrame(() => {
      this.inspectFrame = undefined;
      const pending = this.pendingInspection;
      this.pendingInspection = undefined;
      if (pending !== undefined && this.inspectingAt !== pending) this.inspectingAt = pending;
    });
  }

  private clearInspection(): void {
    if (this.inspectFrame !== undefined) cancelAnimationFrame(this.inspectFrame);
    this.inspectFrame = undefined;
    this.pendingInspection = undefined;
    this.inspectingAt = undefined;
  }

  private renderInspector(controller?: ScrollHistoryController) {
    if (!controller || this.inspectingAt === undefined) return nothing;
    const values = this.timelineGeometry(controller).series.flatMap(({ series, points }) => {
      const closest = ["target_temperature", "heating_request"].includes(series.kind)
        ? heldPointAt(points, this.inspectingAt!)
        : closestPoint(points, this.inspectingAt!);
      if (!closest) return [];
      if (closest.value === null) return [`${series.label} unavailable`];
      if (typeof closest.value === "boolean") return [`${series.label} ${closest.value ? "on" : "off"}`];
      if (series.kind === "precipitation_estimate") {
        const label = series.label.replace(/\s+(?:est\.?|estimated)$/iu, "");
        return [`${label} ${closest.value.toFixed(1)} mm (estimated)`];
      }
      return [`${series.label} ${closest.value.toFixed(1)}°`];
    });
    return html`<div class="inspector"><strong>${new Date(this.inspectingAt).toLocaleString()}</strong><span>${values.join(" · ")}</span></div>`;
  }

  private rangeSummary(controller?: ScrollHistoryController): string {
    if (!controller) return "Loading";
    const start = new Date(controller.loadedRange.start).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${start} – now`;
  }

  private timeLabel(time: number, scale: Scale): string {
    const date = new Date(time);
    return scale === "day"
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      : date.toLocaleDateString([], { weekday: "short", day: "numeric" });
  }

  getCardSize(): number { return 8; }

  static styles = css`
    :host { display:block; font-family:var(--ha-card-header-font-family,system-ui,sans-serif); color:var(--primary-text-color,#f5f5f5); }
    * { box-sizing:border-box; }
    ha-card { display:block; overflow:hidden; background:var(--card-background-color,#171717); }
    header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:13px 14px 9px; }
    h2 { margin:0; font-size:18px; line-height:1.2; }
    header span, footer { color:var(--secondary-text-color,#aaa); font-size:11px; }
    .scale { display:flex; padding:2px; border:1px solid var(--divider-color,#444); border-radius:10px; }
    button { min-height:34px; border:0; border-radius:8px; padding:0 13px; color:inherit; background:transparent; font:inherit; }
    button[aria-pressed="true"] { background:var(--secondary-background-color,#353535); }
    .axis { display:grid; grid-template-columns:1fr auto 1fr 28px; align-items:center; padding:0 9px 6px 37px; color:var(--secondary-text-color,#aaa); font-size:10px; }
    .axis strong { color:var(--primary-text-color); font-weight:600; }
    .axis span:nth-child(3) { text-align:right; }
    .weather-title { text-align:center!important; margin-left:8px; }
    .plot { position:relative; }
    .timeline { height:min(590px,70vh); min-height:420px; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; border-block:1px solid var(--divider-color,#333); touch-action:pan-y; }
    svg { display:block; width:100%; min-width:330px; background:color-mix(in srgb,var(--card-background-color,#171717) 97%,white 3%); }
    .time-grid { stroke:var(--divider-color,#444); stroke-dasharray:2 4; opacity:.55; }
    .temp-grid { stroke:var(--divider-color,#444); opacity:.22; }
    .lane { stroke:var(--divider-color,#444); opacity:.8; }
    .time-label,.temp-label { fill:var(--secondary-text-color,#aaa); font-size:9px; }
    .temp-label { text-anchor:middle; paint-order:stroke; stroke:var(--card-background-color,#171717); stroke-width:3px; }
    .series { fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .request { fill-opacity:.12; }
    .target { stroke-dasharray:5 3; stroke-width:2; }
    .direct-label { font-size:10px; font-weight:700; paint-order:stroke; stroke:var(--card-background-color,#171717); stroke-width:3px; }
    .crosshair { stroke:var(--primary-text-color,#fff); stroke-width:1; stroke-dasharray:3 3; }
    .inspector { position:absolute; z-index:1; top:8px; left:52px; right:12px; pointer-events:none; border:1px solid var(--divider-color,#444); border-radius:8px; display:grid; gap:2px; padding:7px 12px; color:var(--primary-text-color); background:var(--secondary-background-color,#2a2a2a); font-size:11px; }
    .inspector span { color:var(--secondary-text-color,#bbb); line-height:1.35; overflow-wrap:anywhere; }
    .error,.message { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px; }
    .error { color:var(--error-color,#ff6659); }
    footer { display:flex; justify-content:space-between; gap:8px; padding:8px 12px; }
    @media (prefers-reduced-motion:reduce) { .timeline { scroll-behavior:auto; } }
  `;
}

registerCard(ELEMENT, "ALX Heating History", "Scrollable vertical heating and weather history");
