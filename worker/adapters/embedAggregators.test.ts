import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAggregatorUrl } from './embedAggregators';

test('builds VidLink TV and movie URLs', () => {
  assert.equal(
    buildAggregatorUrl('vidlink', '127532', false, 2, 5),
    'https://vidlink.pro/tv/127532/2/5'
  );
  assert.equal(
    buildAggregatorUrl('vidlink', '127532', true, 1, 1),
    'https://vidlink.pro/movie/127532'
  );
});

test('builds VidFast and 2Embed URLs', () => {
  assert.equal(
    buildAggregatorUrl('vidfast', '127532', false, 1, 1),
    'https://vidfast.vc/tv/127532/1/1'
  );
  assert.equal(
    buildAggregatorUrl('2embed', 'tt21209876', false, 1, 1),
    'https://www.2embed.skin/embedtv/tt21209876&s=1&e=1'
  );
});
