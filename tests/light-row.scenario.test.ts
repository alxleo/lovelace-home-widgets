import { describe, expect, it } from "vitest";
import { available, brightness, capabilities, confirmed, displayLightName, lightCommand, parseLightRowConfig, readbackFingerprint } from "../src/cards/light-row/model";
const current = { entity_id: "light.example_zone_a_light_a", state: "on", attributes: { supported_color_modes: ["color_temp", "xy"], brightness: 173, color_temp_kelvin: 3000, color_mode: "color_temp", min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, hs_color: [210,60] } };
describe("compact light row", () => {
  it("scenario: room scenes require explicit group scope and native select ownership", () => {
    expect(() => parseLightRowConfig({ type: "custom:alx-light-row-card", entity: current.entity_id, scene_entity: "select.example_zone_a_scene" })).toThrow(/group/);
    expect(parseLightRowConfig({ type: "custom:alx-light-row-card", entity: current.entity_id, group: true, scene_entity: "select.example_zone_a_scene" }).group).toBe(true);
    expect(() => parseLightRowConfig({ type: "custom:alx-light-row-card", entity: current.entity_id, group: true, scene_entity: "script.example_apply_timed_away" })).toThrow();
  });
  it("scenario: fixed-white and on-off lights expose only real capabilities, and unavailable fails closed", () => {
    expect(capabilities({ ...current, attributes: { supported_color_modes: ["brightness"] } })).toMatchObject({ brightness: true, color: false, white: false });
    const plug = { ...current, attributes: { supported_color_modes: ["onoff"] } };
    expect(capabilities(plug)).toMatchObject({ brightness: false, color: false, white: false });
    expect(lightCommand(plug, "white", 4000)).toBeUndefined();
    expect(available({ ...current, state: "unavailable" })).toBe(false);
    expect(lightCommand({ ...current, state: "unavailable" }, "power")).toBeUndefined();
    expect(brightness({ ...current, state: "off" })).toBe(0);
  });
  it("scenario: commands use native percentage, Kelvin bounds and HS colour rather than stale mireds", () => {
    expect(lightCommand(current, "brightness", 79)?.data).toEqual({ brightness_pct: 79 });
    expect(lightCommand(current, "brightness", 0)?.service).toBe("turn_off");
    expect(lightCommand(current, "white", 9999)?.data).toEqual({ color_temp_kelvin: 6500 });
    expect(lightCommand(current, "white", 1)?.data).toEqual({ color_temp_kelvin: 2000 });
    expect(lightCommand(current, "hue", 240)?.data).toEqual({ hs_color: [240,60] });
    expect(lightCommand({ ...current, attributes: { ...current.attributes, hs_color: null } }, "hue", 240)?.data).toEqual({ hs_color: [240,100] });
    expect(lightCommand({ ...current, attributes: { ...current.attributes, hs_color: null } }, "saturation", 60)).toBeUndefined();
  });
  it("scenario: room-relative names retain identity without changing native ids", () => {
    expect(displayLightName("Zone A RGBStrip", "Zone A ")).toBe("RGB Strip");
    expect(displayLightName("Zone A_1", "Zone A ")).toBe("Light 1");
  });
  it("scenario: one-step changes require changed relevant readback, including colour-mode transitions", () => {
    const request = lightCommand(current, "white", 3050)!.expected;
    const before = readbackFingerprint(request, current);
    expect(readbackFingerprint(request, { ...current, attributes: { ...current.attributes, brightness: 200 } })).toBe(before);
    const changed = { ...current, attributes: { ...current.attributes, color_temp_kelvin: 3060 } };
    expect(readbackFingerprint(request, changed)).not.toBe(before);
    expect(confirmed(request, changed)).toBe(true);
    const color = lightCommand(current, "hue", 210)!.expected;
    expect(confirmed(color, current)).toBe(false);
    expect(confirmed(color, { ...current, attributes: { ...current.attributes, color_mode: "xy" } })).toBe(true);
  });
});
