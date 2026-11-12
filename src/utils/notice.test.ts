import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABOUT_NOTICE_KEY,
  markAboutNoticeSeen,
  shouldShowAboutNotice,
} from './notice';

function memoryStorage(value: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(value));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

test('the About notice is shown until it is dismissed once', () => {
  const storage = memoryStorage();
  assert.equal(shouldShowAboutNotice(storage), true);
  markAboutNoticeSeen(storage);
  assert.equal(storage.getItem(ABOUT_NOTICE_KEY), '1');
  assert.equal(shouldShowAboutNotice(storage), false);
});
