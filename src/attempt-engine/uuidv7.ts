/**
 * UUIDv7 (time-ordered) for event ids. Uniqueness is all that matters here (the server stores an
 * uploaded event once per id), so `Math.random` is enough when `crypto` is missing (Hermes).
 */
export function uuidv7(now = Date.now()): string {
  const bytes = new Uint8Array(16);
  const random = globalThis.crypto?.getRandomValues;
  if (random) random.call(globalThis.crypto, bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);

  let time = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
