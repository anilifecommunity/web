# Anilife Web

The browser/PWA client for Anilife. It shares the Anilife product semantics and provider
catalogue with the Android app, but uses browser conventions: real URLs, IndexedDB, a PWA shell
and a small Cloudflare Worker for metadata mediation.

Current release: **0.1.3** (2026-11-23). The signed Android/TV download index also publishes
stable **0.1.3** with six ABI/form-factor artifacts.

- Production: `https://anilife.cc` (`www` redirects to the apex)
- Public `workers.dev` and preview URLs are disabled; production uses the two custom domains only.
- Reference app (read-only): `anilifecommunity/android-and-tv`

## Architecture

```
AniList / media-index  ->  metadata + episode lists     (browser or Worker)
        |
provider registry (44 candidates, four browser-eligible sources)
        |
resolver (Worker) -> normalized PlaybackOffer v1 (streams or embed)
        |
player: native HLS/MP4, or a provider-owned cross-origin player
```

- The Worker is a **control plane**: it resolves provider metadata from fixed origins. It is not a
  media proxy and accepts no caller-supplied URL.
- Playback uses automatic fallback across four browser-verified sources. The UI keeps their
  identities private as stable Server 1-4, with Zoko first; the optional Servers drawer exposes only
  those anonymous choices.
- **Episode downloads are intentionally disabled.** The first-class `/downloads` route distributes
  the six signed Android/TV APKs; it never exposes or downloads episode media.
- Local data (profiles, settings, history, library) lives in `localStorage` with an IndexedDB
  mirror and a versioned migration. The isolated account/D1 Cloud Sync API is available for
  reviewed clients; user-facing Cloud Sync remains opt-in and disabled until the local-first Web
  reconciliation client passes its staged release gates.

## Quick start

```bash
npm install
npm run dev         # Vite on 5173, proxies /api to 127.0.0.1:8787
npm run dev:worker  # Wrangler dev on 8787
```

Public build identifiers go in `.env.local` (see `.env.example`):

```
VITE_ANILIST_CLIENT_ID=...
VITE_TURNSTILE_SITE_KEY=...
```

Local Worker secrets go in `.dev.vars` (gitignored):

```
TURNSTILE_SECRET=...
GATE_SIGNING_KEY=...
```

## Checks

```bash
npm run lint     # app + worker TypeScript
npm test         # unit tests (resolver, backup, IndexedDB, guards, adapters)
npm run build
npm run smoke    # against a deployed URL
```

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy:worker
```

`wrangler.jsonc` serves the Vite build through Workers Static Assets. HTML, APIs, protected routes
and errors run through the Worker; immutable same-origin assets bypass Worker execution and receive
their static security/cache headers from `public/_headers`. See `OPERATIONS.md` for secrets,
rollback and the Turnstile/AniList setup.

## Documentation

- `docs/PROVIDERS.md` - the four eligible sources and current exclusion evidence
- `docs/OPERATIONS.md` - secrets, deploy, rollback, OAuth and Turnstile
- `docs/RELEASE.md` - release gates and known limitations
- `docs/SECURITY.md` - security model and reporting
- `docs/CI_SECURITY.md` - CI, CodeQL, Dependabot and GitHub settings
- `docs/PRIVACY.md` - what is stored and what leaves the device
- `docs/ANDROID_PARITY.md` - the Android-to-web parity plan
- `docs/PROVIDER_MATRIX.md` - dated provider evidence
- `docs/SOURCES.md` - source and downstream host research
- `docs/DISCORD.md` - Discord Activity and Rich Presence setup
- `docs/CLOUD_SYNC.md` - the isolated account/sync boundary and rollout state
- `CHANGELOG.md` - release history

## Licence

MIT No Attribution (MIT-0). See `LICENSE`. Third-party metadata, posters and media remain the
property of their owners and are fetched at runtime.
