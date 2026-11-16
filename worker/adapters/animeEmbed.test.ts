import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnimeEmbedUrl } from './animeEmbed';

test('builds documented AnimeEmbed URLs for sub and dub', () => {
  assert.equal(
    buildAnimeEmbedUrl(21, '1', 'sub'),
    'https://animeembed.com/embed/ani/21/1?track=sub&autoNext=0&accent=74cf66'
  );
  assert.equal(
    buildAnimeEmbedUrl(21, '2.5', 'dub'),
    'https://animeembed.com/embed/ani/21/2.5?track=dub&autoNext=0&accent=74cf66'
  );
});

test('refuses an ambiguous audio request', () => {
  assert.throws(
    () => buildAnimeEmbedUrl(21, '1', 'unknown'),
    (error: any) => error.reason === 'audio_unavailable'
  );
});
