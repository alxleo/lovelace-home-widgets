import { describe, expect, it } from "vitest";
import { whiteKelvin, whitePosition } from "../src/cards/light-row/white-scale";

describe("full-range white tone", () => {
  it("gives warm whites more room while retaining both hardware endpoints", () => {
    const bounds: [number, number] = [2000, 6535];
    expect(whiteKelvin(0, bounds)).toBe(6535);
    expect(whiteKelvin(1000, bounds)).toBe(2000);
    expect(whitePosition(2700, bounds)).toBeCloseTo(626.4, 0);
    expect(whitePosition(3500, bounds)).toBeLessThan(400);
    for (const kelvin of [2000, 2200, 2700, 3000, 4000, 5000, 6535]) expect(whiteKelvin(whitePosition(kelvin, bounds), bounds)).toBe(kelvin);
  });
  it("follows each device's actual bounds and clamps touch/keyboard overshoot", () => {
    const bounds: [number, number] = [2700, 4500];
    expect(whiteKelvin(-1, bounds)).toBe(4500);
    expect(whiteKelvin(1001, bounds)).toBe(2700);
    expect(whitePosition(1000, bounds)).toBe(1000);
    expect(whitePosition(9000, bounds)).toBe(0);
  });
});
