# Changelog

This file records user-visible changes to Anilife Web. Dates use UTC. A version stays marked
**Unreleased** until its GitHub release is published.

## [Unreleased]

## [0.1.3] - 2026-11-23

### Added

- Added a checksum-verified Media Index fallback for home, browse, search, details, schedules,
  related titles and episode evidence when live metadata services are unavailable.
- Added Continue Watching and Rewatching as first-class Library views with accurate counts and
  profile-scoped resume/removal actions.
- Added verified related manga, manhwa and other comics to anime details with cover artwork,
  relationship labels and safe AniList links.
- Expanded search across English, Romaji, native and alternative anime titles, plus verified anime
  relationships found through manga titles and aliases.
- Added a shared, accessible error experience for missing pages, access failures, rate limits,
  service outages, expired watch sessions and unreleased or unavailable episodes.

### Changed

- Merged local Anilife saves and playback history with AniList status, score, progress and title
  metadata without deleting local-only entries during account refreshes.
- Added discoverable mouse and keyboard controls to the Home Continue Watching rail while keeping
  native touch and trackpad scrolling.
- Made the English, Romaji and native title preference update anime and manga titles immediately,
  with one persistent Content setting controlling the related-manga shelf.
- Added a one-time stale catalogue and app-shell cache refresh while preserving profiles, settings,
  watch progress and sign-in data.
- Kept stable Server 1-4 numbering with Zoko first and removed unqualified adult candidates from
  public provider diagnostics and playback choices.

### Fixed

- Fixed false unreleased errors for long-running titles whose verified episode indexes exceed the
  old 128 KiB safety limit, while retaining a one MiB hard cap and fail-closed fallback checks.
- Fixed released movies and one-off specials being blocked when only verified finished-title
  metadata exists, while requiring exact dated evidence for sparse episodic indexes.
- Added a bounded mapped-catalogue release check for titles missing from the media index, and now
  distinguish a temporary release-verification outage from a confirmed unreleased episode.
- Kept Dub as the preferred first choice while automatically using Sub for anime without a listed
  English dub and for individual episodes whose enabled players only provide Sub.
- Explained automatic server fallbacks instead of silently changing the selected server.
- Centered the watch-status selector arrow consistently across browsers.
- Replaced the basic watch-status selector with a clearer in-app menu.
- Prevented episode thumbnails from overlapping titles on narrow screens.
- Made desktop episode cards a consistent height so artwork cannot resize or cover their titles.
- Removed the duplicate desktop player scrollbar by locking the background and keeping the episode list independently scrollable.
- Stabilized watch-progress saves, flush progress when playback is paused or the page closes, and
  prevent repeated or regressing AniList progress updates.
- Prevented late episode and skip-metadata responses from overwriting the title or episode currently
  open in the player.
- Fully remove a deleted profile's Library, Continue Watching and search data, and require the
  current local PIN before editing a PIN-protected profile.
- Return genuine HTTP 404 pages for unknown routes, include correct `Allow` headers for unsupported
  methods, and preserve server-supplied rate-limit cooldowns in retry controls.
- Prevent a saved Dub preference from forcing Dub on titles verified as Sub-only, including after
  reloading a protected watch route.

### Security and reliability

- Verified every Media Index pointer, manifest and record against fixed trusted origins, exact byte
  counts, SHA-256 checksums, schema compatibility and source-rights policy before using it.
- Kept the last verified Media Index release available offline without replacing it with failed,
  empty or older responses, and prevent mixed-release catalogue reads.
- Replaced public watch URLs with opaque, session-bound routes whose encrypted authorization stays
  out of the URL and is required by the playback resolver.
- Blocked third-party framing by default while isolating the verified Discord Activity exception
  to `/activity`.
- Made first-visit sessions unique per browser, denied copied/tampered/expired watch sessions, and
  ensured share actions expose only public anime detail links.
- Kept existing verified browsers working through the security migration and made each anime reuse
  one persistent browser-bound authorization across episodes and restarts without four-hour prompts.
- Kept released episodes playable when AniList rejects Cloudflare Worker requests by verifying
  their air dates against Anilife's static media index.
- Added bounded AniList timeouts/retries and ordered IndexedDB mirrors so transient failures cannot
  leave browser storage permanently stuck or resurrect deleted profile data.
- Bound every Worker request and provider fallback walk by total time and body size, reject
  malformed episode and JSON input early, and attach privacy-safe request IDs to failures.
- Prevent non-HTML navigation responses from replacing the offline app shell, and derive each
  service-worker cache revision from the deployed build so upgrades and rollbacks stay coherent.
- Kept PKCE verification in both Discord OAuth exchange modes, require a successful Discord
  playback gate before reporting readiness, and removed inline-script permission from the CSP.
- Applied a no-referrer policy to pages and embedded players, limited frame sources to active
  player origins, and reject cross-origin Discord token and gate requests.
- Reduced public download-index origin work with a bounded five-minute shared cache while retaining
  byte-identical responses, monotonic publishing and the D1-enforced 75 percent R2 hard stop.
- Disabled public `workers.dev` and preview URLs, and moved immutable assets off the Worker request
  path without weakening their security or cache headers.

## [0.1.2] - 2026-11-16

### Added

- Added a first-class `/downloads` route for the six signed Android and Android TV APKs from the
  validated stable release index, including responsive navigation and fail-closed retry states.
- Added Zoko and AnimeEmbed player adapters with strict, origin-checked progress events.
- Added a visible Help link to `docs.anilife.cc` and raw-player safety guidance for Brave, Firefox,
  uBlock Origin and uBlock Origin Lite.

### Changed

- Reworked the Home, Discover, Library, Schedule, details and player experiences into one compact,
  artwork-led responsive design for desktop, tablet and phone.
- Added restrained gradients, highlights and accent glows to primary actions and selected states.
- Rebuilt playback around four browser-proven anonymous sources. Zoko is Server 1 and the default;
  existing explicit source choices remain preserved.
- Replaced invented episode totals, runtimes, badges, progress and demo catalogue entries with
  AniList-backed or explicitly unknown states.

### Fixed

- Prevented upcoming, unknown and stale episode links from opening unrelated or unaired media.
- Removed inert notifications, context menus and profile entrances, and made visible navigation,
  details, sharing, filtering and source controls functional and keyboard accessible.
- Fixed the intro preference lookup, mobile header behavior, deep-route recovery and catalogue
  migrations for the v3 source list.
- Persisted the v3 server migration back to browser storage, fixed the service-worker registration
  race, and reloads once when a new worker takes control so Brave cannot remain on an old bundle.

### Security and reliability

- Kept all playback resolution behind fixed provider ids and fixed HTTPS origins; no arbitrary
  proxy or browser-side GitHub API access was introduced.
- Preserved the HMAC-authenticated release-index publisher, byte-identical public endpoint and
  D1-backed 75 percent R2 usage hard stop.
- Verified TypeScript, 120 tests, production build, Worker smoke, responsive accessibility checks,
  Firefox and WebKit behavior before release.

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

[Unreleased]: https://github.com/anilifecommunity/web/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/anilifecommunity/web/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/anilifecommunity/web/releases/tag/v0.1.2
[0.1.0]: https://github.com/anilifecommunity/web/releases/tag/v0.1.0
