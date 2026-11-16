export const WATCH_TTL_SECONDS = 365 * 24 * 60 * 60;

export type WatchFailure = 'invalid' | 'mismatch';

export type WatchVerification =
  | { ok: true; aniListId: number; expiresAt: number }
  | { ok: false; reason: WatchFailure };

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function watchIdentity(secret: string, sessionToken: string, aniListId: number): Promise<{
  reference: string;
  tag: string;
}> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`anilife-watch-v2:${sessionToken}:${aniListId}`)
  ));
  const uuid = digest.slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = toHex(uuid);
  return {
    reference: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    tag: toHex(digest.slice(16, 22)),
  };
}

function sessionExpiry(sessionToken: string, nowSeconds: number): number {
  const expiresAt = Number(sessionToken.split('.')[0]);
  return Number.isSafeInteger(expiresAt) && expiresAt > nowSeconds
    ? expiresAt
    : nowSeconds + WATCH_TTL_SECONDS;
}

export async function createWatchSession(
  secret: string,
  sessionToken: string,
  aniListId: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<{ reference: string; tag: string; expiresAt: number }> {
  return {
    ...await watchIdentity(secret, sessionToken, aniListId),
    expiresAt: sessionExpiry(sessionToken, nowSeconds),
  };
}

export async function verifyWatchSession(
  secrets: string[],
  sessionToken: string,
  expected: { reference: string; tag: string; aniListId: number },
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<WatchVerification> {
  if (!Number.isSafeInteger(expected.aniListId) || expected.aniListId < 1) {
    return { ok: false, reason: 'invalid' };
  }
  for (const secret of secrets.filter(Boolean)) {
    const identity = await watchIdentity(secret, sessionToken, expected.aniListId);
    if (
      timingSafeEqual(identity.reference, expected.reference) &&
      timingSafeEqual(identity.tag, expected.tag)
    ) {
      return {
        ok: true,
        aniListId: expected.aniListId,
        expiresAt: sessionExpiry(sessionToken, nowSeconds),
      };
    }
  }
  return { ok: false, reason: 'mismatch' };
}
