import { userIdFromToken } from './jwt';

const encode = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const token = (claims: object) => `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;

describe('userIdFromToken', () => {
  it('reads the subject', () => {
    expect(
      userIdFromToken(token({ sub: '0192f3c4-aaaa-7bbb-8ccc-1234567890ab', sid: 'x', exp: 1 })),
    ).toBe('0192f3c4-aaaa-7bbb-8ccc-1234567890ab');
  });

  it('handles base64url characters and missing padding', () => {
    // "~~~" encodes to "fn5+" in base64, "fn5-" in base64url.
    expect(userIdFromToken(token({ sub: 'user~~~?', n: '~~~' }))).toBe('user~~~?');
  });

  it('is null for anything else', () => {
    expect(userIdFromToken(null)).toBeNull();
    expect(userIdFromToken('')).toBeNull();
    expect(userIdFromToken('not-a-jwt')).toBeNull();
    expect(userIdFromToken('a.%%%.c')).toBeNull();
    expect(userIdFromToken(token({ sid: 'no-subject' }))).toBeNull();
  });
});
