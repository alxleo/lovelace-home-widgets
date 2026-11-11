/** Reciprocal colour temperature: cool at 0, warm at 1000, full native bounds. */
export const whitePosition = (kelvin: number, bounds: [number, number]): number =>
  Math.max(0, Math.min(1000, (1 / kelvin - 1 / bounds[1]) / (1 / bounds[0] - 1 / bounds[1]) * 1000));

export const whiteKelvin = (position: number, bounds: [number, number]): number =>
  Math.round(1 / (1 / bounds[1] + Math.max(0, Math.min(1000, position)) / 1000 * (1 / bounds[0] - 1 / bounds[1])));
