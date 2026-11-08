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
| VidSrc | Embed index | Embeddable, unmapped | Homepage 200, no frame blocking. No verified anime title/episode mapping or permitted API. |
| Vidstream | Player host | Embeddable, unmapped | Homepage 200, no frame blocking. Requires a host-specific id from a source. |
| VidCloud / VidWish | Player host | Unverified | No current first-party origin confirmed; alias claims were not treated as fact. |
| MegaCloud | Player host | Iframe blocked | Homepage 200 with `X-Frame-Options: SAMEORIGIN`. |
| Streamtape | Player host | Embeddable, unmapped | Homepage 200, no frame blocking. Approved API scope and rights not established. |
| Filemoon | Player host | Embeddable, unmapped | Homepage 200, no frame blocking. Requires a file or embed id. |
| Vidmoly | Player host | Requires auth | Homepage 401. Authentication was not bypassed. |
| MP4Upload | Player host | Iframe blocked | Homepage 200 with `X-Frame-Options: SAMEORIGIN`. |

## Why no additional adapter was added

The assignment permits a new adapter only where usage is allowed and a real test demonstrates
successful permitted playback. None of the candidates above produced that evidence without
bypassing a challenge, forging headers or inventing an endpoint. The resolver therefore keeps its
existing three adapters and marks the rest honestly. Adding an adapter later means updating
`worker/adapters/index.ts`, the registry evidence and this table, then proving media startup in a
browser.
