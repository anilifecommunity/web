# Operations

## Hosts

- Production: `https://anilife.cc` and `https://www.anilife.cc` (www redirects to the apex)
- Public `workers.dev` and Wrangler preview URLs are disabled in `wrangler.jsonc`.
- Never use a `beta.anilife.cc` hostname.

`wrangler.jsonc` declares both production hosts as custom domains, so `npm run deploy:worker`
deploys production. An isolated public staging environment requires a separately named Worker,
routes and secrets; do not treat a production version upload as a public preview.

## Secrets

Set once per Worker:

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put GATE_SIGNING_KEY
npx wrangler secret put WATCH_TOKEN_KEY
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put DISCORD_CLIENT_SECRET
```

`GATE_SIGNING_KEY` should be at least 32 random bytes, base64url encoded. Rotating it invalidates
existing gate cookies (visitors see the check once more).

`WATCH_TOKEN_KEY` should also be at least 32 random bytes and is used only by the Worker. For a
zero-downtime rotation, first set the old value as `WATCH_TOKEN_PREVIOUS_KEY`, replace
`WATCH_TOKEN_KEY`, deploy, wait one year (the maximum verified-browser lifetime), then delete the
previous secret. Never put either value in a `VITE_*` variable, URL, log or browser store.

Local development reads the same names from gitignored `.dev.vars`.

`BETTER_AUTH_SECRET` is an independently generated value of at least 32 random bytes. It must not
reuse a gate, watch or release-publisher key. `DISCORD_CLIENT_SECRET` is issued by Discord and
cannot be replaced with a locally generated value. Cloud account sessions fail closed unless both
secrets and the dedicated `ANILIFE_CLOUD_DB` binding exist.

## Cloud Sync D1

Cloud account data uses the dedicated `ANILIFE_CLOUD_DB` binding and
`migrations/cloud-sync/`. It must never point at `RELEASE_INDEX_USAGE`.

`SYNC_CURSOR_KEY` is a separate Wrangler secret for account-bound cursors and session-bound CSRF
values. Generate independent random values for staging and production and never store them in a
vars file. Rotating this key invalidates outstanding cursors and CSRF values, so schedule rotation
as a documented client re-bootstrap window.

Before a remote migration, record a Time Travel bookmark, apply to the isolated staging database,
run `PRAGMA foreign_key_check`, and only then repeat for production:

```bash
npx wrangler d1 time-travel info ANILIFE_CLOUD_DB --json
npx wrangler d1 migrations apply ANILIFE_CLOUD_DB --remote
npx wrangler d1 execute ANILIFE_CLOUD_DB --remote --command "PRAGMA foreign_key_check;"
```

Migration files are immutable after either environment records them. Corrections are new numbered
migrations. A Worker rollback does not roll back D1; use the recorded bookmark only after reviewing
the database-wide consequence.

## Cloudflare Turnstile

- Widget `Anilife Web`, managed mode, domains `anilife.cc` and `www.anilife.cc`.
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

The build is served through Workers Static Assets. The Worker runs first for HTML, APIs, protected
routes and errors. Immutable `/assets/*` files and a small allowlist of public static files bypass
Worker execution and receive their static security/cache headers from `public/_headers`.

## Rollback

```bash
npx wrangler deployments list
npx wrangler rollback <version-id>
```

Rolling back code does not roll back browser data. If rolling back across the secure-watch
cutover, keep `WATCH_TOKEN_KEY` configured until the previous deployment is stable; viewers may
need to reopen an anime page to obtain a route understood by the restored version. IndexedDB and localStorage schemas must stay
backward compatible with the previous code; the current storage layer only adds a mirror and never
deletes legacy keys.

## Rate limits

The Worker applies per-isolate limits: 30 resolver calls per minute, 20 watch-session creations per
minute, 10 gate verifications per minute and 60 AniList requests per minute per client IP. Zone-level
rate-limiting is configured separately from these fail-closed application checks and must be
verified against the account's current plan before changing it.

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
