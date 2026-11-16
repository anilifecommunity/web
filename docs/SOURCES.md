# Source and downstream research

Evidence date: 2026-11-15. A reachable page is not a working integration. Anilife enables a source
only after a permitted, stable title/episode route starts the correct media in a real browser.

## Enabled source paths

| Source path | Role | Status | Evidence |
| --- | --- | --- | --- |
| Zoko | MAL episode iframe | **ENABLED** | One Piece episode 1 sub and dub loaded 24:37 media, played beyond five minutes, and emitted documented progress events in Chromium. |
| Reanime to Flixcloud | Catalogue metadata + player host | **ENABLED** | The Worker resolved One Piece episode 1 sub and dub; Chromium played both beyond five minutes. |
| AnimeEmbed | AniList episode iframe | **ENABLED** | One Piece episode 1 sub and dub loaded 24:37 media, played beyond five minutes, and emitted versioned progress events. |
| AniZip to VidLink | AniList-to-TMDB mapping + embed index | **ENABLED** | One Piece episode 1 mapped to the correct 24:37 player and media advanced. First interactions opened third-party advertising tabs. |

Flixcloud is downstream-only and is never exposed as a separate server. The product shows all four
source paths anonymously as Server 1 through Server 4.

## Fresh browser failures

| Candidate | Result |
| --- | --- |
| VidSrc | Correct outer episode route, but the child player became `about:blank`; no media. |
| 2Embed | Expected episode route returned a rate-limit page; no media. |
| AniLink | Documented route returned `stream-source-unavailable`. |
| Vidy | Cloudflare challenge only. |
| JustPlay | Player reported it could not play media and remained at 0:00. |
| Aniweeb | Host returned 502. |

## Other inactive categories

The rest of the Web V2 matrix remains inactive where it lacks a stable permitted episode mapping,
requires a native app or WebView, is adult-only, is unreachable, or is blocked by authentication,
CAPTCHA, Cloudflare, DRM, framing or header requirements. Anilife does not forge `Referer` or
`Origin`, reuse clearance cookies, proxy arbitrary destinations, or guess private endpoints.

Downstream hosts are not selectable servers by themselves. A verified catalogue adapter must first
produce a title/episode-specific id, and the resulting player must pass a media-start browser test.

## Promotion checklist

Promoting a source requires all of the following:

1. A stable permitted title and episode mapping.
2. Correct sub/dub behavior without silently changing audio.
3. Successful media startup and seek in a current browser.
4. A bounded Worker adapter with fixed HTTPS origins and validated redirects.
5. Registry evidence, CSP updates, tests, and documentation.

See [PROVIDERS.md](PROVIDERS.md) for the active catalogue and product behavior.
