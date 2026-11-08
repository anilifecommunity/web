/**
 * Release smoke test. No dependencies; run against a deployed preview or local Worker.
 *
 *   node scripts/smoke.mjs https://anilife-web.adfreegames.workers.dev
 */

const base = (process.argv[2] || 'https://anilife-web.adfreegames.workers.dev').replace(/\/$/, '');
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
  return `${data.providers.length} providers`;
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
  assert([400, 403, 404].includes(response.status), `status ${response.status}`);
  const data = await response.json();
  assert(data.ok === false, 'expected a JSON failure');
  return `${response.status} ${data.error}`;
});

await check('app shell', async () => {
  const response = await fetch(`${base}/`);
  assert(response.ok, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes('Anilife'), 'branding missing');
  assert(response.headers.get('content-security-policy'), 'CSP missing');
  assert(response.headers.get('x-content-type-options') === 'nosniff', 'nosniff missing');
  return `status ${response.status}`;
});

await check('deep link serves the shell', async () => {
  const response = await fetch(`${base}/anime/151807`);
  assert(response.ok, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes('id="root"'), 'shell missing');
  return `status ${response.status}`;
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
  assert(text.includes('anilife-shell'), 'shell cache missing');
  return `status ${response.status}`;
});

await check('OAuth callback page', async () => {
  const response = await fetch(`${base}/auth/callback.html`);
  assert(response.ok, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes('Connecting to AniList'), 'callback page not served');
  return `status ${response.status}`;
});

await check('API 404 is JSON, not the SPA', async () => {
  const response = await fetch(`${base}/api/does-not-exist`);
  assert(response.status === 404, `status ${response.status}`);
  const data = await response.json();
  assert(data.ok === false, 'not a JSON error');
  return data.error;
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');

