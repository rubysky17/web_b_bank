import { storage } from '@/stores/storage';

const DEVICE_ID_KEY = 'device.id';

/** Random enough for an install id (not a secret): the server keeps one session per device id. */
function newDeviceId(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random()}-${random()}`;
}

/** Stable per-browser id, created on first use. */
export function getDeviceId(): string {
  let id = storage.getString(DEVICE_ID_KEY);
  if (!id) {
    id = newDeviceId();
    storage.set(DEVICE_ID_KEY, id);
  }
  return id;
}

/** "Chrome on macOS" style name, shown in the server's session list. */
function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** What the API wants to know about this device when signing in. */
export function getDeviceInfo() {
  return { deviceId: getDeviceId(), deviceName: deviceName(), platform: 'WEB' as const };
}
