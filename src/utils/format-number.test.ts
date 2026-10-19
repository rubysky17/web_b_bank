import { formatCompactNumber } from './format-number';

describe('formatCompactNumber', () => {
  it.each([
    [0, '0'],
    [950, '950'],
    [1_000, '1K'],
    [1_234, '1.2K'],
    [2_500_000, '2.5M'],
    [3_000_000_000, '3B'],
    [-1_500, '-1.5K'],
  ])('%d → %s', (input, expected) => {
    expect(formatCompactNumber(input)).toBe(expected);
  });
});
