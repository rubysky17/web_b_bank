import { donutSegments, labelIndexes, scaleLinear, toLinePath } from './geometry';

describe('scaleLinear', () => {
  it('maps the domain onto the range, inverted ranges included', () => {
    const y = scaleLinear([0, 100], [180, 20]);
    expect(y(0)).toBe(180);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(20);
  });

  it('puts every value in the middle when the domain is a single point', () => {
    expect(scaleLinear([0, 0], [10, 30])(0)).toBe(20);
  });
});

describe('toLinePath', () => {
  it('moves to the first point and draws lines to the rest', () => {
    expect(
      toLinePath([
        { x: 0, y: 10 },
        { x: 5.555, y: 2 },
      ]),
    ).toBe('M0 10 L5.56 2');
  });
});

describe('donutSegments', () => {
  it('splits the circumference proportionally, back to back', () => {
    expect(donutSegments([1, 3], 100)).toEqual([
      { length: 25, start: 0 },
      { length: 75, start: 25 },
    ]);
  });

  it('leaves zero slices out and keeps a gap between visible ones', () => {
    expect(donutSegments([1, 0, 1], 100, 2)).toEqual([
      { length: 48, start: 0 },
      null,
      { length: 48, start: 50 },
    ]);
  });

  it('draws a single slice as a full ring without a gap', () => {
    expect(donutSegments([0, 4], 100, 2)).toEqual([null, { length: 100, start: 0 }]);
  });

  it('returns no segments when everything is zero', () => {
    expect(donutSegments([0, 0], 100)).toEqual([null, null]);
  });
});

describe('labelIndexes', () => {
  it('labels every point when there are few', () => {
    expect(labelIndexes(4)).toEqual([0, 1, 2, 3]);
  });

  it('thins out labels and always keeps the last one', () => {
    expect(labelIndexes(20)).toEqual([0, 4, 8, 12, 16, 19]);
    expect(labelIndexes(13)).toEqual([0, 3, 6, 9, 12]);
  });
});
