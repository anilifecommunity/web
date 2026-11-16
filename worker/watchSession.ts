const VERSION = 1;
const AAD = new TextEncoder().encode('anilife-watch-v1');
export const WATCH_TTL_SECONDS = 4 * 60 * 60;

interface WatchClaims {
  v: 1;
  reference: string;
  tag: string;
  aniListId: number;
  episode: number;
  session: string;
  issuedAt: number;
  expiresAt: number;
}

export type WatchFailure = 'invalid' | 'expired' | 'wrong_session' | 'mismatch';

export type WatchVerification =
  | { ok: true; claims: WatchClaims }
  | { ok: false; reason: WatchFailure };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function sessionBinding(sessionToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`anilife-watch-session:${sessionToken}`)
  );
  return toBase64Url(new Uint8Array(digest));
}

function randomTag(): string {
  return [...crypto.getRandomValues(new Uint8Array(6))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function createWatchSession(
  secret: string,
  sessionToken: string,
  aniListId: number,
  episode: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<{ token: string; reference: string; tag: string; expiresAt: number }> {
  const reference = crypto.randomUUID();
  const tag = randomTag();
  const claims: WatchClaims = {
    v: VERSION,
    reference,
    tag,
    aniListId,
    episode,
    session: await sessionBinding(sessionToken),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + WATCH_TTL_SECONDS,
  };
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: AAD },
    await aesKey(secret),
    new TextEncoder().encode(JSON.stringify(claims))
  );
  return {
    token: `${VERSION}.${toBase64Url(nonce)}.${toBase64Url(new Uint8Array(ciphertext))}`,
    reference,
    tag,
    expiresAt: claims.expiresAt,
  };
}

async function decryptClaims(secret: string, token: string): Promise<WatchClaims | null> {
  const [version, nonceRaw, ciphertextRaw] = token.split('.');
  if (version !== String(VERSION) || !nonceRaw || !ciphertextRaw) return null;
  const nonce = fromBase64Url(nonceRaw);
  const ciphertext = fromBase64Url(ciphertextRaw);
  if (!nonce || nonce.length !== 12 || !ciphertext) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(nonce), additionalData: AAD },
      await aesKey(secret),
      asArrayBuffer(ciphertext)
    );
    const claims = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<WatchClaims>;
    if (
      claims.v !== VERSION ||
      typeof claims.reference !== 'string' ||
      typeof claims.tag !== 'string' ||
      !Number.isSafeInteger(claims.aniListId) ||
      !Number.isSafeInteger(claims.episode) ||
      typeof claims.session !== 'string' ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt)
    ) return null;
    return claims as WatchClaims;
  } catch {
    return null;
  }
}

export async function verifyWatchSession(
  secrets: string[],
  sessionToken: string,
  token: string,
  expected: { reference: string; tag: string; aniListId?: number; episode: number },
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<WatchVerification> {
  let claims: WatchClaims | null = null;
  for (const secret of secrets.filter(Boolean)) {
    claims = await decryptClaims(secret, token);
    if (claims) break;
  }
  if (!claims) return { ok: false, reason: 'invalid' };
  if (claims.expiresAt <= nowSeconds || claims.issuedAt > nowSeconds + 60) {
    return { ok: false, reason: 'expired' };
  }
  if (claims.session !== await sessionBinding(sessionToken)) {
    return { ok: false, reason: 'wrong_session' };
  }
  if (
    claims.reference !== expected.reference ||
    claims.tag !== expected.tag ||
    claims.episode !== expected.episode ||
    (expected.aniListId !== undefined && claims.aniListId !== expected.aniListId)
  ) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, claims };
}
