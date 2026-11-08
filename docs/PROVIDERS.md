# Providers

The registry mirrors the 42 Android servers (the historical `xfdm`/lili entry is intentionally
removed). Settings lists only servers that are verified for browser playback; unverified,
native-only and unavailable entries stay registered but are never offered or queried.

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
`onepace`, plus the Miruro embed children (`nun`, `bun`, `cog`, `twin`, `telli`). HiAnime is
documented as an unverified candidate in [SOURCES.md](SOURCES.md) but is not a registered server.

These are registered but not offered for playback. Promoting one requires a dated browser check of
the manifest, a variant and a segment with seek, not a metadata 200.

## Rules

- Playback is automatic. The player sends the enabled server order and never shows a per-episode
  server picker. A failed server falls through to the next enabled server within one bounded request.
- The viewer's enabled set and priority are the only source controls. Empty or absent settings mean
  "all web-capable servers enabled"; an explicit disable is never reverted.
- Server identities stay anonymous in the UI (`Server 1`, `Server 2`). Only Settings shows which
  servers are enabled, and it lists just browser-verified entries.
- Audio is never silently swapped. A dub request that only has a sub is an explicit failure.
- Downstream player hosts (VidSrc, Vidstream, MegaCloud, Streamtape, Filemoon, Vidmoly, MP4Upload)
  are not servers. They require a source-specific file/embed id and are tracked in
  [SOURCES.md](SOURCES.md).
- Never add a source without updating this file and the registry evidence.
- A media relay requires a separate ADR covering rights, cost, abuse and takedown handling.
- Episode downloads are disabled on web by product decision.
