/** Chart math (pure, no React). */

export type Point = { x: number; y: number };

/** Maps `[d0, d1]` onto `[r0, r1]`; a zero-width domain maps to the middle of the range. */
export function scaleLinear([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  return (value: number) =>
    d1 === d0 ? (r0 + r1) / 2 : r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

const round = (value: number) => Math.round(value * 100) / 100;

/** SVG path through the points: `M x y L x y …`. */
export const toLinePath = (points: readonly Point[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');

export type DonutSegment = {
  /** Visible arc length. */
  length: number;
  /** Where the arc starts, measured along the circle from the top. */
  start: number;
};

/**
 * Arcs of a donut drawn as one stroked circle per slice. Zero slices get `null`; neighbouring
 * slices are separated by `gap` (taken from each arc's end) when more than one is visible.
 */
export function donutSegments(
  values: readonly number[],
  circumference: number,
  gap = 0,
): (DonutSegment | null)[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values.map(() => null);
  const gapLength = values.filter((value) => value > 0).length > 1 ? gap : 0;
  let start = 0;
  return values.map((value) => {
    if (value <= 0) return null;
    const arc = (value / total) * circumference;
    const segment = { length: Math.max(arc - gapLength, 0), start };
    start += arc;
    return segment;
  });
}

/** Indexes of the x labels to show: all when few, otherwise about `max` evenly spaced plus the last. */
export function labelIndexes(count: number, max = 6): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / max);
  const indexes = Array.from({ length: Math.ceil(count / step) }, (_, i) => i * step);
  // Drop the label right before the last one if they would crowd each other.
  if (count - 1 - indexes[indexes.length - 1]! < step / 2) indexes.pop();
  return [...indexes, count - 1];
}
