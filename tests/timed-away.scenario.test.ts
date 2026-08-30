import { describe, expect, it } from "vitest";
import { durationLabel, endLabel, isActiveState, minutesToSlider, parseTimedAwayConfig, sliderToMinutes } from "../src/cards/timed-away/model";

describe("timed away", () => {
  it("scenario: quick presets and non-linear scrubber cover useful short through two-day durations", () => {
    expect([60, 240, 510].map((minutes) => durationLabel(minutes))).toEqual(["1h", "4h", "8h 30m"]);
    expect(sliderToMinutes(0)).toBe(30);
    expect(sliderToMinutes(60)).toBe(510);
    expect(sliderToMinutes(100)).toBe(2880);
    for (const minutes of [30, 60, 240, 510, 900, 1440, 2880]) {
      expect(Math.abs(sliderToMinutes(minutesToSlider(minutes)) - minutes)).toBeLessThanOrEqual(30);
    }
    expect(endLabel(60, Date.parse("2026-08-30T14:00:00Z"))).toMatch(/:00/);
  });

  it("scenario: action and state configuration rejects ambiguous or unsafe shapes", () => {
    const config = parseTimedAwayConfig({
      type: "custom:alx-timed-away-card",
      start_action: "script.example_apply_timed_away",
      cancel_action: "script.example_cancel_timed_away",
      active_entity: "timer.example_timed_away",
      ends_at_entity: "timer.example_timed_away",
      ends_at_attribute: "finishes_at",
    });
    expect(config.duration_field).toBe("duration_minutes");
    expect(() => parseTimedAwayConfig({ ...config, start_action: "not-an-action" })).toThrow(/domain.service/);
    expect(() => parseTimedAwayConfig({ ...config, active_entity: "not-an-entity" })).toThrow(/entity id/);
    expect(() => parseTimedAwayConfig({ ...config, ends_at_entity: undefined, ends_at_attribute: "finishes_at" })).toThrow(/requires ends_at_entity/);
    expect(() => parseTimedAwayConfig({ ...config, duration_field: "__proto__" })).toThrow(/safe service-data key/);
    for (const field of ["start_data", "cancel_data"] as const) {
      for (const invalid of [null, [], "duration_minutes=60", 60, true]) {
        expect(() => parseTimedAwayConfig({ ...config, [field]: invalid }), `${field}: ${String(invalid)}`).toThrow(`${field} must be an object`);
      }
    }
    expect(isActiveState("on")).toBe(true);
    expect(["off", "idle", "unknown", "unavailable"].every((state) => !isActiveState(state))).toBe(true);
  });
});
