import assert from 'node:assert/strict';
import test from 'node:test';
import { errorPresentation } from './errorExperience';

test('HTTP and Cloudflare error statuses have accurate shared copy', () => {
  for (const status of [400, 401, 403, 404, 405, 408, 409, 410, 413, 415, 422, 429, 451, 500, 501, 502, 503, 504, 507, 520, 521, 522, 523, 524, 525, 526, 530]) {
    const presentation = errorPresentation({ status, code: 'http_error' });
    assert.ok(presentation.title.length > 0, String(status));
    assert.ok(presentation.message.length > 0, String(status));
  }
  assert.match(errorPresentation({ status: 525, code: 'http_error' }).message, /TLS/i);
});
test('anime failures override generic status copy without falsifying the status', () => {
  assert.equal(errorPresentation({ status: 410, code: 'watch_session_expired' }).title, 'Your watch link has expired.');
  assert.equal(errorPresentation({ status: 409, code: 'episode_unreleased' }).title, "This episode hasn't aired yet.");
  assert.equal(errorPresentation({ status: 404, code: 'anime_not_found' }).title, 'This anime could not be found.');
});

