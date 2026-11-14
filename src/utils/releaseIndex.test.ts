import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DownloadGroup } from '../components/DownloadSection';
import { fetchDownloadIndex, parseDownloadIndex } from './releaseIndex';

const ASSETS = [
  ['mobile-universal', 'mobile', 'universal', true, 'Anilife.apk'],
  ['mobile-arm64', 'mobile', 'arm64-v8a', false, 'Anilife_arm64-v8a.apk'],
  ['mobile-armv7', 'mobile', 'armeabi-v7a', false, 'Anilife_armeabi-v7a.apk'],
  ['tv-universal', 'tv', 'universal', true, 'Anilife_tv.apk'],
  ['tv-arm64', 'tv', 'arm64-v8a', false, 'Anilife_tv_arm64-v8a.apk'],
  ['tv-armv7', 'tv', 'armeabi-v7a', false, 'Anilife_tv_armeabi-v7a.apk'],
] as const;

function validIndex() {
  const tag = 'v0.1.2';
  return {
    schema: 1,
    channel: 'stable',
    version: '0.1.2',
    versionCode: 5,
    sequence: 5,
    tag,
    publishedAt: '2026-11-14T18:24:23Z',
    releaseUrl: `https://github.com/anilifecommunity/android-and-tv/releases/tag/${tag}`,
    updateEvent: { id: '1'.repeat(64), pubkey: '2'.repeat(64), sig: '3'.repeat(128) },
    assets: ASSETS.map(([id, formFactor, abi, recommended, name]) => ({
      id,
      formFactor,
      abi,
      recommended,
      name,
      url: `https://github.com/anilifecommunity/android-and-tv/releases/download/${tag}/${name}`,
      sha256: 'a'.repeat(64),
      sizeBytes: 21_008_080,
    })),
  };
}

test('accepts the exact six stable downloads in Android publisher order', () => {
  const parsed = parseDownloadIndex(validIndex());
  assert.deepEqual(parsed.assets.map((asset) => asset.name), ASSETS.map((asset) => asset[4]));
  assert.deepEqual(
    parsed.assets.filter((asset) => asset.recommended).map((asset) => asset.id),
    ['mobile-universal', 'tv-universal']
  );
});

test('renders all six download choices with recommended universal builds', () => {
  const index = parseDownloadIndex(validIndex());
  const html = [
    renderToStaticMarkup(
      createElement(DownloadGroup, {
        title: 'Android',
        assets: index.assets.filter((asset) => asset.formFactor === 'mobile'),
        version: index.version,
      })
    ),
    renderToStaticMarkup(
      createElement(DownloadGroup, {
        title: 'Android TV / Fire TV',
        assets: index.assets.filter((asset) => asset.formFactor === 'tv'),
        version: index.version,
      })
    ),
  ].join('');

  assert.equal((html.match(/<a /g) ?? []).length, 6);
  assert.equal((html.match(/Recommended/g) ?? []).length, 2);
  for (const asset of index.assets) assert.ok(html.includes(asset.name));
});

test('rejects missing assets and prerelease-shaped indexes', () => {
  const missing = validIndex();
  missing.assets.pop();
  assert.throws(() => parseDownloadIndex(missing));

  const prerelease = validIndex() as Record<string, unknown>;
  prerelease.version = '0.1.3-beta.1';
  prerelease.tag = 'v0.1.3-beta.1';
  prerelease.channel = 'beta';
  assert.throws(() => parseDownloadIndex(prerelease));
});

test('rejects an untrusted asset URL or malformed index', () => {
  const wrongUrl = validIndex();
  wrongUrl.assets[0].url = 'https://example.invalid/Anilife.apk';
  assert.throws(() => parseDownloadIndex(wrongUrl));
  assert.throws(() => parseDownloadIndex({ schema: 1, channel: 'stable' }));
});

test('surfaces rate limiting and network failure as unavailable', async () => {
  const rateLimited = async () => new Response('{"error":"rate_limited"}', { status: 429 });
  await assert.rejects(() => fetchDownloadIndex(undefined, rateLimited as typeof fetch));

  const networkFailure = async () => {
    throw new Error('offline');
  };
  await assert.rejects(() => fetchDownloadIndex(undefined, networkFailure as typeof fetch));
});
