// Public, deterministic fixture. HA itself owns ha-icon in production; this
// fixture displays unchanged licensed @mdi/svg7.4.47 assets for the same icons.
const iconNames = new Set(["lightbulb-outline", "palette", "thermometer", "power-socket-uk", "chevron-up", "chevron-down", "power", "lightbulb-group-outline"]);
if (!customElements.get("ha-icon")) customElements.define("ha-icon", class extends HTMLElement {
  set icon(value) {
    const name = String(value).replace("mdi:", "");
    this.style.cssText = `display:inline-block;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);background:currentColor;mask:url('/preview/icons/${iconNames.has(name) ? name : "lightbulb-outline"}.svg') center/contain no-repeat`;
    this.setAttribute("aria-hidden", "true");
  }
});

const attrs = (percentage = 68, modes = ["color_temp", "xy"]) => ({ supported_color_modes: modes, brightness: Math.round(percentage * 255 / 100), min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, color_temp_kelvin: 3000, color_mode: "color_temp", hs_color: [210,60] });
const states = {
  "light.example_zone_a_group": { entity_id: "light.example_zone_a_group", state: "on", attributes: attrs(72) },
  "light.example_zone_a_light_a": { entity_id: "light.example_zone_a_light_a", state: "on", attributes: attrs(68) },
  "light.example_zone_a_light_b": { entity_id: "light.example_zone_a_light_b", state: "on", attributes: attrs(75, ["color_temp"]) },
  "light.example_zone_a_light_c": { entity_id: "light.example_zone_a_light_c", state: "on", attributes: { ...attrs(60), color_mode: "xy" } },
  "light.example_zone_b_group": { entity_id: "light.example_zone_b_group", state: "on", attributes: attrs(58, ["color_temp"]) },
  "light.example_zone_c_group": { entity_id: "light.example_zone_c_group", state: "off", attributes: { ...attrs(0), brightness: null, color_temp_kelvin: null, hs_color: null } },
  "light.example_zone_d_light": { entity_id: "light.example_zone_d_light", state: "on", attributes: attrs(90) },
  "light.example_zone_e_light": { entity_id: "light.example_zone_e_light", state: "on", attributes: attrs(75) },
  "light.example_zone_f_light": { entity_id: "light.example_zone_f_light", state: "unavailable", attributes: attrs() },
  "light.example_fixed_dimmer": { entity_id: "light.example_fixed_dimmer", state: "on", attributes: attrs(50, ["brightness"]) },
  "light.example_white_dimmer": { entity_id: "light.example_white_dimmer", state: "on", attributes: attrs(60, ["color_temp"]) },
  "light.example_socket": { entity_id: "light.example_socket", state: "off", attributes: { supported_color_modes: ["onoff"], icon: "mdi:power-socket-uk" } },
  "select.example_zone_a_scene": { entity_id: "select.example_zone_a_scene", state: "unknown", attributes: { options: ["Relax", "Read", "Evening"] } },
  "select.example_zone_c_scene": { entity_id: "select.example_zone_c_scene", state: "unknown", attributes: { options: ["Relax", "Read"] } }
};
window.previewCalls = [];
window.previewFailNext = false;
window.previewSuppressReadback = false;
window.previewDeferNext = false;
let deferredRequest;
const makeHass = () => ({
  states: JSON.parse(JSON.stringify(states)),
  config: { unit_system: { temperature: "°C" } },
  async callWS() { return {}; },
  async callService(domain, service, data = {}) {
    window.previewCalls.push({ domain, service, data });
    if (window.previewDeferNext) {
      window.previewDeferNext = false;
      await new Promise((resolve, reject) => { deferredRequest = { resolve, reject }; });
      deferredRequest = undefined;
    }
    if (window.previewFailNext) { window.previewFailNext = false; throw new Error("Fixture device refused the action"); }
    if (window.previewSuppressReadback) return;
    const entityState = states[data.entity_id];
    if (domain === "light") {
      entityState.state = service === "turn_off" ? "off" : "on";
      if (data.brightness_pct !== undefined) entityState.attributes.brightness = Math.round(data.brightness_pct * 255 / 100);
      if (data.color_temp_kelvin !== undefined) { entityState.attributes.color_temp_kelvin = data.color_temp_kelvin; entityState.attributes.color_mode = "color_temp"; }
      if (data.hs_color !== undefined) { entityState.attributes.hs_color = data.hs_color; entityState.attributes.color_mode = "xy"; }
    }
    if (domain === "select") entityState.state = data.option;
    publish();
  }
});
const publish = () => document.querySelectorAll("alx-light-row-card").forEach((card) => { card.hass = makeHass(); });
window.previewFinishDeferred = (reject = false) => {
  if (!deferredRequest) throw new Error("No deferred light action");
  reject ? deferredRequest.reject(new Error("Device refused the request")) : deferredRequest.resolve();
};
window.previewLightState = (entity, update) => { Object.assign(states[entity], update); publish(); };

const main = document.querySelector("#cards");
main.style.maxWidth = "980px";
main.style.width = "100%";
const grid = document.createElement("div");
grid.className = "lights-grid";
const style = document.createElement("style");
style.textContent = `.lights-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:4px 24px;padding:8px 4px;align-items:start}.lights-grid>alx-light-row-card{border-bottom:1px solid var(--divider-color);padding-bottom:4px}.room{min-width:0;border-bottom:1px solid var(--divider-color);padding:4px 0}.room>summary{font-size:13px;padding:14px 3px;color:var(--secondary-text-color);cursor:pointer}.room:not([open])>alx-light-row-card{display:none}`;
document.head.append(style);
window.loadCardHelpers = async () => ({ createCardElement(config) {
  if (config.type !== "custom:alx-light-row-card") throw new Error("Fixture supports the public light-row only");
  const card = document.createElement("alx-light-row-card");
  card.setConfig(config);
  card.setAttribute("data-fixture-entity", config.entity);
  return card;
} });
const row = (entity, name, scene_entity, cards) => {
  const card = document.createElement("alx-light-row-card");
  card.setConfig({ type: "custom:alx-light-row-card", entity, name, group: !!scene_entity || !!cards, ...(scene_entity ? { scene_entity } : {}), ...(cards ? { cards, expanded: true } : {}) });
  card.setAttribute("data-fixture-entity", entity);
  card.hass = makeHass();
  return card;
};
const living = row("light.example_zone_a_group", "Zone A", "select.example_zone_a_scene", [
  { type: "custom:alx-light-row-card", entity: "light.example_zone_a_light_a", name: "Light A" },
  { type: "custom:alx-light-row-card", entity: "light.example_zone_a_light_b", name: "Light B" },
  { type: "custom:alx-light-row-card", entity: "light.example_zone_a_light_c", name: "Light C" },
]);
grid.append(living);
const second = document.createElement("section");
second.append(row("light.example_zone_b_group", "Zone B"), row("light.example_zone_c_group", "Zone C", "select.example_zone_c_scene"), row("light.example_zone_d_light", "Zone D"), row("light.example_zone_e_light", "Zone E"), row("light.example_zone_f_light", "Zone F"));
grid.append(second);
const footer = document.createElement("details"); footer.className = "room";
const footerSummary = document.createElement("summary"); footerSummary.className = "quiet"; footerSummary.textContent = "Unassigned lights"; footer.append(footerSummary, row("light.example_fixed_dimmer", "Fixed white"), row("light.example_white_dimmer", "Adjustable white"), row("light.example_socket", "Lighting plug"));
grid.append(footer); main.append(grid);
document.querySelector("#theme").addEventListener("click", () => document.documentElement.classList.toggle("light"));
