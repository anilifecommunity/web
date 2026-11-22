// The oldest member of a room is the host and the only one who broadcasts playback state.

export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const ROOM_CODE_LENGTH = 6;
export const MAX_ROOM_SIZE = 10;
export const HEARTBEAT_MS = 4000;
export const LATENCY_COMP_S = 0.25;
export const DRIFT_PLAYING_S = 1.5;
export const DRIFT_PAUSED_S = 0.5;

export type PartyAudio = 'SUB' | 'DUB';
export type PartyReason = 'play' | 'pause' | 'seek' | 'tick' | 'hello';

export interface PartyState {
  v: 1;
  reason: PartyReason;
  playing: boolean;
  t: number;
  ep: number;
  audio: PartyAudio;
}

export interface PartyMember {
  id: string;
  name: string;
  joinedAt: number;
}

export function generateRoomCode(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = '';
  // reject biased bytes so every symbol is equally likely
  const limit = 256 - (256 % ROOM_ALPHABET.length);
  while (out.length < ROOM_CODE_LENGTH) {
    for (const b of randomBytes(ROOM_CODE_LENGTH * 2)) {
      if (b < limit && out.length < ROOM_CODE_LENGTH) out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
    }
  }
  return out;
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return null;
  return code;
}

export function sanitizeName(input: unknown, fallback = 'Guest'): string {
  if (typeof input !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return cleaned || fallback;
}

export function parseState(raw: unknown): PartyState | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1) return null;
  if (typeof m.reason !== 'string' || !['play', 'pause', 'seek', 'tick', 'hello'].includes(m.reason)) return null;
  if (typeof m.playing !== 'boolean') return null;
  if (typeof m.t !== 'number' || !Number.isFinite(m.t) || m.t < 0 || m.t > 86_400) return null;
  if (typeof m.ep !== 'number' || !Number.isInteger(m.ep) || m.ep < 1 || m.ep > 10_000) return null;
  if (m.audio !== 'SUB' && m.audio !== 'DUB') return null;
  return { v: 1, reason: m.reason as PartyReason, playing: m.playing, t: m.t, ep: m.ep, audio: m.audio };
}

export function sortMembers(members: PartyMember[]): PartyMember[] {
  return [...members].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function pickHost(members: PartyMember[]): PartyMember | null {
  return sortMembers(members)[0] ?? null;
}

export function isOverCapacity(members: PartyMember[], selfId: string): boolean {
  const index = sortMembers(members).findIndex((m) => m.id === selfId);
  return index >= MAX_ROOM_SIZE;
}

export interface GuestPlan {
  changeEpisode: number | null;
  seekTo: number | null;
  play: boolean | null;
}

export function planGuestSync(
  local: { t: number; paused: boolean; ep: number },
  host: PartyState,
): GuestPlan {
  if (host.ep !== local.ep) return { changeEpisode: host.ep, seekTo: null, play: null };
  const expected = host.playing ? host.t + LATENCY_COMP_S : host.t;
  const tolerance = host.playing ? DRIFT_PLAYING_S : DRIFT_PAUSED_S;
  const seekTo = Math.abs(local.t - expected) > tolerance ? expected : null;
  let play: boolean | null = null;
  if (host.playing && local.paused) play = true;
  else if (!host.playing && !local.paused) play = false;
  return { changeEpisode: null, seekTo, play };
}

export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}
