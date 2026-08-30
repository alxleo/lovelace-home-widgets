import { describe, expect, it } from "vitest";
import { authoritativeMode, durationLabel, endLabel, minutesToSlider, parseTimedAwayConfig, sliderToMinutes } from "../src/cards/timed-away/model";
import type { HassState } from "../src/shared/home-assistant";

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
      mode_entity: "sensor.example_away_control",
      mode_attribute: "mode",
      ends_at_entity: "timer.example_timed_away",
      ends_at_attribute: "finishes_at",
    });
    expect(config.duration_field).toBe("duration_minutes");
    expect(() => parseTimedAwayConfig({ ...config, start_action: "not-an-action" })).toThrow(/domain.service/);
    expect(() => parseTimedAwayConfig({ ...config, mode_entity: "not-an-entity" })).toThrow(/entity id/);
    expect(() => parseTimedAwayConfig({ ...config, ends_at_entity: undefined, ends_at_attribute: "finishes_at" })).toThrow(/requires ends_at_entity/);
    expect(() => parseTimedAwayConfig({ ...config, duration_field: "__proto__" })).toThrow(/safe service-data key/);
    for (const field of ["start_data", "cancel_data"] as const) {
      for (const invalid of [null, [], "duration_minutes=60", 60, true]) {
        expect(() => parseTimedAwayConfig({ ...config, [field]: invalid }), `${field}: ${String(invalid)}`).toThrow(`${field} must be an object`);
      }
    }
  });

  it("scenario: authoritative backend modes expose progress, faults, and timer contradictions without optimistic schedule claims", () => {
    const config = parseTimedAwayConfig({
      type: "custom:alx-timed-away-card",
      start_action: "script.example_apply_timed_away",
      cancel_action: "script.example_cancel_timed_away",
      mode_entity: "sensor.example_away_control",
      mode_attribute: "mode",
      ends_at_entity: "timer.example_timed_away",
      ends_at_attribute: "finishes_at",
    });
    const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HassState => ({
      entity_id, state: value, attributes,
    });
    const states = (mode: unknown, timer: string): Record<string, HassState> => ({
      "sensor.example_away_control": state("sensor.example_away_control", "backend", { mode }),
      "timer.example_timed_away": state("timer.example_timed_away", timer),
    });
    expect(authoritativeMode(config, states("Schedule", "idle"))).toBe("schedule");
    expect(authoritativeMode(config, states("Applying away", "active"))).toBe("applying-away");
    expect(authoritativeMode(config, states("Away", "active"))).toBe("away");
    expect(authoritativeMode(config, states("Restoring", "idle"))).toBe("restoring");
    expect(authoritativeMode(config, states("Fault", "idle"))).toBe("fault");
    expect(authoritativeMode(config, states("Mismatch", "idle"))).toBe("mismatch");
    expect(authoritativeMode(config, states("Schedule", "active"))).toBe("mismatch");
    expect(authoritativeMode(config, states("Away", "idle"))).toBe("mismatch");
    expect(authoritativeMode(config, {
      "sensor.example_away_control": state("sensor.example_away_control", "backend", { mode: "Schedule" }),
    })).toBe("mismatch");
    expect(authoritativeMode(config, {})).toBe("mismatch");

    const directConfig = parseTimedAwayConfig({ ...config, mode_entity: "input_select.example_away_mode", mode_attribute: undefined });
    expect(authoritativeMode(directConfig, {
      "input_select.example_away_mode": state("input_select.example_away_mode", "Applying away"),
      "timer.example_timed_away": state("timer.example_timed_away", "idle"),
    })).toBe("applying-away");
  });
});
