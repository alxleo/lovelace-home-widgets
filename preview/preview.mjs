import "/dist/alx-home-widgets.js";

const NOW = Date.parse("2026-08-30T14:00:00Z");
let awayMode = "Schedule";
let timerState = "idle";
let endTime = "unknown";
window.previewCalls = [];
window.previewFailNext = false;

const wave = (time, base, amplitude, phase = 0) => base + Math.sin((time / 86_400_000) * Math.PI * 2 + phase) * amplitude;
const statesFor = (entity, start, end) => {
  const result = [];
  for (let time = start; time <= end; time += 30 * 60_000) {
    const hour = new Date(time).getUTCHours();
    if (entity.startsWith("climate.")) {
      result.push({
        s: "heat",
        a: {
          current_temperature: Number(wave(time, entity.endsWith("example_zone_b") ? 20.4 : 21.1, .9, entity.endsWith("example_zone_b") ? 1 : 0).toFixed(1)),
          temperature: hour >= 7 && hour < 22 ? 21 : 18,
          hvac_action: hour >= 6 && hour < 9 ? "heating" : "idle"
        },
        lu: time / 1000
      });
    } else if (entity === "sensor.example_outdoor_temperature") {
      result.push({ s: wave(time, 12, 5, -1.2).toFixed(1), a: {}, lu: time / 1000 });
    } else if (entity === "sensor.example_precipitation_estimate") {
      result.push({ s: hour >= 10 && hour <= 12 ? "1.4" : "0", a: {}, lu: time / 1000 });
    }
  }
  return result;
};

const makeHass = () => ({
  states: {
    "climate.example_zone_a": { entity_id: "climate.example_zone_a", state: "heat", attributes: { current_temperature: 21.4, temperature: 21 } },
    "climate.example_zone_b": { entity_id: "climate.example_zone_b", state: "heat", attributes: { current_temperature: 20.8, temperature: 21 } },
    "sensor.example_outdoor_temperature": { entity_id: "sensor.example_outdoor_temperature", state: "13.2", attributes: {} },
    "sensor.example_precipitation_estimate": { entity_id: "sensor.example_precipitation_estimate", state: "0", attributes: {} },
    "sensor.example_away_control": { entity_id: "sensor.example_away_control", state: "backend state", attributes: { mode: awayMode } },
    "timer.example_timed_away": { entity_id: "timer.example_timed_away", state: timerState, attributes: { finishes_at: endTime } }
  },
  config: { unit_system: { temperature: "°C" } },
  async callWS(command) {
    if (window.previewFailHistory) throw new Error("Recorder is temporarily unavailable");
    const start = Date.parse(command.start_time);
    const end = Date.parse(command.end_time);
    return Object.fromEntries(command.entity_ids.map((entity) => [entity, statesFor(entity, start, end)]));
  },
  async callService(domain, service, data = {}) {
    window.previewCalls.push({ domain, service, data });
    if (window.previewFailNext) {
      window.previewFailNext = false;
      throw new Error("Backend refused the action; heating was not changed");
    }
    awayMode = service === "example_apply_timed_away" ? "Away" : "Schedule";
    timerState = awayMode === "Away" ? "active" : "idle";
    endTime = awayMode === "Away" ? new Date(NOW + Number(data.duration_minutes ?? 0) * 60_000).toISOString() : "unknown";
    const next = makeHass();
    document.querySelectorAll("alx-heating-history-card,alx-timed-away-card").forEach((card) => { card.hass = next; });
  }
});

const history = document.createElement("alx-heating-history-card");
history.setConfig({
  type: "custom:alx-heating-history-card",
  title: "Heating history",
  default_scale: "day",
  series: [
    { kind: "actual_temperature", entity: "climate.example_zone_a", label: "Zone A" },
    { kind: "actual_temperature", entity: "climate.example_zone_b", label: "Zone B" },
    { kind: "target_temperature", entity: "climate.example_zone_a", label: "Target" },
    { kind: "heating_request", entity: "climate.example_zone_a", label: "Heat" },
    { kind: "outdoor_temperature", entity: "sensor.example_outdoor_temperature", label: "Out" },
    { kind: "precipitation_estimate", entity: "sensor.example_precipitation_estimate", label: "Rain est." }
  ]
});

const away = document.createElement("alx-timed-away-card");
away.setConfig({
  type: "custom:alx-timed-away-card",
  title: "Away",
  start_action: "script.example_apply_timed_away",
  cancel_action: "script.example_cancel_timed_away",
  mode_entity: "sensor.example_away_control",
  mode_attribute: "mode",
  ends_at_entity: "timer.example_timed_away",
  ends_at_attribute: "finishes_at"
});

const hass = makeHass();
history.hass = hass;
away.hass = hass;
document.querySelector("#cards").append(history, away);
document.querySelector("#theme").addEventListener("click", () => document.documentElement.classList.toggle("light"));

window.previewSetAwayState = (mode, nextTimerState = "idle", finishesAt = "unknown") => {
  awayMode = mode;
  timerState = nextTimerState;
  endTime = finishesAt;
  away.hass = makeHass();
};
