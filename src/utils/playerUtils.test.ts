import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  formatPlayerClock,
  calculateProgressPercent,
  isWatched,
  clampSpeed
} from './playerUtils';

test('formatTime correctly formats seconds', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65), '01:05');
  assert.equal(formatTime(3600), '1:00:00');
  assert.equal(formatTime(3665), '1:01:05');
});

test('calculateProgressPercent calculates percentage clamped between 0 and 100', () => {
  assert.equal(calculateProgressPercent(0, 100), 0);
  assert.equal(calculateProgressPercent(50, 100), 50);
  assert.equal(calculateProgressPercent(150, 100), 100);
  assert.equal(calculateProgressPercent(0, 0), 0);
});

test('isWatched respects the threshold', () => {
  assert.equal(isWatched(79, 100, 80), false);
  assert.equal(isWatched(80, 100, 80), true);
  assert.equal(isWatched(90, 100, 80), true);
});

test('formatPlayerClock computes ending time string', () => {
  const baseTime = new Date('2026-11-02T22:03:00');
  const clock = formatPlayerClock(0, 24 * 60, baseTime);
  assert.equal(clock.displayString.includes('10:03 PM'), true);
  assert.equal(clock.displayString.includes('Ends at 10:27 PM'), true);
});

test('clampSpeed picks the closest playback rate', () => {
  assert.equal(clampSpeed(1.1), 1);
  assert.equal(clampSpeed(1.2), 1.25);
  assert.equal(clampSpeed(2.5), 2);
});
