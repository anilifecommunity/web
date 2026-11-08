# Anilife Web

The browser/PWA client for Anilife. It shares the Anilife product semantics and provider
catalogue with the Android app, but uses browser conventions: real URLs, IndexedDB, a PWA shell
and a small Cloudflare Worker for metadata mediation.

- Production: `https://anilife.cc` (`www` redirects to the apex)
- Preview: `https://anilife-web.adfreegames.workers.dev`
- Reference app (read-only): `anilifecommunity/android-and-tv`

## Architecture

```
AniList / media-index  ->  metadata + episode lists     (browser or Worker)
        |
provider registry (42 servers, honest status per source)
        |
resolver (Worker) -> normalized PlaybackOffer v1 (streams or embed)
        |
player: native HLS/MP4, or a provider player in a sandboxed iframe
```

- The Worker is a **control plane**: it resolves provider metadata from fixed origins. It is not a
  media proxy and accepts no caller-supplied URL.
- Playback is **embed-only** today: the working source (Reanime) returns a Flixcloud player page.
- **Episode downloads are intentionally disabled.** There is no Downloads tab, no download action
  in the detail page or player, and `/downloads` redirects home.
- Local data (profiles, settings, history, library) lives in `localStorage` with an IndexedDB
  mirror and a versioned migration. No Anilife account or central user database exists.

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

`wrangler.jsonc` serves the Vite build through Workers Static Assets and runs the Worker first so
security headers apply to every response. Preview hosts ending in `.workers.dev` are sent
`X-Robots-Tag: noindex`. See `OPERATIONS.md` for secrets, rollback and the Turnstile/AniList setup.

## Documentation

- `PROVIDERS.md` - the 42 provider entries and their real web status
- `OPERATIONS.md` - secrets, deploy, rollback, OAuth and Turnstile
- `RELEASE.md` - release gates and known limitations
- `SECURITY.md` - security model and reporting
- `PRIVACY.md` - what is stored and what leaves the device

## Licence

MIT No Attribution (MIT-0). See `LICENSE`. Third-party metadata, posters and media remain the
property of their owners and are fetched at runtime.
