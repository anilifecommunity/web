import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchVerifiedMediaIndexMedia, resetMediaIndexV1Cache } from './mediaIndexV1';

const RELEASE = 'rel-0123456789abcdef';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function descriptor(path: string, text: string) {
  return { path, bytes: new TextEncoder().encode(text).byteLength, sha256: await sha256(text) };
}

function response(text: string, status = 200, contentType = 'application/json'): Response {
  return new Response(text, {
    status,
    headers: {
      'content-type': contentType,
      'content-length': String(new TextEncoder().encode(text).byteLength),
    },
  });
}

async function fixture() {
  const id = 21;
  const bucket = (await sha256(`al-${id}`)).slice(0, 2);
  const mediaPath = `media/${bucket}/al-${id}.json`;
  const media = JSON.stringify({
    schemaVersion: '1.1.0',
    mediaKey: `al-${id}`,
    ids: { anilist: id, mal: 21 },
    titles: { english: 'One Piece', romaji: 'ONE PIECE', native: 'ONE PIECE', synonyms: [] },
  });
  const mediaDescriptor = await descriptor(mediaPath, media);
  const bucketPath = `manifests/media/${bucket}.json`;
  const bucketManifest = JSON.stringify({ schemaVersion: '1.1.0', bucket, files: [mediaDescriptor] });
  const bucketDescriptor = await descriptor(bucketPath, bucketManifest);
  const manifest = JSON.stringify({
    schemaVersion: '1.1.0',
    contract: 'anilife.media',
    releaseId: RELEASE,
    sources: [{ name: 'anilist', status: 'verified', permitted: true }],
    manifests: {
      media: { files: [bucketDescriptor] },
      episodes: { files: [] },
    },
  });
  const pointer = JSON.stringify({
    schemaVersion: '1.1.0',
    contract: 'anilife.media',
    releaseId: RELEASE,
    releaseManifest: `releases/${RELEASE}/manifest.json`,
    manifestSha256: await sha256(manifest),
    publishedAt: '2026-11-17T12:01:00Z',
  });
  return { id, bucketPath, mediaPath, pointer, manifest, bucketManifest, media };
}

test('Worker title lookup accepts only a hash-verified immutable record', async () => {
  const data = await fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname;
    const raw = url.hostname === 'raw.githubusercontent.com';
    if (path.endsWith('/manifest.json') && !path.includes('/releases/')) return response(data.pointer, 200, raw ? 'text/plain' : 'application/json');
    if (path.endsWith(`/releases/${RELEASE}/manifest.json`)) return response(data.manifest);
    if (path.endsWith(`/releases/${RELEASE}/${data.bucketPath}`)) return response(data.bucketManifest);
    if (path.endsWith(`/releases/${RELEASE}/${data.mediaPath}`)) {
      return raw ? response(data.media, 200, 'text/plain') : response('Package size exceeded', 403, 'text/plain');
    }
    return new Response('missing', { status: 404 });
  };
  resetMediaIndexV1Cache();
  try {
    const result = await fetchVerifiedMediaIndexMedia(data.id, 1_000);
    assert.equal(result?.titles.english, 'One Piece');
    assert.equal(result?.ids.mal, 21);
  } finally {
    globalThis.fetch = originalFetch;
    resetMediaIndexV1Cache();
  }
});

test('Worker title lookup rejects a tampered immutable record', async () => {
  const data = await fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    if (path.endsWith('/manifest.json') && !path.includes('/releases/')) return response(data.pointer);
    if (path.endsWith(`/releases/${RELEASE}/manifest.json`)) return response(data.manifest);
    if (path.endsWith(`/releases/${RELEASE}/${data.bucketPath}`)) return response(data.bucketManifest);
    if (path.endsWith(`/releases/${RELEASE}/${data.mediaPath}`)) {
      return response(data.media.replace('One Piece', 'Tampered title'));
    }
    return new Response('missing', { status: 404 });
  };
  resetMediaIndexV1Cache();
  try {
    assert.equal(await fetchVerifiedMediaIndexMedia(data.id, 1_000), null);
  } finally {
    globalThis.fetch = originalFetch;
    resetMediaIndexV1Cache();
  }
});

test('Worker title lookup fails closed when JSON has no content type', async () => {
  const data = await fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(data.pointer, { status: 200 });
  resetMediaIndexV1Cache();
  try {
    assert.equal(await fetchVerifiedMediaIndexMedia(data.id, 1_000), null);
  } finally {
    globalThis.fetch = originalFetch;
    resetMediaIndexV1Cache();
  }
});
