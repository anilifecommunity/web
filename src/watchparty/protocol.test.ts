import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_ALPHABET, ROOM_CODE_LENGTH, MAX_ROOM_SIZE,
  generateRoomCode, normalizeRoomCode, sanitizeName, parseState, pickHost, isOverCapacity, planGuestSync,
  type PartyMember, type PartyState,
} from './protocol';

const state = (over: Partial<PartyState> = {}): PartyState => ({ v: 1, reason: 'tick', playing: true, t: 100, ep: 3, audio: 'SUB', ...over });

test('room codes use the unambiguous alphabet and normalize', () => {
  const code = generateRoomCode();
  assert.equal(code.length, ROOM_CODE_LENGTH);
  for (const ch of code) assert.ok(ROOM_ALPHABET.includes(ch));
  assert.equal(normalizeRoomCode(' abc-234 '), 'ABC234');
  assert.equal(normalizeRoomCode('ABC23'), null);
  assert.equal(normalizeRoomCode('ABC0O1'), null);
});

test('room code generation skips biased bytes', () => {
  const out = generateRoomCode((n) => Uint8Array.from({ length: n }, (_, i) => (i % 2 ? 255 : 0)));
  assert.equal(out.length, ROOM_CODE_LENGTH); // 255 >= limit is rejected, 0 maps to 'A'
  assert.equal(out, 'AAAAAA');
});

test('names are cleaned', () => {
  assert.equal(sanitizeName('  Bob <b>  the   Great '), 'Bob b the Great');
  assert.equal(sanitizeName('   '), 'Guest');
  assert.equal(sanitizeName(42), 'Guest');
  assert.equal(sanitizeName('x'.repeat(100)).length, 24);
});

test('parseState rejects malformed payloads', () => {
  assert.deepEqual(parseState(state()), state());
  for (const bad of [null, 'x', {}, state({ t: -1 }), state({ t: NaN }), state({ ep: 0 }), state({ ep: 1.5 }),
    { ...state(), v: 2 }, { ...state(), audio: 'FR' }, { ...state(), reason: 'nuke' }, { ...state(), playing: 'yes' }]) {
    assert.equal(parseState(bad), null);
  }
});

test('host is the oldest member; ties break by id; leaving promotes the next', () => {
  const a: PartyMember = { id: 'b', name: 'A', joinedAt: 10 };
  const b: PartyMember = { id: 'a', name: 'B', joinedAt: 10 };
  const c: PartyMember = { id: 'c', name: 'C', joinedAt: 5 };
  assert.equal(pickHost([a, b, c])?.id, 'c');
  assert.equal(pickHost([a, b])?.id, 'a');
  assert.equal(pickHost([]), null);
});

test('room capacity turns away the newest joiners', () => {
  const members = Array.from({ length: MAX_ROOM_SIZE + 1 }, (_, i) => ({ id: `m${String(i).padStart(2, '0')}`, name: 'x', joinedAt: i }));
  assert.equal(isOverCapacity(members, 'm00'), false);
  assert.equal(isOverCapacity(members, `m${String(MAX_ROOM_SIZE).padStart(2, '0')}`), true);
});

test('guest sync: episode change wins, drift is corrected, play state follows', () => {
  assert.deepEqual(planGuestSync({ t: 5, paused: true, ep: 1 }, state({ ep: 3 })), { changeEpisode: 3, seekTo: null, play: null });
  assert.deepEqual(planGuestSync({ t: 100.5, paused: false, ep: 3 }, state()), { changeEpisode: null, seekTo: null, play: null });
  assert.deepEqual(planGuestSync({ t: 90, paused: false, ep: 3 }, state()), { changeEpisode: null, seekTo: 100.25, play: null });
  assert.deepEqual(planGuestSync({ t: 100, paused: true, ep: 3 }, state()), { changeEpisode: null, seekTo: null, play: true });
  assert.deepEqual(planGuestSync({ t: 100, paused: false, ep: 3 }, state({ playing: false })), { changeEpisode: null, seekTo: null, play: false });
  assert.deepEqual(planGuestSync({ t: 101, paused: true, ep: 3 }, state({ playing: false })), { changeEpisode: null, seekTo: 100, play: null });
});
