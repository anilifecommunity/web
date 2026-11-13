# Changelog

This file records user-visible changes to Anilife Web. Dates use UTC. A version stays marked
**Unreleased** until its GitHub release is published.

## [Unreleased]

## [0.1.0] - 2026-11-13

First stable Anilife Web release, aligned with Anilife Android/TV 0.1.0. This release covers the
browser and PWA client at `https://anilife.cc`.

### Added

- Production PWA with real routes for Home, Discover, Schedule, Library, Settings, Profiles,
  anime details and episode playback, including refresh and back/forward support.
- Local-first profiles with avatars, optional PIN privacy screen, kids mode and per-profile
  library, history and settings.
- AniList sign-in through the public implicit flow, with viewer sync and list status updates.
- Automatic playback fallback across enabled sources. The player starts with Reanime and can fall
  back to VidSrc, VidLink and 2Embed.
- Manual **Servers** drawer in the player. It lists enabled sources anonymously as Server 1, 2, 3
  and lets the viewer pin a different starting server without leaving playback.
- Release awareness: a not-yet-aired season or future episode now shows a clear message and never
  creates a player or calls a source.
- Discord Rich Presence through the official Embedded App SDK when Anilife is launched as a
  Discord Activity, including a Connect Discord install flow.
- One-time **About Anilife** notice with the hosting/indexing disclaimer and a close button.
- Single-profile mode under **Settings > Accounts & Sync** that skips the profile picker for
  viewers who only use one profile.
- Cloudflare Turnstile first-visit gate with a signed HttpOnly cookie, plus a **Proceed to Home**
  fallback after verification.
- IndexedDB mirror of local data and an Android-compatible backup v1 import/export.
- CI, advanced CodeQL, dependency review, Dependabot, secret scanning and a documented security
  checklist.

### Changed

- Reworked the player into a cinematic layout with a right-hand Up Next rail, compact transport,
  anonymous server labels, truthful loading/error states and keyboard controls.
- Replaced the Search filter placeholder with real format, year, score and sort controls whose
  state is kept in the URL.
- Made source identity anonymous in the player and Settings. Source management now lists only
  browser-capable servers, preserves explicit disables and records real evidence.
- Added a one-time catalogue migration so existing viewers receive newly added fallback servers.
- Bumped the service worker cache and disabled HTTP caching for `sw.js` and navigation HTML so
  releases reach browsers such as Brave promptly.
- Updated provider and downstream documentation with dated evidence, including WCostream,
  AnimeHeaven, ToonHub and the VidSrc-style embed aggregators.

### Fixed

- Removed the hard-coded AniList 162780 fallback. Unknown titles now show a safe error instead of
  opening an unrelated series.
- Fixed the startup flash and stuck Turnstile state. The gate no longer mounts Home before it is
  passed, verification now times out and rechecks status, and the fallback button appears only
  after verification starts.
- Fixed unreleased sequels being treated as Releasing. Episodes are limited to the next airing
  boundary and stale cached catalogues are invalidated.
- Fixed the player effect that could tear down native HLS after the manifest loaded; added bounded
  HLS recovery and a stream startup timeout.
- Removed duplicate or false UI such as the fake Discord link, fake demo server speeds, the
  duplicate profile entrance and the misleading local PIN wording.
- Fixed stale settings and service-worker shells leaving older browsers with only part of the
  server list.

### Security and privacy

- The Worker remains a metadata control plane with fixed upstream origins, redirect validation,
  private-address refusal, response-size caps and timeouts. It is not a media relay.
- CSP restricts frames to verified player origins and Discord, while Turnstile, the signed gate
  cookie and the per-IP limits protect `/api/resolve`.
- Discord uses a server-side code exchange with a Wrangler secret; the secret never enters the
  bundle or Git. Activity playback accepts a short-lived signed gate token when cookies are not
  persisted.
- Diagnostics default to OFF and never include titles, media URLs, tokens, cookies or identifiers.
- Code scanning reports zero open alerts. Dependency review, secret scanning, push protection,
  private vulnerability reporting and SHA-pinned Actions are enabled.
- The project is licensed under MIT-0.

### Known limitations

- Playback depends on third-party sources. Reanime is the only end-to-end verified player;
  VidSrc, VidLink and 2Embed are page-level verified embeds and still need real-user playback
  confirmation.
- Embedded players cannot report elapsed time, so progress is recorded when an episode starts and
  completion uses **Mark watched**.
- Native HLS/MP4 playback is implemented but has no verified live source.
- Many Android providers remain blocked by Cloudflare, CAPTCHA, header requirements or
  datacenter-IP filtering. WCostream is blocked by a Cloudflare challenge and signed embed values.
- AniList does not issue refresh tokens; reauthentication is expected.
- Episode downloads are disabled by product decision.

[Unreleased]: https://github.com/anilifecommunity/web/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anilifecommunity/web/releases/tag/v0.1.0
