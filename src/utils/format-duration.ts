const pad = (value: number) => String(value).padStart(2, '0');

/** Seconds as a clock: `4:05`, `12:30`, `1:02:03`. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Milliseconds as a clock rounded to the second (`42_400` → `0:42`); null stays null. */
export const formatClockMs = (ms: number | null) =>
  ms === null ? null : formatClock(Math.round(ms / 1000));

/** Option letter for a 0-based index: 0 → A, 1 → B … */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);
