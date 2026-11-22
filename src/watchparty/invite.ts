import { normalizeRoomCode } from './protocol';

const KEY = 'anilife.watchparty.invite';

// The router rewrites the URL and drops the query string, so the invite is kept before that happens.
export function captureInviteFromUrl(search: string = window.location.search): void {
  try {
    const code = normalizeRoomCode(new URLSearchParams(search).get('party') ?? '');
    if (code) sessionStorage.setItem(KEY, code);
  } catch { /* storage unavailable */ }
}

export function takeInvite(): string | null {
  try {
    const code = sessionStorage.getItem(KEY);
    if (code) sessionStorage.removeItem(KEY);
    return code && normalizeRoomCode(code) ? code : null;
  } catch { return null; }
}
