/**
 * Release smoke test. No dependencies; run against a deployed preview or local Worker.
 *
 *   node scripts/smoke.mjs https://anilife.cc
 */

const base = (process.argv[2] || 'https://anilife.cc').replace(/\/$/, '');
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name} - ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await check('health', async () => {
  const response = await fetch(`${base}/api/health`);
  assert(response.ok, `status ${response.status}`);
  const data = await response.json();
  assert(data.ok === true && data.service === 'anilife-web', 'unexpected body');
  return `gate=${data.gate} adapters=${(data.adapters || []).join(',')}`;
});

await check('provider catalogue has at least 40 entries', async () => {
  const response = await fetch(`${base}/api/providers`);
  assert(response.ok, `status ${response.status}`);
  const data = await response.json();
  assert(Array.isArray(data.providers), 'providers missing');
  assert(data.providers.length >= 40, `only ${data.providers.length}`);
  assert(data.providers.every((item) => item.capabilities?.adultOnly !== true), 'adult provider leaked');
  assert(Array.isArray(data.downstreams), 'downstreams missing');
  assert(
    data.downstreams.some((item) => item.id === 'flixcloud' && item.status === 'in-use'),
    'verified downstream missing'
  );
  return `${data.providers.length} providers, ${data.downstreams.length} downstreams`;
});

await check('resolve refuses an arbitrary destination', async () => {
  const query = new URLSearchParams({
    aniListId: '1',
    episode: '1',
    provider: 'bee',
    url: 'https://example.org/secret',
    referer: 'https://evil.example/',
  });
  const response = await fetch(`${base}/api/resolve?${query}`);
  assert([400, 401, 403, 404].includes(response.status), `status ${response.status}`);
  const data = await response.json();
  assert(data.ok === false, 'expected a JSON failure');
  return `${response.status} ${data.error}`;
});

await check('app shell', async () => {
  const response = await fetch(`${base}/`);
  assert(response.ok, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes('Anilife'), 'branding missing');
  const csp = response.headers.get('content-security-policy') || '';
  assert(csp.includes("frame-ancestors 'none'"), 'anti-frame CSP missing');
  assert(!/script-src[^;]*unsafe-inline/.test(csp), 'inline script CSP remains enabled');
  assert(response.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options missing');
  assert(response.headers.get('x-content-type-options') === 'nosniff', 'nosniff missing');
  assert(response.headers.get('referrer-policy') === 'no-referrer', 'no-referrer policy missing');
  return `status ${response.status}`;
});

await check('Discord framing is isolated to the Activity route', async () => {
  const response = await fetch(`${base}/activity?frame_id=smoke&instance_id=smoke`);
  assert(response.ok, `status ${response.status}`);
  assert(response.headers.get('content-security-policy')?.includes('https://*.discordsays.com'), 'Discord ancestor missing');
  assert(!response.headers.has('x-frame-options'), 'Activity has a conflicting X-Frame-Options header');
  return `status ${response.status}`;
});

await check('protected watch routes do not leak referrers', async () => {
  const response = await fetch(`${base}/watch/01a1dff1-a48d-71ff-8931-4f1c0ae8e860/episode-1-cf01ae4cd9ba`);
  assert(response.ok, `status ${response.status}`);
  assert(response.headers.get('referrer-policy') === 'no-referrer', 'watch referrer policy missing');
  assert(response.headers.get('cache-control') === 'no-store', 'watch cache policy missing');
  assert(response.headers.get('x-robots-tag') === 'noindex, nofollow', 'watch indexing policy missing');
  return `status ${response.status}`;
});

await check('deep links serve the shell', async () => {
  for (const path of ['/anime/151807', '/discover', '/downloads', '/settings']) {
    const response = await fetch(`${base}${path}`);
    assert(response.ok, `${path} status ${response.status}`);
    assert(response.headers.get('content-type')?.includes('text/html'), `${path} is not HTML`);
    const html = await response.text();
    assert(html.includes('id="root"'), `${path} shell missing`);
  }
  return 'anime, discover, downloads, settings';
});

await check('PWA manifest', async () => {
  const response = await fetch(`${base}/manifest.webmanifest`);
  assert(response.ok, `status ${response.status}`);
  const manifest = await response.json();
  assert(manifest.name === 'Anilife' && Array.isArray(manifest.icons), 'bad manifest');
  return manifest.name;
});

await check('service worker', async () => {
  const response = await fetch(`${base}/sw.js`);
  assert(response.ok, `status ${response.status}`);
  const text = await response.text();
  assert(text.includes('anilife-shell-${BUILD_ID}'), 'build-derived shell cache missing');
  return `status ${response.status}`;
});

await check('OAuth callback page', async () => {
  const response = await fetch(`${base}/auth/callback.html`);
  assert(response.ok, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes('Connecting to AniList'), 'callback page not served');
  assert(html.includes('src="/auth/callback.js"'), 'external callback script missing');
  const script = await fetch(`${base}/auth/callback.js`);
  assert(script.ok, `callback script status ${script.status}`);
  return `status ${response.status}`;
});

await check('API 404 is JSON, not the SPA', async () => {
  const response = await fetch(`${base}/api/does-not-exist`);
  assert(response.status === 404, `status ${response.status}`);
  const data = await response.json();
  assert(data.ok === false, 'not a JSON error');
  assert(response.headers.get('x-request-id'), 'request id missing');
  assert(response.headers.get('x-anilife-error-class') === 'request', 'error class missing');
  return data.error;
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');

