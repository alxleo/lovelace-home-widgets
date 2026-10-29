import { describe, expect, it } from "vitest";
import { durationLabel, endLabel, formatSeconds, minutesToSlider, parsePcPowerConfig, pcPowerStatus, remainingLabel, sliderToMinutes, usageLabel } from "../src/cards/pc-power/model";
import type { HassState } from "../src/shared/home-assistant";

const state = (entity: string, value: string, attributes: Record<string, unknown> = {}): Record<string, HassState> => ({
  [entity]: { entity_id: entity, state: value, attributes },
});

describe("pc power", () => {
  it("scenario: presets and a non-linear scrubber cover a short grace through a long evening", () => {
    expect([15, 30, 60].map((minutes) => durationLabel(minutes))).toEqual(["15m", "30m", "1h"]);
    expect(sliderToMinutes(0)).toBe(5);
    expect(sliderToMinutes(60)).toBe(30);
    expect(sliderToMinutes(100)).toBe(240);
    for (const minutes of [5, 15, 30, 60, 120, 240]) {
      expect(Math.abs(sliderToMinutes(minutesToSlider(minutes)) - minutes)).toBeLessThanOrEqual(5);
    }
    expect(endLabel(60, Date.parse("2026-10-29T20:00:00Z"))).toMatch(/:00/);
    expect(formatSeconds(1500)).toBe("00:25:00");
    expect(remainingLabel("00:25:07")).toBe("25m 7s");
    expect(remainingLabel("01:05:00")).toBe("1h 5m");
  });

  it("scenario: configuration rejects unsafe entity ids and preset shapes", () => {
    const config = parsePcPowerConfig({
      type: "custom:alx-pc-power-card",
      title: "Desk PC",
      power_entity: "switch.example_pc",
      timer_entity: "timer.example_pc_shutdown",
      presets: [15, 30, 60],
    });
    expect(config.presets).toEqual([15, 30, 60]);
    expect(() => parsePcPowerConfig({ ...config, power_entity: "not-an-entity" })).toThrow(/entity id/);
    expect(() => parsePcPowerConfig({ ...config, timer_entity: "switch" })).toThrow(/entity id/);
    expect(() => parsePcPowerConfig({ ...config, presets: [] })).toThrow(/presets/);
    expect(() => parsePcPowerConfig({ ...config, presets: [0, 15] })).toThrow(/preset minutes/);
    expect(() => parsePcPowerConfig({ ...config, presets: [15.5] })).toThrow(/preset minutes/);
    expect(parsePcPowerConfig({ type: "custom:alx-pc-power-card", power_entity: "switch.example_pc" }).timer_entity).toBeUndefined();
  });

  it("scenario: the timer is the countdown authority and a live countdown on an off PC is a mismatch", () => {
    const config = parsePcPowerConfig({
      type: "custom:alx-pc-power-card",
      power_entity: "switch.example_pc",
      timer_entity: "timer.example_pc_shutdown",
    });
    expect(pcPowerStatus(config, state("switch.example_pc", "on"))).toEqual({ status: "on" });
    expect(pcPowerStatus(config, state("switch.example_pc", "off"))).toEqual({ status: "off" });
    expect(pcPowerStatus(config, state("switch.example_pc", "unavailable"))).toEqual({ status: "unavailable" });
    expect(pcPowerStatus(config, state("switch.example_pc", "on", {}))).toEqual({ status: "on" });

    const active = { ...state("switch.example_pc", "on"), ...state("timer.example_pc_shutdown", "active", { remaining: "00:29:59" }) };
    expect(pcPowerStatus(config, active)).toEqual({ status: "countdown", remaining: "00:29:59" });

    const shuttingWhileOff = { ...state("switch.example_pc", "off"), ...state("timer.example_pc_shutdown", "active", { remaining: "00:29:59" }) };
    expect(pcPowerStatus(config, shuttingWhileOff)).toEqual({ status: "mismatch", remaining: "00:29:59" });

    const paused = { ...state("switch.example_pc", "on"), ...state("timer.example_pc_shutdown", "paused") };
    expect(pcPowerStatus(config, paused)).toEqual({ status: "mismatch" });

    const finishesAtFallback = {
      ...state("switch.example_pc", "on"),
      ...state("timer.example_pc_shutdown", "active", { finishes_at: new Date(Date.now() + 120_000).toISOString() }),
    };
    expect(pcPowerStatus(config, finishesAtFallback).remaining).toMatch(/^\d{2}:\d{2}:0[0-2]$/);

    const plainToggle = parsePcPowerConfig({ type: "custom:alx-pc-power-card", power_entity: "switch.example_pc" });
    expect(pcPowerStatus(plainToggle, state("switch.example_pc", "on"))).toEqual({ status: "on" });
  });

  it("scenario: a separate connectivity sensor is the power authority over the optimistic switch", () => {
    const config = parsePcPowerConfig({
      type: "custom:alx-pc-power-card",
      power_entity: "switch.example_pc",
      state_entity: "binary_sensor.example_pc_connected",
      usage_entity: "sensor.example_pc_time_on_today",
    });
    const optimisticSwitchOn = {
      ...state("switch.example_pc", "on"),
      ...state("binary_sensor.example_pc_connected", "off"),
    };
    expect(pcPowerStatus(config, optimisticSwitchOn)).toEqual({ status: "off" });

    const sensorUnavailable = {
      ...state("switch.example_pc", "on"),
      ...state("binary_sensor.example_pc_connected", "unavailable"),
    };
    expect(pcPowerStatus(config, sensorUnavailable)).toEqual({ status: "unavailable" });

    const countdownFromSensor = {
      ...state("switch.example_pc", "off"),
      ...state("binary_sensor.example_pc_connected", "on"),
      ...state("timer.example_pc_shutdown", "active", { remaining: "00:04:00" }),
    };
    expect(pcPowerStatus(config, countdownFromSensor)).toEqual({ status: "countdown", remaining: "00:04:00" });

    expect(usageLabel(config, { ...state("sensor.example_pc_time_on_today", "2.44") })).toBe("2.4h today");
    expect(usageLabel(config, { ...state("sensor.example_pc_time_on_today", "unavailable") })).toBeUndefined();
    expect(usageLabel(config, { ...state("sensor.example_pc_time_on_today", "unknown") })).toBeUndefined();
    expect(usageLabel({ ...config, usage_entity: undefined }, {})).toBeUndefined();
  });
});
