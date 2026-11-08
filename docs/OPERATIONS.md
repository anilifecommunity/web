# Operations

## Hosts

- Production: `https://anilife.cc` and `https://www.anilife.cc` (www redirects to the apex)
- Preview: `https://anilife-web.adfreegames.workers.dev` (Worker `anilife-web`)
- Never use a `beta.anilife.cc` hostname.

`wrangler.jsonc` declares both production hosts as custom domains, so `npm run deploy:worker`
deploys production. For an isolated preview, upload a version without promoting it:

```bash
npx wrangler versions upload
```

## Secrets

Set once per Worker:

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put GATE_SIGNING_KEY
```

`GATE_SIGNING_KEY` should be at least 32 random bytes, base64url encoded. Rotating it invalidates
existing gate cookies (visitors see the check once more).

Local development reads the same names from gitignored `.dev.vars`.

## Cloudflare Turnstile

- Widget `Anilife Web`, managed mode, domains `anilife.cc`, `www.anilife.cc` and the workers.dev
  preview host.
- The public site key is a build value: `VITE_TURNSTILE_SITE_KEY`.
- The secret is a Worker secret: `TURNSTILE_SECRET`.
- With no secrets configured the gate steps aside only when `APP_ENV` is not `production`.
  Deployed Workers carry `APP_ENV=production` from `wrangler.jsonc`; in that mode a missing secret
  makes `/api/resolve` fail closed with 503. Local development and CI start Wrangler with
  `--var APP_ENV:test`.

## AniList OAuth

The web client uses the implicit grant: no client secret exists.

1. In the AniList application settings, register the exact callback:
   `https://<host>/auth/callback.html` for every host you use.
2. Set `VITE_ANILIST_CLIENT_ID` to the public application id and rebuild.
3. The callback page reads the token from the URL fragment and clears it from the address bar.

AniList does not provide refresh tokens. Viewers sign in again when a token expires.

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy:worker
```

The build is served through Workers Static Assets with `run_worker_first: true`, so CSP and the
security headers apply to HTML and assets as well as the API.

## Rollback

```bash
npx wrangler deployments list
npx wrangler rollback <version-id>
```

Rolling back code does not roll back browser data. IndexedDB and localStorage schemas must stay
backward compatible with the previous code; the current storage layer only adds a mirror and never
deletes legacy keys.

## Rate limits

The Worker applies per-isolate limits: 30 resolver calls per minute, 10 gate verifications per
minute and 60 AniList requests per minute per client IP. Add Cloudflare edge rate limiting for a
public launch if traffic warrants it.

## Monitoring

Check `/api/health` (gate state and implemented adapters) and Cloudflare Worker request/error
metrics. Do not log tokens, media URLs or request headers. The local diagnostics panel exports
redacted codes only.

## Costs

A light Worker plus static assets normally fits the free or low tier. Provider embeds load media
from their own hosts, so bandwidth is not billed to this Worker. Do not add a media relay without a
separate cost and rights review.

## Provider checks

`npm run smoke` verifies the API, shell, CSP, PWA files, the OAuth callback and the SSRF refusal.
Provider playback is verified manually in a browser and recorded in `PROVIDERS.md`.
