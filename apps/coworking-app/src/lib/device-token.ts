// Shared localStorage key — deviceApi reads the same one for its Authorization header.
const TOKEN_KEY = 'neofilm_device_token';

export function getDeviceToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setDeviceToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearDeviceToken(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}
