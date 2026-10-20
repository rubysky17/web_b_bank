import en from './locales/en.json';
import vi from './locales/vi.json';

/** Every key path of a locale file, e.g. `vocab.filter.all`. */
function keyPaths(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keyPaths(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('locales', () => {
  // Only vi.json is type-checked; this keeps en.json complete.
  it('have the same keys in English and Vietnamese', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(vi).sort());
  });
});
