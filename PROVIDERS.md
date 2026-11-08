# Providers

The registry mirrors the 42 Android servers (the historical `xfdm`/lili entry is intentionally
removed). A provider appears in Settings regardless of status, but only `browser-direct`,
`worker-metadata-only` and `iframe` entries are attempted.

## Working

| Provider | Path | Playback | Evidence |
| --- | --- | --- | --- |
| Reanime | Worker reads `/api/flix/{anilistId}/{episode}`, picks the sub/dub face | Flixcloud player in an iframe | 2026-11-08, Chromium: Solo Leveling and Overgeared play; Mark watched writes Continue Watching |

The iframe cannot report elapsed time, so progress is explicit: opening an episode records it as
started, and **Mark watched** records completion.

## Blocked by the source, not by code

| Provider | Why |
| --- | --- |
| Zoko | Master, variant and segment require `Referer: https://zokoanime.video/`; a browser cannot set it |
| Miruro (14 ids) | The pipe refuses datacenter IPs and sends no CORS headers; a Worker cannot resolve it |
| KAA | The CDN requires both `Referer` and `Origin` |
| AnimeOnsen | DASH, and the CDN requires `Referer` |
| AniChan | `/api/watch/servers` returns an empty list for every title tested |
| AnimeHeaven | Full chain works from a residential client; worker egress receives a no-results page |
| AnimeGG | Direct MP4 needs the embed cookie and Referer, and a direct file would be downloadable |
| AniDB App | `play.anidb.app` no longer resolves in DNS |
| AllAnime | CAPTCHA and proof-of-work |
| AnimePahe, Hanime | WebView-only resolvers |
| ToonHub / ToonStream | ToonStream presents a human-verification interstitial |

## Unverified

`anipm`, `rareanimes`, `anikoto`, `animekai`, `anizone`, `anineko`, `2dhive`, `animedekho`,
`toonhub`, `uniquestream`, `animekhor`, `kartoons`, `animeav1`, `rift`, `hentaihaven`, `hstream`,
`onepace`, plus the Miruro embed children (`nun`, `bun`, `cog`, `twin`, `telli`).

These are registered but not offered for playback. Promoting one requires a dated browser check of
the manifest, a variant and a segment with seek, not a metadata 200.

## Rules

- The viewer's explicit provider is attempted first; fallback happens only when allowed.
- Audio is never silently swapped. A dub request that only has a sub is an explicit failure.
- Never add a source without updating this file and the registry evidence.
- A media relay requires a separate ADR covering rights, cost, abuse and takedown handling.
- Episode downloads are disabled on web by product decision.
