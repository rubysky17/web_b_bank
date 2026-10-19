import { useEffect, useState } from 'react';

import { secondsLeft } from '@/api/attempt-state';

/**
 * Seconds left until `expiresAt` on the server clock, ticking every second; null when untimed.
 * `offsetMs` is server time minus device time (see clockOffsetMs).
 */
export function useCountdown(expiresAt: string | null, offsetMs: number): number | null {
  const compute = () => (expiresAt === null ? null : secondsLeft(expiresAt, offsetMs));
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    const tick = () => setLeft(expiresAt === null ? null : secondsLeft(expiresAt, offsetMs));
    tick();
    if (expiresAt === null) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, offsetMs]);

  return left;
}
