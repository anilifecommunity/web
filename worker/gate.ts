import { safeFetch } from './guards';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_HOSTS = new Set(['challenges.cloudflare.com']);

export const GATE_COOKIE = 'anilife_gate';
export const GATE_TTL_SECONDS = 86_400;

export interface TurnstileResult {
  success: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await safeFetch(
    SITEVERIFY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    { allowedHosts: SITEVERIFY_HOSTS, timeoutMs: 8_000, maxBytes: 16_384 }
  );

  if (!response.ok) return { success: false, errorCodes: [`http_${response.status}`] };
  const data = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
  return { success: data.success === true, errorCodes: data['error-codes'] };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

export async function createGateToken(secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const expires = nowSeconds + GATE_TTL_SECONDS;
  const signature = await hmac(secret, `gate:${expires}`);
  return `${expires}.${signature}`;
}

export async function verifyGateToken(
  secret: string,
  token: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!token) return false;
  const [expiresRaw, signature] = token.split('.');
  if (!expiresRaw || !signature) return false;
  const expires = Number(expiresRaw);
  if (!Number.isSafeInteger(expires) || expires <= nowSeconds) return false;
  const expected = await hmac(secret, `gate:${expires}`);
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

export function gateCookie(token: string, sameSite: 'Lax' | 'None' = 'Lax'): string {
  return `${GATE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${GATE_TTL_SECONDS}`;
}
