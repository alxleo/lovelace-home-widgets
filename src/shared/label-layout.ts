export interface LabelRect { left: number; right: number; top: number; bottom: number }

const overlaps = (a: LabelRect, b: LabelRect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export const placeDirectLabel = (
  x: number,
  baseline: number,
  width: number,
  height: number,
  bounds: LabelRect,
  occupied: LabelRect[],
): { x: number; baseline: number; rect: LabelRect } => {
  const gap = 3;
  const fixedX = Math.min(Math.max(x, bounds.left), bounds.right - width);
  for (let offset = 0; offset <= occupied.length + 2; offset += 1) {
    for (const direction of offset === 0 ? [0] : [-1, 1]) {
      const y = Math.min(bounds.bottom, Math.max(bounds.top + height, baseline + direction * offset * (height + gap)));
      const rect = { left: fixedX - gap, right: fixedX + width + gap, top: y - height - gap, bottom: y + gap };
      if (!occupied.some((item) => overlaps(item, rect))) {
        occupied.push(rect);
        return { x: fixedX, baseline: y, rect };
      }
    }
  }
  const rect = { left: fixedX, right: fixedX + width, top: baseline - height, bottom: baseline };
  occupied.push(rect);
  return { x: fixedX, baseline, rect };
};
