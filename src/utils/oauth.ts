import { STORAGE_KEYS } from '../data/keys';

export interface OAuthReturn {
  token?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthStorage {
  local: Storage;
  session: Storage;
}

export class AniListRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AniListRequestError';
    this.status = status;
  }
}

export function isAniListAuthError(error: unknown): boolean {
  return (
    error instanceof AniListRequestError &&
    (error.status === 401 || error.status === 403 || /invalid token|unauthorized/i.test(error.message))
  );
}

function defaultStorage(): OAuthStorage {
  return { local: window.localStorage, session: window.sessionStorage };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function savePendingOAuthState(
  state: string,
  session: Storage = defaultStorage().session
): void {
  session.setItem(STORAGE_KEYS.OAUTH_STATE, state);
}

/** Reads the pending state and consumes it, even when the returned value is missing or wrong. */
export function consumePendingOAuthState(
  returned: string | undefined,
  session: Storage = defaultStorage().session
): boolean {
  let stored: string | null = null;
  try {
    stored = session.getItem(STORAGE_KEYS.OAUTH_STATE);
    session.removeItem(STORAGE_KEYS.OAUTH_STATE);
  } catch {
    return false;
  }
  return Boolean(stored && returned && stored.length >= 32 && stored === returned);
}

export function parseOAuthReturn(hash: string, search = ''): OAuthReturn {
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const queryParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    token: hashParams.get('access_token') ?? undefined,
    state: hashParams.get('state') ?? undefined,
    error: hashParams.get('error') ?? queryParams.get('error') ?? undefined,
    errorDescription:
      hashParams.get('error_description') ?? queryParams.get('error_description') ?? undefined,
  };
}

export function buildAniListOAuthUrl(clientId: string, state: string): string {
  if (!clientId) throw new Error('AniList sign-in is not configured');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    state,
  });
  return `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`;
}

export function loadOAuthToken(storage: OAuthStorage = defaultStorage()): string | null {
  try {
    const durable = storage.local.getItem(STORAGE_KEYS.OAUTH_TOKEN);
    if (durable) return durable;
  } catch {
    // Fall through to the legacy read path.
  }

  try {
    const legacy = storage.session.getItem(STORAGE_KEYS.OAUTH_TOKEN_LEGACY);
    if (!legacy) return null;
    storage.local.setItem(STORAGE_KEYS.OAUTH_TOKEN, legacy);
    storage.session.removeItem(STORAGE_KEYS.OAUTH_TOKEN_LEGACY);
    return legacy;
  } catch {
    return null;
  }
}

export function saveOAuthToken(token: string, storage: OAuthStorage = defaultStorage()): void {
  try {
    storage.local.setItem(STORAGE_KEYS.OAUTH_TOKEN, token);
    storage.session.removeItem(STORAGE_KEYS.OAUTH_TOKEN_LEGACY);
  } catch {
    // A blocked storage API must not turn a valid login into a crash.
  }
}

export function clearOAuthToken(storage: OAuthStorage = defaultStorage()): void {
  try {
    storage.local.removeItem(STORAGE_KEYS.OAUTH_TOKEN);
    storage.session.removeItem(STORAGE_KEYS.OAUTH_TOKEN_LEGACY);
  } catch {
    // Nothing else to clear.
  }
}
