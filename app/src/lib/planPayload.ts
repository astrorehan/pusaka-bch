export const MAX_PLAN_PAYLOAD = 40_000;
export const MAX_HEIR_NAME_LENGTH = 128;

export function encodePlanPayload(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePlanPayload(fragment: string): unknown {
  if (fragment.length > MAX_PLAN_PAYLOAD || !/^[A-Za-z0-9_-]+={0,2}$/.test(fragment)) {
    throw new Error('Invalid plan link payload');
  }
  const binary = atob(fragment.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
