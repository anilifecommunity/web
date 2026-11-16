# Providers

The registry mirrors the candidate catalogue supplied with Web V2. Only providers with a stable
title/episode mapping and a dated browser test that started the correct media are selectable.
Provider identities remain anonymous in the product UI as `Server 1`, `Server 2`, and so on.

## Catalogue v3

| UI order | Integration | Playback evidence |
| --- | --- | --- |
| Server 1 | Zoko MAL iframe | 2026-11-15, Chromium: One Piece episode 1 sub and dub loaded the correct 24:37 media, played beyond five minutes, and emitted progress events. |
| Server 2 | Reanime metadata to Flixcloud | 2026-11-15, Worker + Chromium: One Piece episode 1 sub and dub resolved and played beyond five minutes. |
| Server 3 | AnimeEmbed AniList iframe | 2026-11-15, Chromium: One Piece episode 1 sub and dub loaded the correct 24:37 media, played beyond five minutes, and its versioned events persisted progress. |
| Server 4 | VidLink through AniZip mapping | 2026-11-15, Chromium: One Piece episode 1 loaded the correct 24:37 media and playback advanced. Initial interactions opened advertising tabs, so the product displays a raw-player safety notice. |

Zoko is the default for a new viewer. An existing explicit choice is preserved when that server is
still enabled. Automatic fallback follows the viewer's enabled order.

Zoko and AnimeEmbed publish documented progress messages. The player accepts those messages only
from the selected iframe window, exact origin, expected channel and supported version. Providers
without a trustworthy progress contract never receive inferred completion.

## Tested but excluded

| Provider | Fresh result |
| --- | --- |
| VidSrc | The outer player mapped the right episode, but its child collapsed to `about:blank`; no media started. |
| 2Embed | The expected episode URL returned a rate-limit page instead of media. |
| AniLink | Its documented route returned `stream-source-unavailable`. |
| Vidy | The browser reached a Cloudflare challenge only. |
| JustPlay | The player stayed at 0:00 and reported that media could not play. |
| Aniweeb | The host returned 502. |

Flixcloud is a downstream player used by Server 2, not a separate selectable server. The remaining
matrix candidates have no stable permitted title/episode route, are native-only, adult-only,
blocked by source protections, or otherwise fail the eligibility prerequisite. They remain
inactive; Anilife does not bypass CAPTCHA, Cloudflare, DRM, authentication, framing policy or
header requirements.

## Rules

- Playback is automatic by default and bounded to the enabled server order.
- The viewer's explicit enable/disable choices survive catalogue migration.
- Server identities and host names are never rendered in the product UI.
- Audio is never silently swapped. A failed dub request remains a failure or falls through to a
  provider that can satisfy dub.
- Raw third-party players are unsandboxed so their controls can work. The product warns that they
  may show ads or pop-ups and links to Brave, Firefox, uBlock Origin and uBlock Origin Lite.
- New providers require dated evidence, registry metadata, a Worker adapter, CSP coverage, tests,
  and an update to this document.
- The Worker is a metadata control plane, not a media relay. Episode downloads remain disabled.

The full 82-row reconciliation and browser evidence are kept in the ignored private release
record. Public implementation status is also available from `GET /api/providers`.
