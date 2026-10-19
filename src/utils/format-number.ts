const UNITS = [
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
] as const;

/**
 * 950 → "950", 1_234 → "1.2K", 2_500_000 → "2.5M".
 * Hand-rolled instead of Intl `notation: 'compact'`, whose output differs across Android ICU versions.
 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  for (const { value: unit, suffix } of UNITS) {
    if (abs >= unit) {
      const scaled = Math.round((value / unit) * 10) / 10;
      return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}${suffix}`;
    }
  }
  return String(value);
}
