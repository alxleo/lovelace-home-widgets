import { describe, expect, it } from "vitest";
import { historyRooms, linearPaths, nextTemperature, temperatureControl } from "../src/cards/heating-history/rooms";
import { parseHistoryConfig } from "../src/cards/heating-history/config";

describe("room journals", () => {
  it("scenario: controls opt in and bind only to one native target climate", () => {
    const config = parseHistoryConfig({ type: "custom:alx-heating-history-card", series: [
      { room: "Zone A", kind: "actual_temperature", entity: "sensor.example_outdoor_temperature", label: "Actual" },
      { room: "Zone A", kind: "target_temperature", entity: "climate.example_zone_a", label: "Target" },
      { room: "Zone A", kind: "heating_request", entity: "climate.example_zone_b", label: "Demand" },
    ] });
    expect(config.temperature_controls).toBe(false);
    expect(historyRooms(config.series)[0]?.climate).toBe("climate.example_zone_a");
    config.series.push({ room: "Zone A", kind: "target_temperature", entity: "sensor.example_outdoor_temperature", label: "Derived target" });
    expect(historyRooms(config.series)[0]?.climate).toBeUndefined();
    expect(historyRooms(config.series)[0]?.target).toBeUndefined();
    config.series.pop();
    config.series.push({ room: "Zone A", kind: "target_temperature", entity: "climate.example_zone_b", label: "Target" });
    expect(historyRooms(config.series)[0]?.climate).toBeUndefined();
  });
  it("scenario: native capability and limits are required, with exact steps and clamping", () => {
    const state = { entity_id: "climate.example_zone_a", state: "heat", attributes: { temperature: 22, min_temp: 15, max_temp: 23.5, target_temp_step: .5, supported_features: 385 } };
    const control = temperatureControl(state)!;
    expect(nextTemperature(control, 1)).toBe(22.5);
    expect(nextTemperature({ ...control, target: 23.5 }, 1)).toBe(23.5);
    expect(nextTemperature({ ...control, target: 15 }, -1)).toBe(15);
    expect(nextTemperature({ ...control, target: 22.2 }, 1)).toBe(22.5);
    expect(nextTemperature({ ...control, target: 22.2 }, -1)).toBe(22);
    expect(temperatureControl({ ...state, state: "unavailable" })).toBeUndefined();
    expect(temperatureControl({ ...state, state: "off", attributes: { ...state.attributes, temperature: 1 } })).toBeUndefined();
    expect(temperatureControl({ ...state, attributes: { ...state.attributes, supported_features: 0 } })).toBeUndefined();
    expect(temperatureControl({ ...state, attributes: { ...state.attributes, target_temp_step: 0 } })).toBeUndefined();
  });
  it("scenario: actual and weather lines do not bridge an unavailable sample", () => {
    expect(linearPaths([{ time: 0, value: 21 }, { time: 10, value: 22 }, { time: 15, value: null }, { time: 20, value: 23 }], (v) => v, (v) => v, 30))
      .toEqual(["M 0,21 L 10,22", "M 20,23 L 30,23"]);
  });
});
