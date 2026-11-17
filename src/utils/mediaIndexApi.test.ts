import test from 'node:test';
import assert from 'node:assert/strict';
import { isAnimeDubbed } from './mediaIndexApi';

test('dub availability stays unknown on index failure and retries later', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response('', { status: 503 })
      : new Response(JSON.stringify([207191]), { status: 200 });
  };

  try {
    assert.equal(await isAnimeDubbed(207191), null);
    assert.equal(await isAnimeDubbed(207191), true);
    assert.equal(await isAnimeDubbed(1), false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
