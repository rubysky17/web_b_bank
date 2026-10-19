import { formatClock, formatClockMs, optionLetter } from './format-duration';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [750, '12:30'],
    [3723, '1:02:03'],
  ])('%i seconds → %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  it('never shows negative or fractional time', () => {
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(59.9)).toBe('0:59');
  });
});

describe('formatClockMs', () => {
  it('rounds milliseconds to the second', () => {
    expect(formatClockMs(42_400)).toBe('0:42');
    expect(formatClockMs(125_600)).toBe('2:06');
    expect(formatClockMs(null)).toBeNull();
  });
});

describe('optionLetter', () => {
  it('maps indexes to letters', () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(['A', 'B', 'C', 'D']);
  });
});
