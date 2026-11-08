# Source and downstream research

Evidence date: 2026-11-08. A host name is not a working integration. Only Reanime is promoted to
playback. Everything else is registered, documented and inactive unless a dated browser test shows
a permitted stream starting.

## Anime catalogue / discovery candidates

| Candidate | Role | Status | Dated evidence |
| --- | --- | --- | --- |
| Reanime | Catalogue + Flixcloud embed | **ENABLED** | `/api/flix/{aniListId}/{episode}` returns a per-audio embed; Chromium playback and Mark watched verified. |
| AniChan | Worker metadata | **METADATA ONLY** | `/api/watch/servers` returns an empty list for every tested title; it is attempted only as a fallback and never presented as working. |
| AnimePahe | Catalogue + native player | **BLOCKED** | Homepage returned 403 from Cloudflare with `X-Frame-Options: SAMEORIGIN`; its resolver is WebView-only. No bypass attempted. |
| KickAssAnime | Catalogue + CDN | **UNAVAILABLE** | `kickassanime.am` returned 410 Gone; the CDN needs `Referer` and `Origin`, which a browser cannot forge. |
| AllAnime | Catalogue + native player | **BLOCKED** | CAPTCHA and proof-of-work gates; registered as native-only. No bypass attempted. |
| HiAnime | Catalogue | **UNVERIFIED** | No response to a plain homepage probe and no permitted public API identified. No adapter added and no guessed endpoint hardcoded. |
| Miruro (and child ids) | Catalogue / pipe | **UNAVAILABLE** | The pipe refuses datacenter IPs and sends no CORS headers; embeds remain unverified. |
| ToonHub | WordPress catalogue | **UNVERIFIED** | WordPress REST search answers, but the player host and iframe policy were not confirmed. Inactive. |

## Downstream embed indexes and player hosts

These are not selectable servers. A catalogue adapter must first produce a title/episode-specific
id for the host. The same registry is served read-only at `GET /api/providers` as `downstreams`.

| Host | Role | Status | Observed on 2026-11-08 |
| --- | --- | --- | --- |
| Flixcloud | Player host | **IN USE** | Reanime embed loads and plays in Chromium; no `X-Frame-Options` or blocking `frame-ancestors`. |
| VidSrc | Embed index | **IN USE (fallback)** | AniZip maps AniList id/episode to TMDB; embed page 200, no frame blocking. Iframe loads; media startup needs a user test. |
| Vidstream | Player host | Embeddable, unmapped | Homepage 200, no frame blocking. Requires a host-specific id from a source. |
| VidCloud / VidWish | Player host | Unverified | No current first-party origin confirmed; alias claims were not treated as fact. |
| MegaCloud | Player host | Iframe blocked | Homepage 200 with `X-Frame-Options: SAMEORIGIN`. |
| Streamtape | Player host | Embeddable, unmapped | Homepage 200, no frame blocking. Approved API scope and rights not established. |
| Filemoon | Player host | Embeddable, unmapped | Homepage 200, no frame blocking. Requires a file or embed id. |
| Vidmoly | Player host | Requires auth | Homepage 401. Authentication was not bypassed. |
| MP4Upload | Player host | Iframe blocked | Homepage 200 with `X-Frame-Options: SAMEORIGIN`. |

## VidSrc-style embed aggregators

These accept a TMDB or IMDb id. AniZip supplies the mapping. They are separate anonymous fallback
servers, not defaults.

| Aggregator | Status | Evidence |
| --- | --- | --- |
| VidSrc | **ENABLED** | AniZip -> TMDB; embed page 200, no frame blocking; iframe loads. User playback test pending. |
| VidLink | **ENABLED** | AniZip -> TMDB; Chromium loaded a video element with the correct title and timestamps. |
| VidFast | **ENABLED** | AniZip -> TMDB; Chromium loaded a video element with fetch/subtitle controls. User playback test pending. |
| 2Embed | **ENABLED** | AniZip -> IMDb; 2embed.skin exposes the player embed. User playback test pending. |
| VidNest | **BLOCKED** | Browser tunnel failed with `ERR_TUNNEL_CONNECTION_FAILED`; not added. |
| VixSrc | **BLOCKED** | Player page opened an ad/popunder redirect in the test browser; not added. |
| MultiEmbed / SuperEmbed | Unverified | Redirects to `streamingnow.mov` with a generated play token; not added. |
| SmashyStream, AutoEmbed, MoviesAPI, Embed.su | Unreachable | Plain fetch failed; no adapter. |
| Frembed | Unverified | API endpoint returned 401/Loading; no adapter. |

## WCostream

`wcostream.tv` was tested on 2026-11-08. The plain Worker request receives Cloudflare's 403
"Just a moment" challenge, and the page sets `X-Frame-Options: SAMEORIGIN`. A real browser can load
the page and exposes an embed such as
`https://embed.wcostream.com/inc/embed/index.php?file=...&h=...&t=...`, but the `h`/`t` values are
page-generated and the embed is not constructible from an AniList id. Using a browser clearance
cookie or a proxy would bypass Cloudflare, so no adapter was added. Its Chromecast player does not
change that: the app still needs the signed per-episode page first.

## Why only one additional adapter was added

VidSrc was added because AniZip supplies a real AniList-to-TMDB episode mapping and the embed page
is reachable without bypassing a challenge. The other hosts above either require a source-specific
file id, block framing, require authentication, or have no permitted mapping.

The assignment permits a new adapter only where usage is allowed and a real test demonstrates
successful permitted playback. None of the remaining candidates produced that evidence without
bypassing a challenge, forging headers or inventing an endpoint. The resolver therefore keeps its
existing adapters and marks the rest honestly. Adding an adapter later means updating
`worker/adapters/index.ts`, the registry evidence and this table, then proving media startup in a
browser.
