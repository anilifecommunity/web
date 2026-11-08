import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeZokoPayload,
  parseZokoHtml,
  sanitizeAniChanSubtitleUrl,
  calculateMediaIndexShard,
  resolveUrl
} from './scraperParsers';

test('calculateMediaIndexShard handles standard AniList IDs', () => {
  assert.equal(calculateMediaIndexShard(154587), 154);
  assert.equal(calculateMediaIndexShard(162780), 162);
  assert.equal(calculateMediaIndexShard(999), 0);
  assert.equal(calculateMediaIndexShard(1000), 1);
});

test('sanitizeAniChanSubtitleUrl encodes spaces in subtitle filenames', () => {
  const input = '/subs/English (CR)0.vtt?md5=abc';
  const expected = 'https://anichan.to/subs/English%20(CR)0.vtt?md5=abc';
  assert.equal(sanitizeAniChanSubtitleUrl(input), expected);
});

test('decodeZokoPayload correctly decrypts XOR otaku-embed-v1 payload', () => {
  
  const originalJson = JSON.stringify({
    src: 'https://hls.testcdn.com/master.m3u8',
    subtitles: [{ lang: 'en', label: 'English', src: 'https://hls.testcdn.com/subs/en.vtt' }]
  });

  const rawBytes = Buffer.from(originalJson, 'utf-8');
  const key = Buffer.from('otaku-embed-v1', 'ascii');
  const encoded = Buffer.alloc(rawBytes.length);
  for (let i = 0; i < rawBytes.length; i++) {
    encoded[i] = rawBytes[i] ^ key[i % key.length];
  }

  const base64Str = encoded.toString('base64');
  const decoded = decodeZokoPayload(base64Str);

  assert.ok(decoded);
  assert.equal(decoded.src, 'https://hls.testcdn.com/master.m3u8');
  assert.equal(decoded.subtitles?.[0]?.label, 'English');
});

test('parseZokoHtml extracts and parses window.__P from HTML document', () => {
  const originalJson = JSON.stringify({
    src: 'https://hls.testcdn.com/stream.m3u8'
  });
  const rawBytes = Buffer.from(originalJson, 'utf-8');
  const key = Buffer.from('otaku-embed-v1', 'ascii');
  const encoded = Buffer.alloc(rawBytes.length);
  for (let i = 0; i < rawBytes.length; i++) {
    encoded[i] = rawBytes[i] ^ key[i % key.length];
  }
  const base64Str = encoded.toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Zoko Anime</title></head>
      <body>
        <script>
          window.__P = "${base64Str}";
        </script>
      </body>
    </html>
  `;

  const payload = parseZokoHtml(html);
  assert.ok(payload);
  assert.equal(payload.src, 'https://hls.testcdn.com/stream.m3u8');
});
